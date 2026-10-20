import { createPrismaClient } from '@intandms/database';
import { LocalManagedBlobStore } from '@intandms/storage';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ensurePreviewArtifact, indexDocumentVersion } from './index-version';
import { publishUploadSession } from './publish-upload';
import { scanIndexedRepository } from './scan-indexed';

const valkeyUrl = process.env.VALKEY_URL ?? 'redis://127.0.0.1:6380';
const storageRoot = process.env.MANAGED_STORAGE_ROOT ?? './data/managed';

export async function startOutboxDispatcher(): Promise<() => Promise<void>> {
  const db = createPrismaClient();
  const connection = new IORedis(valkeyUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('intandms-jobs', { connection });
  const blobStore = new LocalManagedBlobStore(storageRoot);

  const timer = setInterval(() => {
    void (async () => {
      const events = await db.outboxEvent.findMany({
        where: { dispatchedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      for (const event of events) {
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
              await ensurePreviewArtifact(
                db,
                version.id,
                payload.mimeType ?? version.mimeType,
                version.storageObject.storageKey,
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
    })().catch((error: unknown) => {
      console.error('[outbox] dispatch failed', error);
    });
  }, 2000);

  return async () => {
    clearInterval(timer);
    await queue.close();
    await connection.quit();
    await db.$disconnect();
  };
}
