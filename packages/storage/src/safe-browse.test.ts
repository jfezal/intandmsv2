import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isWithinAllowedRoots, listContainedDirectories, resolveContainedDirectory } from './safe-browse';

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

describe('isWithinAllowedRoots', () => {
  it('accepts paths inside an allowed root and rejects others', async () => {
    expect(await isWithinAllowedRoots(path.join(root, 'HR'), [root])).toBe(true);
    expect(await isWithinAllowedRoots(path.join(root, 'escape'), [root])).toBe(false);
    expect(await isWithinAllowedRoots(outside, [root])).toBe(false);
    expect(await isWithinAllowedRoots(path.join(base, 'missing'), [root])).toBe(false);
  });
});
