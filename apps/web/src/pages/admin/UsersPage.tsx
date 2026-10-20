import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { IconLock, IconPlus, IconRefresh, IconUsers } from '../../components/icons';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, SkeletonRows } from '../../components/ui';
import { api, type AdminUser, type Role } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useI18n } from '../../i18n';
import { AccessPanel } from './AccessPanel';
import { Drawer, Field, LoadError, Modal, Tabs, generatePassword, permissionLabel, useAction, useLoad } from './shared';

const PASSWORD_MIN = 12;

export function UsersPage({ currentUserId }: { currentUserId: string }) {
  const { t, locale } = useI18n();
  const users = useLoad<AdminUser[]>('/api/v1/admin/users');
  const roles = useLoad<Role[]>('/api/v1/admin/roles');
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (users.data ?? []).filter(
      (user) => !q || user.displayName.toLowerCase().includes(q) || user.login.includes(q),
    );
  }, [users.data, filter]);
  const selected = users.data?.find((user) => user.id === selectedId) ?? null;

  return (
    <div className="page">
      <PageHeader
        title={t('usersHeading')}
        subtitle={t('usersSubtitle')}
        actions={
          <>
            <Button size="sm" icon={<IconRefresh size={16} />} onClick={() => void users.reload()}>{t('refresh')}</Button>
            <Button size="sm" variant="primary" icon={<IconPlus size={16} />} onClick={() => setCreating(true)}>{t('newUser')}</Button>
          </>
        }
      />
      {users.error ? <LoadError message={users.error} onRetry={() => void users.reload()} /> : null}
      <Card>
        <div className="table-toolbar">
          <input
            type="search"
            className="filter-input"
            placeholder={t('filterUsers')}
            aria-label={t('filterUsers')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <span className="muted small">{t('usersCount', { count: rows.length })}</span>
        </div>
        {users.data === null && !users.error ? (
          <SkeletonRows rows={4} />
        ) : !rows.length ? (
          <EmptyState icon={<IconUsers size={28} />} title={t('noUsersMatch')} />
        ) : (
          <div className="table-scroll">
            <table className="data-table clickable-rows">
              <thead>
                <tr>
                  <th scope="col">{t('colDisplayName')}</th>
                  <th scope="col">{t('colRoles')}</th>
                  <th scope="col">{t('colAccess')}</th>
                  <th scope="col">{t('colLastLogin')}</th>
                  <th scope="col">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr
                    key={user.id}
                    tabIndex={0}
                    onClick={() => setSelectedId(user.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedId(user.id);
                      }
                    }}
                  >
                    <td>
                      <span className="user-cell">
                        <span className="avatar avatar-sm" aria-hidden="true">{user.displayName.slice(0, 2).toUpperCase()}</span>
                        <span>
                          <strong>{user.displayName}</strong>
                          <span className="muted small mono"> @{user.login}</span>
                          {user.id === currentUserId ? <span className="muted small"> · {t('you')}</span> : null}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="badge-row">
                        {user.roles.length ? user.roles.map((role) => <Badge key={role.id} tone="accent">{role.displayName}</Badge>) : <span className="muted small">{t('noGlobalRoles')}</span>}
                      </span>
                    </td>
                    <td className="muted small">{user.grantCount ? t('grantCount', { count: user.grantCount }) : '—'}</td>
                    <td className="muted small nowrap">{user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : t('never')}</td>
                    <td>
                      <span className="badge-row">
                        <Badge tone={user.enabled ? 'success' : 'neutral'}>{user.enabled ? t('enabled') : t('disabled')}</Badge>
                        {user.mustChangePassword ? <Badge tone="warning" icon={<IconLock size={12} />}>{t('mustChangeBadge')}</Badge> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating ? (
        <CreateUserModal
          roles={roles.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            await users.reload();
            setSelectedId(id);
          }}
        />
      ) : null}
      {selected ? (
        <UserDrawer
          user={selected}
          roles={roles.data ?? []}
          isSelf={selected.id === currentUserId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void users.reload()}
        />
      ) : null}
    </div>
  );
}

function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  return (
    <Field label={t('temporaryPassword')} htmlFor={id} hint={t('passwordRuleHint', { min: PASSWORD_MIN })}>
      <div className="input-with-action">
        <input id={id} type="text" className="mono" autoComplete="off" minLength={PASSWORD_MIN} required value={value} onChange={(event) => onChange(event.target.value)} />
        <Button size="sm" onClick={() => onChange(generatePassword())}>{t('generate')}</Button>
      </div>
    </Field>
  );
}

