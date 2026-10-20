import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SourceWriteError, createContainedDirectory, writeNewContainedFile } from './source-write';

let base: string;
let root: string;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'intandms-write-'));
  root = path.join(base, 'root');
  await mkdir(path.join(root, 'Finance'), { recursive: true });
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('createContainedDirectory', () => {
  it('creates a new folder inside the root', async () => {
    const created = await createContainedDirectory(root, 'Finance/2026');
    expect(created.endsWith(`${path.sep}2026`)).toBe(true);
  });

  it('rejects an existing folder and path escape', async () => {
    await expect(createContainedDirectory(root, 'Finance')).rejects.toMatchObject({ code: 'exists' } satisfies Partial<SourceWriteError>);
    await expect(createContainedDirectory(root, '../outside')).rejects.toMatchObject({ code: 'escape' } satisfies Partial<SourceWriteError>);
  });
});

describe('writeNewContainedFile', () => {
  it('creates a new file and refuses overwrite or traversal', async () => {
    const first = await writeNewContainedFile(root, 'Finance/nota.txt', Readable.from(['hello']));
    expect(first.sizeBytes).toBe(5);
    await expect(writeNewContainedFile(root, 'Finance/nota.txt', Readable.from(['x']))).rejects.toMatchObject({
      code: 'exists',
    } satisfies Partial<SourceWriteError>);
    await expect(writeNewContainedFile(root, '../secret.txt', Readable.from(['x']))).rejects.toThrow(SourceWriteError);
  });

  it('removes a partial file when the stream fails', async () => {
    const failing = Readable.from(
      (async function* () {
        yield 'part';
        throw new Error('aborted');
      })(),
    );
    await expect(writeNewContainedFile(root, 'Finance/broken.txt', failing)).rejects.toThrow('aborted');
    await expect(stat(path.join(root, 'Finance', 'broken.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
