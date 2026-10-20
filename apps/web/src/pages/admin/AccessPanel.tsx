import { type FormEvent, useMemo, useState } from 'react';
import { IconFolder, IconInfo, IconPlus, IconX } from '../../components/icons';
import { Alert, Badge, Button, EmptyState, IconButton, SkeletonRows } from '../../components/ui';
import {
  api,
  type AccessSource,
  type AdminUser,
  type EffectiveAccessResult,
  type Grant,
  type Repository,
  type Role,
} from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { type Translator, useI18n } from '../../i18n';
import { Field, FolderPicker, LoadError, type PickedFolder, permissionLabel, useAction, useLoad } from './shared';

type Mode = { kind: 'user'; userId: string } | { kind: 'repository'; repositoryId: string };

const SCOPED_PERMISSIONS = ['documents.read', 'documents.write', 'search.query'];

function locationLabel(t: Translator, grant: Pick<Grant, 'folder'>): string {
  return grant.folder ? `/${grant.folder.relativePath}` : t('wholeRepository');
}

function sourceText(t: Translator, source: AccessSource): string {
  if (source.kind === 'global') return t('sourceGlobal');
  if (source.kind === 'repository') return t('sourceRepository', { role: source.roleName });
  const where = source.folder ? `/${source.folder.relativePath}` : source.folderId.slice(0, 8);
  return t(source.inherited ? 'sourceFolderInherited' : 'sourceFolder', { role: source.roleName, folder: where });
}