function CreateUserModal({ roles, onClose, onCreated }: { roles: Role[]; onClose: () => void; onCreated: (id: string) => void | Promise<void> }) {
  const { t } = useI18n();
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const action = useAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    let id = '';
    const ok = await action.run(async () => {
      ({ id } = await api<{ id: string }>('/api/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ login, displayName, password, roleIds }),
      }));
    });
    if (ok) await onCreated(id);
  }

  return (
    <Modal
      title={t('newUser')}
      description={t('newUserHint')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" form="create-user" variant="primary" disabled={action.busy}>{action.busy ? t('saving') : t('createUser')}</Button>
        </>
      }
    >
      <form id="create-user" onSubmit={(event) => void submit(event)}>
        {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
        <Field label={t('colLogin')} htmlFor="new-login" hint={t('loginRuleHint')}>
          <input id="new-login" required autoComplete="off" pattern="[A-Za-z0-9._\-]{2,128}" value={login} onChange={(event) => setLogin(event.target.value)} />
        </Field>
        <Field label={t('colDisplayName')} htmlFor="new-name">
          <input id="new-name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </Field>
        <PasswordField id="new-password" value={password} onChange={setPassword} />
        <Alert tone="info">{t('temporaryPasswordNote')}</Alert>
        <RoleChecklist roles={roles} value={roleIds} onChange={setRoleIds} />
      </form>
    </Modal>
  );
}

