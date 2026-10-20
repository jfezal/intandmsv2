import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

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

export async function scanIndexedRepository(db: PrismaClient, repositoryId: string): Promise<void> {
  const repository = await db.repository.findUnique({
    where: { id: repositoryId },
    include: { storageConnection: true },
  });
  if (!repository || repository.type !== 'INDEXED') {
    return;
  }

  const config = repository.storageConnection.config as { mountPath?: string };
  const mountPath = config.mountPath;
  if (!mountPath) {
    return;
  }

  const checkpoint = await db.scanCheckpoint.upsert({
    where: { repositoryId },
    create: { repositoryId, status: 'running', generation: 1 },
    update: { status: 'running', generation: { increment: 1 } },
  });

  const files = await walkReadOnly(mountPath);
  for (const file of files) {
    await db.sourceObservation.upsert({
      where: {
        repositoryId_relativePath: {
          repositoryId,
          relativePath: file.relativePath,
        },
      },
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

  await db.scanCheckpoint.update({
    where: { repositoryId },
    data: { status: 'idle', frontierPath: null },
  });
}
