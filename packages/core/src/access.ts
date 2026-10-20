import { PERMISSIONS, isScopablePermission } from './permissions';
import type { RepositoryType } from './repository-capabilities';

export type AccessGrant = {
  id: string;
  roleId: string;
  roleName: string;
  repositoryId: string;
  /** `null` grants the whole repository. */
  folderId: string | null;
  permissions: readonly string[];
};

export type AccessSource =
  | { kind: 'global'; permission: string }
  | { kind: 'repository'; grantId: string; roleName: string; permission: string }
  | { kind: 'folder'; grantId: string; roleName: string; folderId: string; inherited: boolean; permission: string };

export type EffectiveAccess = {
  permissions: string[];
  sources: AccessSource[];
};

/**
 * D-03 resolution: additive grants, inherited down the physical folder tree,
 * deny by default, no explicit denies. `folderAncestry` lists the target folder
 * first, then each parent up to the repository root (empty for the root).
 */
export function resolveEffectiveAccess(input: {
  globalPermissions: readonly string[];
  grants: readonly AccessGrant[];
  repositoryId: string;
  folderAncestry: readonly string[];
  repositoryType?: RepositoryType;
}): EffectiveAccess {
  const sources: AccessSource[] = [];
  const isAdmin = input.globalPermissions.includes(PERMISSIONS.SYSTEM_ADMIN);

  for (const permission of input.globalPermissions) {
    if (isScopablePermission(permission) || permission === PERMISSIONS.SYSTEM_ADMIN) {
      sources.push({ kind: 'global', permission });
    }
  }

  const targetFolderId = input.folderAncestry[0] ?? null;
  for (const grant of input.grants) {
    if (grant.repositoryId !== input.repositoryId) continue;
    const scoped = grant.permissions.filter(isScopablePermission);
    if (grant.folderId === null) {
      for (const permission of scoped) {
        sources.push({ kind: 'repository', grantId: grant.id, roleName: grant.roleName, permission });
      }
    } else if (input.folderAncestry.includes(grant.folderId)) {
      for (const permission of scoped) {
        sources.push({
          kind: 'folder',
          grantId: grant.id,
          roleName: grant.roleName,
          folderId: grant.folderId,
          inherited: grant.folderId !== targetFolderId,
          permission,
        });
      }
    }
  }

  const permissions = new Set(sources.map((source) => source.permission));
  if (isAdmin) {
    for (const permission of [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.DOCUMENTS_WRITE, PERMISSIONS.SEARCH_QUERY]) {
      permissions.add(permission);
    }
  }
  permissions.delete(PERMISSIONS.SYSTEM_ADMIN);
  return { permissions: [...permissions].sort(), sources };
}

export function hasEffectivePermission(access: EffectiveAccess, permission: string): boolean {
  return access.permissions.includes(permission);
}
