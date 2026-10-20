import { lstat, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  isIgnoredSourceName,
  mimeTypeFromName,
  planIndexedReconciliation,
  sourceFingerprint,
  type ObservedSourceFile,
} from '@intandms/core';
import { scanFileWithClamAv } from '@intandms/processing';
import { resolveContainedDirectory, resolveContainedFile } from '@intandms/storage';

const SCAN_EVENT = 'repository.index_scan_requested';
const MAX_PATH = 1024;
const MAX_FILE_NAME = 512;
const MAX_FOLDER_NAME = 256;

type SourceTree = { files: ObservedSourceFile[]; directories: string[]; skipped: number };

/** Read-only walk; symlinks are not followed so the projection never leaves the scan root. */
async function walkReadOnly(root: string): Promise<SourceTree> {
  const tree: SourceTree = { files: [], directories: [], skipped: 0 };
  const pending: string[] = [''];
  while (pending.length > 0) {
    const prefix = pending.pop()!;
    const entries = await readdir(prefix ? path.join(root, prefix) : root, { withFileTypes: true });
    for (const entry of entries) {
      if (isIgnoredSourceName(entry.name)) continue;
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (relativePath.length > MAX_PATH) {
        tree.skipped += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name.length > MAX_FOLDER_NAME) {
          tree.skipped += 1;
          continue;
        }
        tree.directories.push(relativePath);
        pending.push(relativePath);
      } else if (entry.isFile()) {
        if (entry.name.length > MAX_FILE_NAME) {
          tree.skipped += 1;
          continue;
        }
        const fileStat = await lstat(path.join(root, relativePath));
        tree.files.push({ relativePath, sizeBytes: fileStat.size, modifiedAtMs: Math.trunc(fileStat.mtimeMs) });
      }
    }
  }
  return tree;
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

function parentPath(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash === -1 ? '' : relativePath.slice(0, slash);
}

function baseName(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf('/') + 1);
}

