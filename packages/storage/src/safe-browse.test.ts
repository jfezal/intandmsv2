import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  IndexedLocalPathError,
  isWithinAllowedRoots,
  listContainedDirectories,
  listHostDirectories,
  resolveContainedDirectory,
  resolveContainedFile,
  resolveIndexedLocalDirectory,
} from './safe-browse';

let base: string;
let root: string;
let outside: string;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'intandms-browse-'));
  root = path.join(base, 'root');
  outside = path.join(base, 'outside');
  await mkdir(path.join(root, 'Finance', '2026'), { recursive: true });
  await mkdir(path.join(root, 'HR'));
  await mkdir(path.join(root, '.hidden'));
  await mkdir(outside);
  await writeFile(path.join(root, 'readme.txt'), 'x');
  await symlink(outside, path.join(root, 'escape'));
  await symlink(path.join(root, 'HR'), path.join(root, 'hr-link'));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('listContainedDirectories', () => {
  it('lists child directories, skipping hidden entries and escaping symlinks', async () => {
    const listing = await listContainedDirectories(root);
    expect(listing.directories.map((entry) => entry.name)).toEqual(['Finance', 'HR', 'hr-link']);
    expect(listing.fileCount).toBe(1);
    expect(listing.parent).toBeNull();
  });

  it('lists nested paths with a parent', async () => {
    const listing = await listContainedDirectories(root, 'Finance');
    expect(listing.directories).toEqual([{ name: '2026', path: 'Finance/2026' }]);
    expect(listing.parent).toBe('');
  });

  it('rejects traversal and symlink escapes', async () => {
    await expect(listContainedDirectories(root, '../outside')).rejects.toThrow();
    await expect(resolveContainedDirectory(root, 'escape')).rejects.toThrow('escapes');
  });
});

describe('resolveContainedFile', () => {
  it('resolves files inside the root and rejects directories, traversal and escaping links', async () => {
    await writeFile(path.join(outside, 'secret.txt'), 's');
    await symlink(path.join(outside, 'secret.txt'), path.join(root, 'secret-link.txt'));
    expect(await resolveContainedFile(root, 'readme.txt')).toMatch(/readme\.txt$/);
    await expect(resolveContainedFile(root, 'HR')).rejects.toThrow('Not a file');
    await expect(resolveContainedFile(root, '../outside/secret.txt')).rejects.toThrow();
    await expect(resolveContainedFile(root, 'secret-link.txt')).rejects.toThrow('escapes');
    await expect(resolveContainedFile(root, '')).rejects.toThrow();
  });
});

describe('isWithinAllowedRoots', () => {
  it('accepts paths inside an allowed root and rejects others', async () => {
    expect(await isWithinAllowedRoots(path.join(root, 'HR'), [root])).toBe(true);
    expect(await isWithinAllowedRoots(path.join(root, 'escape'), [root])).toBe(false);
    expect(await isWithinAllowedRoots(outside, [root])).toBe(false);
    expect(await isWithinAllowedRoots(path.join(base, 'missing'), [root])).toBe(false);
  });
});

describe('resolveIndexedLocalDirectory', () => {
  it('accepts any existing readable folder when no roots are configured', async () => {
    expect(await resolveIndexedLocalDirectory(outside, [])).toBe(await realpath(outside));
    await expect(resolveIndexedLocalDirectory(path.join(base, 'missing'), [])).rejects.toMatchObject({
      code: 'missing',
    });
  });

  it('still honours an allowlist when one is configured', async () => {
    expect(await resolveIndexedLocalDirectory(path.join(root, 'HR'), [root])).toMatch(/HR$/);
    await expect(resolveIndexedLocalDirectory(outside, [root])).rejects.toBeInstanceOf(IndexedLocalPathError);
    await expect(resolveIndexedLocalDirectory(outside, [root])).rejects.toMatchObject({ code: 'outside_roots' });
  });

  it('refuses kernel filesystems', async () => {
    await expect(resolveIndexedLocalDirectory('/proc', [])).rejects.toMatchObject({ code: 'blocked' });
  });
});

describe('listHostDirectories', () => {
  it('lists absolute child paths and a parent that stays inside the allowlist', async () => {
    const listing = await listHostDirectories(path.join(root, 'Finance'), [root]);
    expect(listing.directories.map((entry) => entry.name)).toEqual(['2026']);
    expect(listing.directories[0]?.path).toMatch(/Finance\/2026$/);
    expect(listing.parent).toBe(await realpath(root));
  });
});
