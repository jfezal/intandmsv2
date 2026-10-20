import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { resolveContainedDirectory } from '@intandms/storage';

const SCAN_EVENT = 'repository.index_scan_requested';

async function walkReadOnly(root: string, prefix = ''): Promise<Array<{ relativePath: string; size: number }>> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: Array<{ relativePath: string; size: number }> = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkReadOnly(absolute, relativePath)));
    } else if (entry.isFile()) {
      const fileStat = await stat(absolute);
      files.push({ relativePath, size: fileStat.size });
    }
  }
  return files;
}

async function resolveScanRoot(db: PrismaClient, config: { connectorId?: string; mountPath?: string }, root: string) {
  let mountPath = config.mountPath;
  if (config.connectorId) {
    const connector = await db.indexedConnector.findUnique({ where: { id: config.connectorId } });
    if (!connector || connector.status !== 'ACTIVE') {
      throw new Error('Connector is missing or disabled.');
    }
    mountPath = connector.mountPath ?? undefined;
  }
  if (!mountPath) {
    throw new Error('Connector is not mounted.');
  }
  return resolveContainedDirectory(mountPath, root);
}

export async function scanIndexedRepository(db: PrismaClient, repositoryId: string): Promise<void> {
  const repository = await db.repository.findUnique({
    where: { id: repositoryId },
    include: { storageConnection: true },
  });
  if (!repository || repository.type !== 'INDEXED' || repository.status !== 'ACTIVE') {
    return;
  }

  const checkpoint = await db.scanCheckpoint.upsert({
    where: { repositoryId },
    create: { repositoryId, status: 'running', generation: 1, lastStartedAt: new Date() },
    update: { status: 'running', generation: { increment: 1 }, lastStartedAt: new Date(), lastError: null },
  });

  try {
    const scanRoot = await resolveScanRoot(
      db,
      repository.storageConnection.config as { connectorId?: string; mountPath?: string },
      repository.rootRelativePath,
    );
    const files = await walkReadOnly(scanRoot);
    for (const file of files) {
      await db.sourceObservation.upsert({
        where: { repositoryId_relativePath: { repositoryId, relativePath: file.relativePath } },
        create: {
          repositoryId,
          relativePath: file.relativePath,
          sizeBytes: BigInt(file.size),
          sourceState: 'discovered',
          scanGeneration: checkpoint.generation,
        },
        update: {
          sizeBytes: BigInt(file.size),
          sourceState: 'discovered',
          lastSeenAt: new Date(),
          scanGeneration: checkpoint.generation,
        },
      });
    }
    await db.sourceObservation.updateMany({
      where: { repositoryId, scanGeneration: { lt: checkpoint.generation }, sourceState: { not: 'missing' } },
      data: { sourceState: 'missing' },
    });
    await db.scanCheckpoint.update({
      where: { repositoryId },
      data: { status: 'idle', frontierPath: null, lastCompletedAt: new Date(), filesSeen: files.length },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.scanCheckpoint.update({
      where: { repositoryId },
      data: { status: 'failed', lastError: message.slice(0, 1000) },
    });
    // A failed scan is recorded on the checkpoint; retrying is left to the schedule or a manual rescan.
    console.error(`[scan] repository ${repositoryId} failed: ${message}`);
  }
}

/** Queues scans for indexed repositories whose schedule is due and that have no scan pending. */
export async function enqueueDueScans(db: PrismaClient, now = new Date()): Promise<number> {
  const repositories = await db.repository.findMany({
    where: { type: 'INDEXED', status: 'ACTIVE', scanIntervalMinutes: { not: null } },
    select: { id: true, scanIntervalMinutes: true },
  });
  if (repositories.length === 0) return 0;

  const ids = repositories.map((repository) => repository.id);
  const [checkpoints, pending] = await Promise.all([
    db.scanCheckpoint.findMany({ where: { repositoryId: { in: ids } } }),
    db.outboxEvent.findMany({
      where: { eventType: SCAN_EVENT, dispatchedAt: null, aggregateId: { in: ids } },
      select: { aggregateId: true },
    }),
  ]);
  const checkpointByRepo = new Map(checkpoints.map((checkpoint) => [checkpoint.repositoryId, checkpoint]));
  const pendingIds = new Set(pending.map((event) => event.aggregateId));

  let queued = 0;
  for (const repository of repositories) {
    if (pendingIds.has(repository.id)) continue;
    const checkpoint = checkpointByRepo.get(repository.id);
    if (checkpoint?.status === 'running' || checkpoint?.status === 'queued') continue;
    const last = checkpoint?.lastStartedAt?.getTime() ?? 0;
    if (now.getTime() - last < repository.scanIntervalMinutes! * 60_000) continue;
    await db.$transaction([
      db.outboxEvent.create({
        data: {
          aggregateType: 'repository',
          aggregateId: repository.id,
          eventType: SCAN_EVENT,
          payload: { repositoryId: repository.id, scheduled: true },
        },
      }),
      db.scanCheckpoint.upsert({
        where: { repositoryId: repository.id },
        create: { repositoryId: repository.id, status: 'queued' },
        update: { status: 'queued' },
      }),
    ]);
    queued += 1;
  }
  return queued;
}
