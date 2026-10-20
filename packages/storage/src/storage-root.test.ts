import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findWorkspaceRoot, resolveManagedStorageRoot } from './storage-root';

const repoRoot = path.resolve(__dirname, '../../..');

describe('resolveManagedStorageRoot', () => {
  it('anchors relative paths at the workspace root from any package directory', () => {
    const fromApi = resolveManagedStorageRoot('./data/managed', path.join(repoRoot, 'apps/api'));
    const fromWorker = resolveManagedStorageRoot('./data/managed', path.join(repoRoot, 'apps/worker'));
    expect(fromApi).toBe(path.join(repoRoot, 'data/managed'));
    expect(fromWorker).toBe(fromApi);
  });

  it('keeps absolute paths unchanged', () => {
    expect(resolveManagedStorageRoot('/srv/intandms/managed')).toBe('/srv/intandms/managed');
  });

  it('finds the workspace root by its workspaces manifest', () => {
    expect(findWorkspaceRoot(path.join(repoRoot, 'packages/storage/src'))).toBe(repoRoot);
  });
});
