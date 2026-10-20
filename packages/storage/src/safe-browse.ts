import { constants } from 'node:fs';
import { access, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export type DirectoryListing = {
  path: string;
  parent: string | null;
  directories: Array<{ name: string; path: string }>;
  fileCount: number;
  truncated: boolean;
};

const MAX_ENTRIES = 500;

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function normalizeRelative(relativePath: string): string {
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (cleaned.split('/').includes('..')) {
    throw new Error('Path escapes root.');
  }
  return cleaned;
}

/** Resolves `relativePath` under `root`, following symlinks, and rejects anything that lands outside the root. */
export async function resolveContainedDirectory(root: string, relativePath: string): Promise<string> {
  const realRoot = await realpath(path.resolve(root));
  const relative = normalizeRelative(relativePath);
  const target = await realpath(path.resolve(realRoot, relative));
  if (!isInside(realRoot, target)) {
    throw new Error('Path escapes root.');
  }
  if (!(await stat(target)).isDirectory()) {
    throw new Error('Not a directory.');
  }
  return target;
}

/** Like `resolveContainedDirectory` for a regular file; symlinks may not lead outside the root. */
export async function resolveContainedFile(root: string, relativePath: string): Promise<string> {
  const realRoot = await realpath(path.resolve(root));
  const relative = normalizeRelative(relativePath);
  if (!relative) throw new Error('Not a file.');
  const target = await realpath(path.resolve(realRoot, relative));
  if (!isInside(realRoot, target)) {
    throw new Error('Path escapes root.');
  }
  if (!(await stat(target)).isFile()) {
    throw new Error('Not a file.');
  }
  return target;
}

/** Lists child directories (no file names) of a path contained in `root`. Hidden entries and escaping symlinks are skipped. */
export async function listContainedDirectories(root: string, relativePath = ''): Promise<DirectoryListing> {
  const realRoot = await realpath(path.resolve(root));
  const relative = normalizeRelative(relativePath);
  const target = await resolveContainedDirectory(realRoot, relative);
  const entries = await readdir(target, { withFileTypes: true });

  const directories: DirectoryListing['directories'] = [];
  let fileCount = 0;
  let truncated = false;
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isFile()) {
      fileCount += 1;
      continue;
    }
    let isDirectory = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        const resolved = await realpath(path.join(target, entry.name));
        isDirectory = isInside(realRoot, resolved) && (await stat(resolved)).isDirectory();
      } catch {
        isDirectory = false;
      }
    }
    if (!isDirectory) continue;
    if (directories.length >= MAX_ENTRIES) {
      truncated = true;
      continue;
    }
    directories.push({ name: entry.name, path: relative ? `${relative}/${entry.name}` : entry.name });
  }
  directories.sort((a, b) => a.name.localeCompare(b.name));

  return {
    path: relative,
    parent: relative ? relative.split('/').slice(0, -1).join('/') : null,
    directories,
    fileCount,
    truncated,
  };
}

export type IndexedLocalPathCode = 'missing' | 'not_directory' | 'unreadable' | 'outside_roots' | 'blocked';

export class IndexedLocalPathError extends Error {
  constructor(readonly code: IndexedLocalPathCode) {
    super(code);
    this.name = 'IndexedLocalPathError';
  }
}

const BLOCKED_PREFIXES = ['/proc', '/sys', '/dev'];

function isBlockedLocation(resolved: string): boolean {
  const unix = resolved.replaceAll('\\', '/');
  return BLOCKED_PREFIXES.some((prefix) => unix === prefix || unix.startsWith(`${prefix}/`));
}

/**
 * Resolves a host folder that may back a local indexed connector.
 * When `allowedRoots` is empty there is no extra allowlist; the folder must still exist, be
 * readable, and not be a kernel/virtual filesystem.
 */
export async function resolveIndexedLocalDirectory(candidate: string, allowedRoots: string[]): Promise<string> {
  if (!candidate.trim()) throw new IndexedLocalPathError('missing');
  let resolved: string;
  try {
    resolved = await realpath(path.resolve(candidate));
  } catch {
    throw new IndexedLocalPathError('missing');
  }
  let info;
  try {
    info = await stat(resolved);
  } catch {
    throw new IndexedLocalPathError('missing');
  }
  if (!info.isDirectory()) throw new IndexedLocalPathError('not_directory');
  if (isBlockedLocation(resolved)) throw new IndexedLocalPathError('blocked');
  try {
    await access(resolved, constants.R_OK | constants.X_OK);
  } catch {
    throw new IndexedLocalPathError('unreadable');
  }
  if (allowedRoots.length > 0 && !(await isWithinAllowedRoots(resolved, allowedRoots))) {
    throw new IndexedLocalPathError('outside_roots');
  }
  return resolved;
}

/** Lists child folders of an absolute host path, using the same rules as `resolveIndexedLocalDirectory`. */
export async function listHostDirectories(candidate: string, allowedRoots: string[]): Promise<DirectoryListing> {
  const resolved = await resolveIndexedLocalDirectory(candidate, allowedRoots);
  const listing = await listContainedDirectories(resolved, '');
  const parentDir = path.dirname(resolved);
  let parent: string | null = null;
  if (parentDir !== resolved) {
    try {
      parent = await resolveIndexedLocalDirectory(parentDir, allowedRoots);
    } catch {
      parent = null;
    }
  }
  return {
    path: resolved,
    parent,
    directories: listing.directories.map((entry) => ({ name: entry.name, path: path.join(resolved, entry.name) })),
    fileCount: listing.fileCount,
    truncated: listing.truncated,
  };
}

/** True when `candidate` (after resolving symlinks) is one of, or inside one of, `allowedRoots`. */
export async function isWithinAllowedRoots(candidate: string, allowedRoots: string[]): Promise<boolean> {
  let resolved: string;
  try {
    resolved = await realpath(path.resolve(candidate));
  } catch {
    return false;
  }
  for (const root of allowedRoots) {
    try {
      if (isInside(await realpath(path.resolve(root)), resolved)) return true;
    } catch {
      // Missing allowlist roots are ignored.
    }
  }
  return false;
}
