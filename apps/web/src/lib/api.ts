export type MeUser = {
  id: string;
  login: string;
  displayName: string;
  /** Permissions from global roles. */
  permissions: string[];
  /** Permissions held through at least one repository or folder grant. */
  scopedPermissions?: string[];
  mustChangePassword?: boolean;
};

export type RepositoryStatus = 'ACTIVE' | 'DISABLED' | 'ARCHIVED';

export type Repository = {
  id: string;
  name: string;
  description: string | null;
  type: 'MANAGED' | 'INDEXED';
  status: RepositoryStatus;
  rootRelativePath: string;
  revision: number;
  storageProvider: string;
  capabilities: { upload: boolean; physicalWrite: boolean };
  access?: { level: 'full' | 'partial' | 'none'; read: boolean; write: boolean };
};

export type Folder = {
  id: string;
  parentId: string | null;
  name: string;
  relativePath: string;
  /** `traverse`: shown only because a granted folder lies below it. */
  access?: 'full' | 'traverse';
};

export type DocumentRow = {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  currentVersion?: {
    id: string;
    mimeType: string;
    sequence: number;
    sizeBytes: string;
    sha256: string;
    createdAt: string;
  } | null;
};

export type SearchHit = {
  documentId: string;
  displayName: string;
  repositoryId: string;
  folderId: string | null;
  snippet: string | null;
  matchedOn: Array<'name' | 'content'>;
};

export type WorkflowStepAssignee =
  | { type: 'user'; userId: string }
  | { type: 'role'; roleId: string }
  | { type: 'department'; departmentId: string };

export type WorkflowDefinitionBody = {
  steps: Array<{ key: string; name: string; assignee: WorkflowStepAssignee }>;
};

export type AdminWorkflow = {
  id: string;
  key: string;
  name: string;
  version: number;
  enabled: boolean;
  definition: WorkflowDefinitionBody;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowDefinitionSummary = {
  id: string;
  key: string;
  name: string;
  version: number;
  steps: Array<{ key: string; name: string }>;
};

export type WorkflowCandidates = {
  definitionId: string;
  name: string;
  steps: Array<{
    key: string;
    name: string;
    candidates: Array<{ id: string; login: string; displayName: string }>;
  }>;
};

export type WorkflowTask = {
  id: string;
  stepKey: string;
  status: string;
  createdAt: string;
  dueAt: string | null;
  instance: {
    documentId: string;
    documentVersionId: string;
    status: string;
    definition: { key: string; name: string };
    stepIndex: number;
    stepCount: number;
    history: Array<{
      stepKey: string;
      stepName: string;
      decision: string | null;
      comment: string | null;
      completedAt: string | null;
      assignee: { login: string; displayName: string } | null;
    }>;
  };
  document: {
    id: string;
    displayName: string;
    repositoryId: string;
    repositoryName: string;
    folderId: string | null;
  } | null;
  requestedBy: { login: string; displayName: string } | null;
};

export type UploadSession = {
  id: string;
  status: 'quarantine' | 'published' | 'rejected' | string;
  documentId: string | null;
};

export type RoleRef = { id: string; key: string; displayName: string };

export type AdminUser = {
  id: string;
  login: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  roles: RoleRef[];
  grantCount: number;
  activeSessions: number;
};

export type Role = RoleRef & {
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  /** Every permission is repository/folder scoped, so the role can be granted on a location. */
  scopable: boolean;
  globalAssignments: number;
  scopedAssignments: number;
};

export type PermissionInfo = { key: string; scope: 'global' | 'resource' | 'capability'; description: string };

export type Grant = {
  id: string;
  createdAt: string;
  user: { id: string; login: string; displayName: string; enabled: boolean } | null;
  department: { id: string; name: string } | null;
  inherited?: boolean;
  role: RoleRef & { permissions: string[] };
  repository: { id: string; name: string; type: Repository['type']; status: RepositoryStatus } | null;
  folder: { id: string; name: string; relativePath: string } | null;
};

export type Department = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  memberCount: number;
  grantCount: number;
  members: Array<{ id: string; login: string; displayName: string; enabled: boolean }>;
};

export type AccessSource =
  | { kind: 'global'; permission: string }
  | { kind: 'repository'; grantId: string; roleName: string; permission: string }
  | {
      kind: 'folder';
      grantId: string;
      roleName: string;
      folderId: string;
      inherited: boolean;
      permission: string;
      folder: { id: string; name: string; relativePath: string } | null;
    };

export type EffectiveAccessResult = { enabled: boolean; permissions: string[]; sources: AccessSource[] };

export type Connector = {
  id: string;
  name: string;
  protocol: 'smb' | 'nfs' | 'local' | string;
  host: string;
  exportPath: string;
  mountPath: string | null;
  smbUsername: string | null;
  gatewayState: string;
  status: RepositoryStatus;
  lastHealthAt: string | null;
  lastHealthNote: string | null;
  repositoryCount?: number;
  browsable?: boolean;
};