/** Creates/revives folders for every observed directory and flags the rest as missing (never deleted). */
async function projectFolders(db: PrismaClient, repositoryId: string, directories: string[]): Promise<Map<string, string>> {
  const existing = await db.folder.findMany({
    where: { repositoryId },
    select: { id: true, relativePath: true, sourceMissingAt: true },
  });
  const byPath = new Map(existing.map((folder) => [folder.relativePath, folder]));
  const ids = new Map<string, string>();
  const ordered = [...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  for (const relativePath of ordered) {
    const current = byPath.get(relativePath);
    if (current) {
      if (current.sourceMissingAt) {
        await db.folder.update({ where: { id: current.id }, data: { sourceMissingAt: null } });
      }
      ids.set(relativePath, current.id);
      continue;
    }
    const parent = parentPath(relativePath);
    const created = await db.folder.create({
      data: { repositoryId, parentId: parent ? ids.get(parent) ?? null : null, name: baseName(relativePath), relativePath },
    });
    ids.set(relativePath, created.id);
  }
  const observed = new Set(directories);
  const vanished = existing.filter((folder) => !folder.sourceMissingAt && !observed.has(folder.relativePath)).map((folder) => folder.id);
  if (vanished.length > 0) {
    await db.folder.updateMany({ where: { id: { in: vanished } }, data: { sourceMissingAt: new Date() } });
  }
  return ids;
}

async function projectDocuments(db: PrismaClient, repositoryId: string, files: ObservedSourceFile[], folderIds: Map<string, string>) {
  const existing = await db.document.findMany({
    where: { repositoryId, sourceRelativePath: { not: null } },
    select: { id: true, sourceRelativePath: true, sourceSizeBytes: true, sourceModifiedAt: true, lifecycleState: true },
  });
  const plan = planIndexedReconciliation(
    existing.map((document) => ({
      id: document.id,
      relativePath: document.sourceRelativePath!,
      sizeBytes: document.sourceSizeBytes === null ? null : Number(document.sourceSizeBytes),
      modifiedAtMs: document.sourceModifiedAt?.getTime() ?? null,
      missing: document.lifecycleState !== 'active',
    })),
    files,
  );
  const folderOf = (relativePath: string) => folderIds.get(parentPath(relativePath)) ?? null;
  const sourceFields = (file: ObservedSourceFile) => ({
    sourceRelativePath: file.relativePath,
    sourceSizeBytes: BigInt(file.sizeBytes),
    sourceModifiedAt: new Date(file.modifiedAtMs),
    sourceMimeType: mimeTypeFromName(baseName(file.relativePath)),
  });

  for (const file of plan.create) {
    await db.document.create({
      data: {
        repositoryId,
        folderId: folderOf(file.relativePath),
        displayName: baseName(file.relativePath),
        ...sourceFields(file),
        sourceScanStatus: 'pending',
      },
    });
  }
  for (const entry of plan.update) {
    if (!entry.contentChanged) continue;
    await db.document.update({
      where: { id: entry.id },
      data: {
        ...sourceFields(entry.file),
        folderId: folderOf(entry.file.relativePath),
        lifecycleState: 'active',
        sourceScanStatus: 'pending',
        sourceScannedFingerprint: null,
        revision: { increment: 1 },
      },
    });
  }
  for (const entry of plan.move) {
    await db.document.update({
      where: { id: entry.id },
      data: {
        sourceRelativePath: entry.file.relativePath,
        displayName: baseName(entry.file.relativePath),
        folderId: folderOf(entry.file.relativePath),
        sourceMimeType: mimeTypeFromName(baseName(entry.file.relativePath)),
        revision: { increment: 1 },
      },
    });
  }
  if (plan.missing.length > 0) {
    await db.document.updateMany({
      where: { id: { in: plan.missing } },
      data: { lifecycleState: 'source_missing', revision: { increment: 1 } },
    });
  }
  return plan;
}

/**
 * Malware-scans files whose content is new or changed. The cleared fingerprint lets reads refuse
 * bytes that changed on the source after the scan.
 */
async function scanPendingContent(db: PrismaClient, repositoryId: string, scanRoot: string): Promise<number> {
  const pending = await db.document.findMany({
    where: { repositoryId, lifecycleState: 'active', sourceScanStatus: 'pending', sourceRelativePath: { not: null } },
    select: { id: true, sourceRelativePath: true },
  });
  for (const document of pending) {
    let status: 'clean' | 'skipped' | 'infected' | 'failed' | 'pending';
    let fingerprint: string | null = null;
    try {
      const absolute = await resolveContainedFile(scanRoot, document.sourceRelativePath!);
      const before = await stat(absolute);
      const result = await scanFileWithClamAv(absolute);
      const after = await stat(absolute);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        status = 'pending';
      } else {
        status = result.status;
        fingerprint = sourceFingerprint(after.size, after.mtimeMs);
      }
    } catch {
      status = 'failed';
    }
    await db.document.updateMany({
      where: { id: document.id, sourceScanStatus: 'pending' },
      data: { sourceScanStatus: status, sourceScannedFingerprint: status === 'pending' ? null : fingerprint },
    });
  }
  return pending.length;
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
    const tree = await walkReadOnly(scanRoot);

    // An unmounted share usually shows up as an empty directory; that must never hide everything.
    if (tree.files.length === 0 && tree.directories.length === 0) {
      const projected =
        (await db.document.count({ where: { repositoryId, lifecycleState: 'active', sourceRelativePath: { not: null } } })) +
        (await db.folder.count({ where: { repositoryId, sourceMissingAt: null } }));
      if (projected > 0) {
        throw new Error('Source returned no entries; nothing was marked missing. Check that the share is mounted, then rescan.');
      }
    }

    for (const file of tree.files) {
      await db.sourceObservation.upsert({
        where: { repositoryId_relativePath: { repositoryId, relativePath: file.relativePath } },
        create: {
          repositoryId,
          relativePath: file.relativePath,
          sizeBytes: BigInt(file.sizeBytes),
          modifiedAt: new Date(file.modifiedAtMs),
          sourceState: 'discovered',
          scanGeneration: checkpoint.generation,
        },
        update: {
          sizeBytes: BigInt(file.sizeBytes),
          modifiedAt: new Date(file.modifiedAtMs),
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

    const folderIds = await projectFolders(db, repositoryId, tree.directories);
    const plan = await projectDocuments(db, repositoryId, tree.files, folderIds);
    const scanned = await scanPendingContent(db, repositoryId, scanRoot);

    await db.scanCheckpoint.update({
      where: { repositoryId },
      data: {
        status: 'idle',
        frontierPath: null,
        lastCompletedAt: new Date(),
        filesSeen: tree.files.length,
        lastError: tree.skipped > 0 ? `${tree.skipped} entries skipped (name or path too long).` : null,
      },
    });
    console.log(
      `[scan] repository ${repositoryId}: ${tree.files.length} files, ${tree.directories.length} folders, ` +
        `+${plan.create.length} new, ${plan.move.length} moved, ${plan.missing.length} missing, ${scanned} content scans`,
    );
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
