export const PERMISSIONS = {
  SYSTEM_ADMIN: 'system.admin',
  USERS_MANAGE: 'users.manage',
  AUDIT_READ: 'audit.read',
  REPOSITORIES_MANAGE: 'repositories.manage',
  DOCUMENTS_READ: 'documents.read',
  DOCUMENTS_WRITE: 'documents.write',
  SEARCH_QUERY: 'search.query',
  JOBS_MANAGE: 'jobs.manage',
  CONNECTORS_MANAGE: 'connectors.manage',
  MESSAGES_AUDIT: 'messages.audit',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * - `global`: only meaningful system-wide; ignored inside repository/folder grants.
 * - `resource`: evaluated against a repository/folder location (D-03).
 * - `capability`: a feature switch held either globally or through any grant.
 */
export type PermissionScope = 'global' | 'resource' | 'capability';

export const PERMISSION_CATALOG: Record<PermissionKey, { scope: PermissionScope; description: string }> = {
  'system.admin': { scope: 'global', description: 'Full system administration, including all repositories.' },
  'users.manage': { scope: 'global', description: 'Create and manage users, roles and access grants.' },
  'audit.read': { scope: 'global', description: 'Read the audit log.' },
  'repositories.manage': { scope: 'global', description: 'Create, configure and disable repositories.' },
  'connectors.manage': { scope: 'global', description: 'Manage storage connections and credentials.' },
  'jobs.manage': { scope: 'global', description: 'Inspect and control background processing.' },
  'messages.audit': { scope: 'global', description: 'Read any conversation for an investigation; every access is audited.' },
  'documents.read': { scope: 'resource', description: 'View, preview and download documents.' },
  'documents.write': { scope: 'resource', description: 'Upload documents, create folders and start reviews.' },
  'search.query': { scope: 'capability', description: 'Use search; results stay limited to readable documents.' },
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_CATALOG) as PermissionKey[];

export function isScopablePermission(key: string): boolean {
  const entry = PERMISSION_CATALOG[key as PermissionKey];
  return entry !== undefined && entry.scope !== 'global';
}
