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
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