function RoleChecklist({ roles, value, onChange }: { roles: Role[]; value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="checklist">
      <legend>{t('globalRolesHeading')}</legend>
      <p className="hint">{t('globalRolesHint')}</p>
      {roles.map((role) => (
        <label key={role.id} className="check-row">
          <input
            type="checkbox"
            checked={value.includes(role.id)}
            onChange={(event) => onChange(event.target.checked ? [...value, role.id] : value.filter((id) => id !== role.id))}
          />
          <span>
            <strong>{role.displayName}</strong>
            {role.isSystem ? <> <Badge tone="warning">{t('systemRole')}</Badge></> : null}
            <span className="hint block">{role.permissions.map((permission) => permissionLabel(t, permission)).join(' · ')}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

type DrawerTab = 'profile' | 'roles' | 'access';

function UserDrawer({
  user,
  roles,
  isSelf,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  roles: Role[];
  isSelf: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<DrawerTab>('profile');
  return (
    <Drawer
      title={user.displayName}
      subtitle={<span className="mono">@{user.login}</span>}
      badges={
        <>
          <Badge tone={user.enabled ? 'success' : 'neutral'}>{user.enabled ? t('enabled') : t('disabled')}</Badge>
          {user.mustChangePassword ? <Badge tone="warning">{t('mustChangeBadge')}</Badge> : null}
          {isSelf ? <Badge>{t('you')}</Badge> : null}
        </>
      }
      onClose={onClose}
    >
      <Tabs<DrawerTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'profile', label: t('tabProfile') },
          { id: 'roles', label: t('tabGlobalRoles'), count: user.roles.length },
          { id: 'access', label: t('tabAccess'), count: user.grantCount },
        ]}
      />
      {tab === 'profile' ? (
        <ProfileTab user={user} isSelf={isSelf} onChanged={onChanged} locale={locale} />
      ) : tab === 'roles' ? (
        <RolesTab user={user} roles={roles} onChanged={onChanged} />
      ) : (
        <AccessPanel mode={{ kind: 'user', userId: user.id }} onChanged={onChanged} />
      )}
    </Drawer>
  );
}

function ProfileTab({ user, isSelf, onChanged, locale }: { user: AdminUser; isSelf: boolean; onChanged: () => void; locale: 'en' | 'ms' }) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => setDisplayName(user.displayName), [user.displayName]);

  async function patch(body: object, message: string) {
    setNotice(null);
    if (await action.run(() => api(`/api/v1/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(body) }))) {
      setNotice(message);
      onChanged();
    }
  }

  async function toggleEnabled() {
    if (user.enabled && !window.confirm(t('confirmDisableUser', { name: user.displayName }))) return;
    await patch({ enabled: !user.enabled }, user.enabled ? t('userDisabledNotice') : t('userEnabledNotice'));
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const password = newPassword;
    if (await action.run(() => api(`/api/v1/admin/users/${user.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }))) {
      setIssuedPassword(password);
      setResetting(false);
      onChanged();
    }
  }

  async function endSessions() {
    if (!window.confirm(t('confirmEndSessions', { name: user.displayName }))) return;
    setNotice(null);
    let revoked = 0;
    if (await action.run(async () => ({ revoked } = await api<{ revoked: number }>(`/api/v1/admin/users/${user.id}/revoke-sessions`, { method: 'POST' })))) {
      setNotice(t('sessionsEnded', { count: revoked }));
      onChanged();
    }
  }

  return (
    <div className="stack">
      {action.error ? <Alert tone="danger" onDismiss={() => action.setError(null)}>{action.error}</Alert> : null}
      {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}
      {issuedPassword ? (
        <Alert tone="warning" title={t('passwordIssuedTitle')} onDismiss={() => setIssuedPassword(null)}>
          <p>{t('passwordIssuedBody')}</p>
          <code className="secret">{issuedPassword}</code>
        </Alert>
      ) : null}

      <dl className="meta-list">
        <div><dt>{t('colLogin')}</dt><dd className="mono">{user.login}</dd></div>
        <div><dt>{t('created')}</dt><dd>{formatDateTime(user.createdAt, locale)}</dd></div>
        <div><dt>{t('colLastLogin')}</dt><dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : t('never')}</dd></div>
        <div><dt>{t('activeSessions')}</dt><dd>{user.activeSessions}</dd></div>
      </dl>

      <form
        className="panel-section"
        onSubmit={(event) => {
          event.preventDefault();
          void patch({ displayName }, t('savedNotice'));
        }}
      >
        <Field label={t('colDisplayName')} htmlFor="edit-name">
          <div className="input-with-action">
            <input id="edit-name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            <Button type="submit" size="sm" disabled={action.busy || displayName.trim() === user.displayName}>{t('save')}</Button>
          </div>
        </Field>
      </form>

      <section className="panel-section">
        <h3>{t('securityHeading')}</h3>
        <div className="action-list">
          <div className="action-item">
            <div>
              <strong>{t('resetPassword')}</strong>
              <p className="hint">{t('resetPasswordHint')}</p>
            </div>
            {!resetting ? (
              <Button size="sm" onClick={() => { setNewPassword(generatePassword()); setResetting(true); }}>{t('resetPassword')}</Button>
            ) : null}
          </div>
          {resetting ? (
            <form className="inline-form" onSubmit={(event) => void resetPassword(event)}>
              <PasswordField id="reset-password" value={newPassword} onChange={setNewPassword} />
              <div className="inline-actions">
                <Button onClick={() => setResetting(false)}>{t('cancel')}</Button>
                <Button type="submit" variant="primary" disabled={action.busy}>{t('resetPassword')}</Button>
              </div>
            </form>
          ) : null}
          <div className="action-item">
            <div>
              <strong>{t('endSessions')}</strong>
              <p className="hint">{t('endSessionsHint')}</p>
            </div>
            <Button size="sm" disabled={action.busy} onClick={() => void endSessions()}>{t('endSessions')}</Button>
          </div>
          <div className="action-item">
            <div>
              <strong>{user.enabled ? t('disableUser') : t('enableUser')}</strong>
              <p className="hint">{isSelf ? t('cannotDisableSelf') : user.enabled ? t('disableUserHint') : t('enableUserHint')}</p>
            </div>
            <Button size="sm" variant={user.enabled ? 'danger' : 'secondary'} disabled={action.busy || isSelf} onClick={() => void toggleEnabled()}>
              {user.enabled ? t('disableUser') : t('enableUser')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function RolesTab({ user, roles, onChanged }: { user: AdminUser; roles: Role[]; onChanged: () => void }) {
  const { t } = useI18n();
  const initial = useMemo(() => user.roles.map((role) => role.id).sort(), [user.roles]);
  const [roleIds, setRoleIds] = useState<string[]>(initial);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const dirty = [...roleIds].sort().join() !== initial.join();

  useEffect(() => setRoleIds(initial), [initial]);

  async function save() {
    setSaved(false);
    if (await action.run(() => api(`/api/v1/admin/users/${user.id}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds }) }))) {
      setSaved(true);
      onChanged();
    }
  }

  return (
    <div className="stack">
      {action.error ? <Alert tone="danger" onDismiss={() => action.setError(null)}>{action.error}</Alert> : null}
      {saved ? <Alert tone="success" onDismiss={() => setSaved(false)}>{t('savedNotice')}</Alert> : null}
      <RoleChecklist roles={roles} value={roleIds} onChange={setRoleIds} />
      <div className="inline-actions">
        <Button onClick={() => setRoleIds(initial)} disabled={!dirty}>{t('cancel')}</Button>
        <Button variant="primary" disabled={!dirty || action.busy} onClick={() => void save()}>{action.busy ? t('saving') : t('save')}</Button>
      </div>
    </div>
  );
}
