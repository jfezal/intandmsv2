import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { startOutboxDispatcher } from './outbox-dispatcher';

const valkeyUrl = process.env.VALKEY_URL ?? 'redis://127.0.0.1:6380';

const connection = new IORedis(valkeyUrl, {
  maxRetriesPerRequest: null,
});

let stopOutbox: (() => Promise<void>) | null = null;

const worker = new Worker(
  'intandms-jobs',
  async (job) => {
    console.log(`[worker] completed job ${job.id} (${job.name})`);
  },
  { connection },
);

worker.on('ready', () => {
  console.log('[worker] BullMQ worker ready');
});

worker.on('failed', (job, error) => {
  console.error(`[worker] job ${job?.id ?? 'unknown'} failed`, error);
});

void startOutboxDispatcher().then((stop) => {
  stopOutbox = stop;
});

async function shutdown(): Promise<void> {
  if (stopOutbox) {
    await stopOutbox();
  }
  await worker.close();
  await connection.quit();
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});
