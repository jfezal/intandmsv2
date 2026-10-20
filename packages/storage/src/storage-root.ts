import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Nearest ancestor whose package.json declares npm workspaces; falls back to `start`. */
export function findWorkspaceRoot(start: string = process.cwd()): string {
  let current = path.resolve(start);
  for (;;) {
    const manifest = path.join(current, 'package.json');
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
        if (parsed.workspaces) return current;
      } catch {
        /* unreadable manifest: keep walking */
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

/**
 * API and worker run from different package directories, so a relative
 * MANAGED_STORAGE_ROOT must be anchored at the workspace root for both to
 * address the same files.
 */
export function resolveManagedStorageRoot(value: string | undefined, start?: string): string {
  const configured = value?.trim() || './data/managed';
  return path.isAbsolute(configured) ? configured : path.resolve(findWorkspaceRoot(start), configured);
}