export function AccessPanel({ mode, onChanged }: { mode: Mode; onChanged?: () => void }) {
  const { t, locale } = useI18n();
  const grantsPath =
    mode.kind === 'user' ? `/api/v1/admin/grants?userId=${mode.userId}` : `/api/v1/admin/grants?repositoryId=${mode.repositoryId}`;
  const grants = useLoad<Grant[]>(grantsPath);
  const roles = useLoad<Role[]>('/api/v1/admin/roles');
  const repositories = useLoad<Repository[]>(mode.kind === 'user' ? '/api/v1/repositories' : null);
  const users = useLoad<AdminUser[]>(mode.kind === 'repository' ? '/api/v1/admin/users' : null);
  const [adding, setAdding] = useState(false);
  const revoke = useAction();

  const grantableRoles = useMemo(() => (roles.data ?? []).filter((role) => role.scopable && !role.isSystem), [roles.data]);

  async function revokeGrant(grant: Grant) {
    const who = mode.kind === 'user' ? grant.repository?.name ?? '' : grant.user.displayName;
    if (!window.confirm(t('confirmRevokeGrant', { role: grant.role.displayName, who, where: locationLabel(t, grant) }))) return;
    if (await revoke.run(() => api(`/api/v1/admin/grants/${grant.id}`, { method: 'DELETE' }))) {
      await grants.reload();
      onChanged?.();
    }
  }

  return (
    <div className="stack">
      <Alert tone="info" title={t('inheritanceTitle')}>
        {t('inheritanceBody')}
      </Alert>

      <section className="panel-section">
        <div className="section-head">
          <h3>{t('grantsHeading')}</h3>
          {!adding ? (
            <Button size="sm" variant="primary" icon={<IconPlus size={16} />} onClick={() => setAdding(true)}>
              {t('addGrant')}
            </Button>
          ) : null}
        </div>
        {grants.error ? <LoadError message={grants.error} onRetry={() => void grants.reload()} /> : null}
        {revoke.error ? <Alert tone="danger" onDismiss={() => revoke.setError(null)}>{revoke.error}</Alert> : null}
        {adding ? (
          <GrantForm
            mode={mode}
            roles={grantableRoles}
            repositories={repositories.data ?? []}
            users={users.data ?? []}
            onCancel={() => setAdding(false)}
            onDone={async () => {
              setAdding(false);
              await grants.reload();
              onChanged?.();
            }}
          />
        ) : null}
        {grants.data === null && !grants.error ? (
          <SkeletonRows rows={3} />
        ) : !grants.data?.length ? (
          <EmptyState icon={<IconFolder size={26} />} title={t('noGrants')} hint={t(mode.kind === 'user' ? 'noGrantsHintUser' : 'noGrantsHintRepo')} />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{mode.kind === 'user' ? t('colRepository') : t('colUser')}</th>
                  <th scope="col">{t('colLocation')}</th>
                  <th scope="col">{t('colRole')}</th>
                  <th scope="col">{t('colGranted')}</th>
                  <th scope="col"><span className="sr-only">{t('colActions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {grants.data.map((grant) => (
                  <tr key={grant.id}>
                    <td>
                      {mode.kind === 'user' ? (
                        <strong>{grant.repository?.name ?? '—'}</strong>
                      ) : (
                        <span>
                          <strong>{grant.user.displayName}</strong> <span className="muted small">@{grant.user.login}</span>
                          {!grant.user.enabled ? <> <Badge>{t('disabled')}</Badge></> : null}
                        </span>
                      )}
                    </td>
                    <td className={grant.folder ? 'mono small' : 'muted'}>{locationLabel(t, grant)}</td>
                    <td>
                      <div className="grant-role">
                        <strong>{grant.role.displayName}</strong>
                        <span className="badge-row">
                          {grant.role.permissions.map((permission) => (
                            <Badge key={permission} tone="accent">{permissionLabel(t, permission)}</Badge>
                          ))}
                        </span>
                      </div>
                    </td>
                    <td className="muted nowrap small">{formatDateTime(grant.createdAt, locale)}</td>
                    <td className="cell-actions">
                      <IconButton label={t('revokeGrant')} disabled={revoke.busy} onClick={() => void revokeGrant(grant)}>
                        <IconX size={16} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EffectivePreview mode={mode} repositories={repositories.data ?? []} users={users.data ?? []} />
    </div>
  );
}

function GrantForm({
  mode,
  roles,
  repositories,
  users,
  onCancel,
  onDone,
}: {
  mode: Mode;
  roles: Role[];
  repositories: Repository[];
  users: AdminUser[];
  onCancel: () => void;
  onDone: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [userId, setUserId] = useState(mode.kind === 'user' ? mode.userId : '');
  const [repositoryId, setRepositoryId] = useState(mode.kind === 'repository' ? mode.repositoryId : '');
  const [folder, setFolder] = useState<PickedFolder>(null);
  const [roleId, setRoleId] = useState('');
  const action = useAction();
  const role = roles.find((candidate) => candidate.id === roleId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run(() =>
      api('/api/v1/admin/grants', {
        method: 'POST',
        body: JSON.stringify({ userId, roleId, repositoryId, folderId: folder?.id ?? null }),
      }),
    );
    if (ok) await onDone();
  }

  return (
    <form className="inline-form grant-form" onSubmit={(event) => void submit(event)}>
      {action.error ? <Alert tone="danger" onDismiss={() => action.setError(null)}>{action.error}</Alert> : null}
      <div className="form-grid">
        {mode.kind === 'repository' ? (
          <Field label={t('colUser')} htmlFor="grant-user">
            <select id="grant-user" required value={userId} onChange={(event) => setUserId(event.target.value)}>
              <option value="">{t('chooseUser')}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} (@{user.login}){user.enabled ? '' : ` — ${t('disabled')}`}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label={t('colRepository')} htmlFor="grant-repo">
            <select
              id="grant-repo"
              required
              value={repositoryId}
              onChange={(event) => {
                setRepositoryId(event.target.value);
                setFolder(null);
              }}
            >
              <option value="">{t('chooseRepository')}</option>
              {repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.name}{repository.status !== 'ACTIVE' ? ` — ${repository.status.toLowerCase()}` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t('colRole')} htmlFor="grant-role" hint={roles.length === 0 ? t('noScopableRoles') : undefined}>
          <select id="grant-role" required value={roleId} onChange={(event) => setRoleId(event.target.value)}>
            <option value="">{t('chooseRole')}</option>
            {roles.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.displayName}</option>
            ))}
          </select>
        </Field>
      </div>
      {role ? (
        <p className="hint">
          {t('roleGives')}{' '}
          {role.permissions.map((permission) => permissionLabel(t, permission)).join(', ')}
        </p>
      ) : null}
      {repositoryId ? (
        <Field label={t('colLocation')} hint={folder ? t('grantFolderHint', { folder: `/${folder.relativePath}` }) : t('grantRepoHint')}>
          <FolderPicker key={repositoryId} repositoryId={repositoryId} value={folder} onChange={setFolder} />
        </Field>
      ) : null}
      <div className="inline-actions">
        <Button onClick={onCancel}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={action.busy || !userId || !repositoryId || !roleId}>
          {action.busy ? t('saving') : t('grantAccess')}
        </Button>
      </div>
    </form>
  );
}

function EffectivePreview({ mode, repositories, users }: { mode: Mode; repositories: Repository[]; users: AdminUser[] }) {
  const { t } = useI18n();
  const [userId, setUserId] = useState(mode.kind === 'user' ? mode.userId : '');
  const [repositoryId, setRepositoryId] = useState(mode.kind === 'repository' ? mode.repositoryId : '');
  const [folder, setFolder] = useState<PickedFolder>(null);
  const [result, setResult] = useState<EffectiveAccessResult | null>(null);
  const action = useAction();

  async function check() {
    setResult(null);
    const params = new URLSearchParams({ userId, repositoryId });
    if (folder) params.set('folderId', folder.id);
    await action.run(async () => setResult(await api<EffectiveAccessResult>(`/api/v1/admin/effective-access?${params}`)));
  }

  return (
    <section className="panel-section">
      <div className="section-head">
        <h3>{t('effectiveHeading')}</h3>
      </div>
      <p className="hint">{t('effectiveHint')}</p>
      <div className="form-grid">
        {mode.kind === 'repository' ? (
          <Field label={t('colUser')} htmlFor="eff-user">
            <select id="eff-user" value={userId} onChange={(event) => { setUserId(event.target.value); setResult(null); }}>
              <option value="">{t('chooseUser')}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.displayName} (@{user.login})</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label={t('colRepository')} htmlFor="eff-repo">
            <select
              id="eff-repo"
              value={repositoryId}
              onChange={(event) => {
                setRepositoryId(event.target.value);
                setFolder(null);
                setResult(null);
              }}
            >
              <option value="">{t('chooseRepository')}</option>
              {repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>{repository.name}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {repositoryId ? (
        <Field label={t('colLocation')}>
          <FolderPicker key={repositoryId} repositoryId={repositoryId} value={folder} onChange={(next) => { setFolder(next); setResult(null); }} />
        </Field>
      ) : null}
      <div className="inline-actions">
        <Button variant="primary" disabled={!userId || !repositoryId || action.busy} onClick={() => void check()}>
          {action.busy ? t('loading') : t('checkAccess')}
        </Button>
      </div>
      {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
      {result ? (
        <div className="effective-result">
          {!result.enabled ? <Alert tone="warning">{t('effectiveUserDisabled')}</Alert> : null}
          <ul className="effective-list">
            {SCOPED_PERMISSIONS.map((permission) => {
              const granted = result.permissions.includes(permission);
              const sources = result.sources.filter((source) => source.permission === permission || source.permission === 'system.admin');
              return (
                <li key={permission} className={granted ? 'granted' : 'denied'}>
                  <Badge tone={granted ? 'success' : 'neutral'}>{granted ? t('allowed') : t('notAllowed')}</Badge>
                  <div>
                    <strong>{permissionLabel(t, permission)}</strong>
                    {granted ? (
                      <ul className="source-list">
                        {sources.map((source, index) => (
                          <li key={index}>
                            {source.permission === 'system.admin' ? t('sourceAdmin') : sourceText(t, source)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hint">{t('deniedByDefault')}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {result.sources.some((source) => source.kind === 'folder' && source.inherited) ? (
            <p className="hint">
              <IconInfo size={14} /> {t('inheritedRevokeHint')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
