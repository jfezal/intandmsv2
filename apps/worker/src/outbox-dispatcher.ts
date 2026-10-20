import { createPrismaClient } from '@intandms/database';
import { LocalManagedBlobStore } from '@intandms/storage';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

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
        if (event.eventType === 'document.version.index_requested') {
          const payload = event.payload as {
            versionId?: string;
            mimeType?: string;
          };
          if (payload.versionId) {
            const version = await db.documentVersion.findUnique({
              where: { id: payload.versionId },
              include: { storageObject: true },
            });
            if (version?.storageObject) {
              let text = '';
              if ((payload.mimeType ?? version.mimeType).startsWith('text/')) {
                const bytes = await blobStore.readBytes(version.storageObject.storageKey);
                text = bytes.toString('utf8').slice(0, 32_000);
              } else {
                text = `${version.mimeType} ${version.sha256}`;
              }
              await db.searchChunk.upsert({
                where: {
                  documentVersionId_chunkIndex: {
                    documentVersionId: version.id,
                    chunkIndex: 0,
                  },
                },
                create: {
                  documentVersionId: version.id,
                  chunkIndex: 0,
                  textContent: text,
                },
                update: { textContent: text },
              });
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
