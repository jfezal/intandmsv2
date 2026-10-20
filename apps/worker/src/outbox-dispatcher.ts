import { createPrismaClient } from '@intandms/database';
import { LocalManagedBlobStore, resolveManagedStorageRoot } from '@intandms/storage';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ensurePreviewArtifact, indexDocumentVersion } from './index-version';
import { publishUploadSession } from './publish-upload';
import { enqueueDueScans, scanIndexedRepository } from './scan-indexed';

const valkeyUrl = process.env.VALKEY_URL ?? 'redis://127.0.0.1:6380';
const storageRoot = resolveManagedStorageRoot(process.env.MANAGED_STORAGE_ROOT);

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 5 * 60_000;

type Db = ReturnType<typeof createPrismaClient>;
type OutboxRow = Awaited<ReturnType<Db['outboxEvent']['findMany']>>[number];

export async function startOutboxDispatcher(): Promise<() => Promise<void>> {
  const db = createPrismaClient();
  const connection = new IORedis(valkeyUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('intandms-jobs', { connection });
  const blobStore = new LocalManagedBlobStore(storageRoot);
  // In-memory only: failed events stay undispatched in the table and are retried after a restart.
  const failures = new Map<string, { attempts: number; retryAt: number }>();
  let running = false;

  console.log(`[outbox] managed storage root ${storageRoot}`);

  async function handle(event: OutboxRow): Promise<void> {
    if (event.eventType === 'upload.scan_requested') {
      const payload = event.payload as { uploadSessionId?: string };
      if (payload.uploadSessionId) {
        await publishUploadSession(db, blobStore, payload.uploadSessionId);
      }
    }

    if (event.eventType === 'repository.index_scan_requested') {
      const payload = event.payload as { repositoryId?: string };
      if (payload.repositoryId) {
        await scanIndexedRepository(db, payload.repositoryId);
      }
    }

    if (event.eventType === 'document.version.index_requested') {
      const payload = event.payload as { versionId?: string; mimeType?: string };
      if (payload.versionId) {
        await indexDocumentVersion(db, blobStore, payload.versionId, payload.mimeType);
      }
    }

    if (event.eventType === 'document.version.preview_requested') {
      const payload = event.payload as { versionId?: string; mimeType?: string };
      if (payload.versionId) {
        const version = await db.documentVersion.findUnique({
          where: { id: payload.versionId },
          include: { storageObject: true },
        });
        if (version?.storageObject) {
          const document = await db.document.findFirst({
            where: { currentVersionId: version.id },
            select: { displayName: true },
          });
          await ensurePreviewArtifact(
            db,
            blobStore,
            version.id,
            payload.mimeType ?? version.mimeType,
            version.storageObject.storageKey,
            document?.displayName,
          );
        }
      }
    }

    await queue.add(event.eventType, event.payload as object, {
      jobId: event.id,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });

    await db.outboxEvent.update({
      where: { id: event.id },
      data: { dispatchedAt: new Date() },
    });
  }

  async function tick(): Promise<void> {
    const now = Date.now();
    const backingOff = [...failures].filter(([, f]) => f.retryAt > now).map(([id]) => id);
    const events = await db.outboxEvent.findMany({
      where: { dispatchedAt: null, ...(backingOff.length ? { id: { notIn: backingOff } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    for (const event of events) {
      try {
        await handle(event);
        failures.delete(event.id);
      } catch (error) {
        const attempts = (failures.get(event.id)?.attempts ?? 0) + 1;
        const delay = Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
        failures.set(event.id, { attempts, retryAt: Date.now() + delay });
        console.error(
          `[outbox] ${event.eventType} ${event.id} failed (attempt ${attempts}, retry in ${Math.round(delay / 1000)}s)`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    tick()
      .catch((error: unknown) => console.error('[outbox] poll failed', error))
      .finally(() => {
        running = false;
      });
  }, 2000);

  const scheduleTimer = setInterval(() => {
    enqueueDueScans(db)
      .then((queued) => {
        if (queued > 0) console.log(`[scan] queued ${queued} scheduled scan(s)`);
      })
      .catch((error: unknown) => console.error('[scan] scheduler failed', error));
  }, 60_000);

  return async () => {
    clearInterval(timer);
    clearInterval(scheduleTimer);
    await queue.close();
    await connection.quit();
    await db.$disconnect();
  };
}
