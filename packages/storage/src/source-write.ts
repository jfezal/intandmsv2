import { constants } from 'node:fs';
import { mkdir, open, realpath, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { resolveContainedDirectory } from './safe-browse';

export type SourceWriteCode = 'exists' | 'escape' | 'invalid_path' | 'not_writable';

export class SourceWriteError extends Error {
  constructor(
    readonly code: SourceWriteCode,
    message: string,
  ) {
    super(message);
    this.name = 'SourceWriteError';
  }
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function normalizeRelative(relativePath: string): string {
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!cleaned || cleaned.split('/').includes('..')) {
    throw new SourceWriteError('escape', 'Path escapes root.');
  }
  return cleaned;
}

async function parentDirectory(root: string, relativePath: string): Promise<{ realRoot: string; parent: string; name: string }> {
  const realRoot = await realpath(path.resolve(root));
  const relative = normalizeRelative(relativePath);
  const slash = relative.lastIndexOf('/');
  const parentRelative = slash === -1 ? '' : relative.slice(0, slash);
  const name = slash === -1 ? relative : relative.slice(slash + 1);
  const parent = parentRelative ? await resolveContainedDirectory(realRoot, parentRelative) : realRoot;
  const destination = path.resolve(parent, name);
  if (!isInside(realRoot, destination) || path.dirname(destination) !== parent) {
    throw new SourceWriteError('escape', 'Path escapes root.');
  }
  return { realRoot, parent, name };
}

/** Creates one new directory under `root`. Existing paths are rejected; parents must already exist. */
export async function createContainedDirectory(root: string, relativePath: string): Promise<string> {
  const { parent, name } = await parentDirectory(root, relativePath);
  const destination = path.join(parent, name);
  try {
    await mkdir(destination);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      throw new SourceWriteError('exists', 'A folder with that name already exists.');
    }
    if (code === 'EACCES' || code === 'EROFS') {
      throw new SourceWriteError('not_writable', 'The source is not writable.');
    }
    throw error;
  }
  const created = await realpath(destination);
  if (!(await stat(created)).isDirectory()) {
    throw new SourceWriteError('exists', 'A folder with that name already exists.');
  }
  return created;
}

/**
 * Writes a new regular file under `root` using exclusive-create (no overwrite).
 * The parent directory must already exist.
 */
export async function writeNewContainedFile(
  root: string,
  relativePath: string,
  stream: Readable,
): Promise<{ sizeBytes: number; modifiedAtMs: number }> {
  const { parent, name } = await parentDirectory(root, relativePath);
  const destination = path.join(parent, name);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      throw new SourceWriteError('exists', 'A file with that name already exists.');
    }
    if (code === 'EACCES' || code === 'EROFS') {
      throw new SourceWriteError('not_writable', 'The source is not writable.');
    }
    throw error;
  }
  try {
    await pipeline(stream, handle.createWriteStream());
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    throw error;
  }
  const written = await stat(destination);
  if (!written.isFile()) {
    await unlink(destination).catch(() => undefined);
    throw new SourceWriteError('exists', 'A file with that name already exists.');
  }
  return { sizeBytes: written.size, modifiedAtMs: Math.trunc(written.mtimeMs) };
}