export type ConnectorList = {
  gatewayConfigured: boolean;
  localRoots: string[];
  hostBrowseStart?: string;
  connectors: Connector[];
};

export type DirectoryListing = {
  path: string;
  parent: string | null;
  directories: Array<{ name: string; path: string }>;
  fileCount: number;
  truncated: boolean;
};

export type RepositoryAdmin = Repository & {
  scanIntervalMinutes: number | null;
  createdAt: string;
  connector: { id: string; name: string; protocol: string; host: string; exportPath: string; gatewayState: string; status: string } | null;
  scan: {
    status: string;
    generation: number;
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    lastError: string | null;
    filesSeen: number;
  } | null;
  counts: { documents: number; folders: number; grants: number; sources: Record<string, number> };
};

export type AuditEvent = {
  id: string;
  actorUserId: string | null;
  actor: { login: string; displayName: string } | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  outcome: string;
  createdAt: string;
};

export type ChatUser = { id: string; login: string; displayName: string; enabled: boolean };
export type ConversationKind = 'DIRECT' | 'GROUP' | 'DOCUMENT';

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  myRole: string;
  document: { id: string; displayName: string } | null;
  participants: Array<ChatUser & { role: string }>;
  lastMessageAt: string | null;
  lastMessage: {
    id: string;
    kind: 'text' | 'system';
    preview: string;
    metadata: ChatMessage['metadata'];
    createdAt: string;
    sender: ChatUser | null;
  } | null;
  unreadCount: number;
};

export type ConversationDetail = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  createdAt: string;
  myRole: string | null;
  document: { id: string; displayName: string; repositoryId: string; folderId: string | null } | null;
  participants: Array<ChatUser & { role: string }>;
};

export type MessageDocumentLink =
  | { id: string; available: true; displayName: string; repositoryId: string; folderId: string | null }
  | { id: string | null; available: false };

export type ChatMessage = {
  id: string;
  conversationId: string;
  kind: 'text' | 'system';
  body: string;
  metadata: { title?: string; from?: string | null; to?: string; names?: string[] } | null;
  createdAt: string;
  editedAt: string | null;
  sender: ChatUser | null;
  canEdit: boolean;
  documents: MessageDocumentLink[];
  revisions?: Array<{ id: string; body: string; replacedAt: string }>;
};

export type MessagePage = { items: ChatMessage[]; hasMore: boolean };

export type InvestigationResult = {
  subject: ChatUser;
  conversations: Array<{
    id: string;
    kind: ConversationKind;
    title: string | null;
    document: { id: string; displayName: string } | null;
    lastMessageAt: string | null;
    messageCount: number;
    subjectMembership: { role: string; joinedAt: string; leftAt: string | null };
    participants: Array<ChatUser & { role: string; leftAt: string | null }>;
  }>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

type PasswordChangeListener = () => void;
let onPasswordChangeRequired: PasswordChangeListener | null = null;

/** Called when any request is refused because the signed-in user must change their password first. */
export function setPasswordChangeRequiredHandler(listener: PasswordChangeListener | null): void {
  onPasswordChangeRequired = listener;
}

let csrfToken: string | null = null;

export async function ensureCsrf(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
  const body = (await response.json()) as { token: string };
  csrfToken = body.token;
  return csrfToken;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-CSRF-Token', await ensureCsrf());
  }
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { credentials: 'include', ...init, headers });
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as { detail?: string; title?: string; code?: string };
    if (problem.code === 'password_change_required') {
      onPasswordChangeRequired?.();
    }
    throw new ApiError(problem.detail ?? problem.title ?? `Request failed (${response.status})`, response.status, problem.code);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Upload with real network byte progress; server-side scan/index status is polled separately. */
export function uploadFile(
  repositoryId: string,
  file: File,
  folderId: string | null,
  onProgress: (fraction: number) => void,
): { promise: Promise<{ uploadSessionId: string }>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    const token = await ensureCsrf();
    return new Promise<{ uploadSessionId: string }>((resolve, reject) => {
      xhr.open('POST', `/api/v1/repositories/${repositoryId}/documents/upload`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-CSRF-Token', token);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded / event.total);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as { uploadSessionId: string });
        } else {
          let detail = `Upload failed (${xhr.status})`;
          try {
            detail = (JSON.parse(xhr.responseText) as { detail?: string }).detail ?? detail;
          } catch {
            /* keep default */
          }
          reject(new ApiError(detail, xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError('Network error', 0));
      xhr.onabort = () => reject(new ApiError('aborted', 0));
      const form = new FormData();
      if (folderId) {
        form.append('folderId', folderId);
      }
      form.append('file', file);
      xhr.send(form);
    });
  })();
  return { promise, abort: () => xhr.abort() };
}
