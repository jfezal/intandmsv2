import { readdir, realpath, stat } from 'node:fs/promises';
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
