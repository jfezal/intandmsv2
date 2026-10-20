import { type FormEvent, useState } from 'react';
import { IconLock, IconPlus, IconShield } from '../../components/icons';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, SkeletonRows } from '../../components/ui';
import { api, type PermissionInfo, type Role } from '../../lib/api';
import { type MessageKey, useI18n } from '../../i18n';
import { Field, LoadError, Modal, permissionLabel, useAction, useLoad } from './shared';

const scopeOrder: Array<{ scope: PermissionInfo['scope']; label: MessageKey; hint: MessageKey }> = [
  { scope: 'resource', label: 'scopeResource', hint: 'scopeResourceHint' },
  { scope: 'capability', label: 'scopeCapability', hint: 'scopeCapabilityHint' },
  { scope: 'global', label: 'scopeGlobal', hint: 'scopeGlobalHint' },
];

export function RolesPage() {
  const { t } = useI18n();
  const roles = useLoad<Role[]>('/api/v1/admin/roles');
  const permissions = useLoad<PermissionInfo[]>('/api/v1/admin/permissions');
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const remove = useAction();

  async function deleteRole(role: Role) {
    if (!window.confirm(t('confirmDeleteRole', { name: role.displayName }))) return;
    if (await remove.run(() => api(`/api/v1/admin/roles/${role.id}`, { method: 'DELETE' }))) await roles.reload();
  }

  return (
    <div className="page">
      <PageHeader
        title={t('rolesHeading')}
        subtitle={t('rolesSubtitle')}
        actions={<Button size="sm" variant="primary" icon={<IconPlus size={16} />} onClick={() => setEditing('new')}>{t('newRole')}</Button>}
      />
      {roles.error ? <LoadError message={roles.error} onRetry={() => void roles.reload()} /> : null}
      {remove.error ? <Alert tone="danger" onDismiss={() => remove.setError(null)}>{remove.error}</Alert> : null}
      <Card>
        {roles.data === null && !roles.error ? (
          <SkeletonRows rows={4} />
        ) : !roles.data?.length ? (
          <EmptyState icon={<IconShield size={28} />} title={t('rolesHeading')} />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('colRole')}</th>
                  <th scope="col">{t('colUsage')}</th>
                  <th scope="col">{t('colPermissions')}</th>
                  <th scope="col">{t('colAssignments')}</th>
                  <th scope="col"><span className="sr-only">{t('colActions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {roles.data.map((role) => {
                  const assigned = role.globalAssignments + role.scopedAssignments;
                  return (
                    <tr key={role.id}>
                      <td>
                        <strong>{role.displayName}</strong>
                        <div className="muted small mono">{role.key}</div>
                        {role.description ? <div className="hint">{role.description}</div> : null}
                      </td>
                      <td>
                        {role.isSystem ? (
                          <Badge tone="warning" icon={<IconLock size={12} />}>{t('systemRole')}</Badge>
                        ) : role.scopable ? (
                          <Badge tone="info">{t('roleScopable')}</Badge>
                        ) : (
                          <Badge>{t('roleGlobalOnly')}</Badge>
                        )}
                      </td>
                      <td>
                        <span className="badge-row">
                          {role.permissions.map((permission) => (
                            <Badge key={permission} tone="accent">{permissionLabel(t, permission)}</Badge>
                          ))}
                        </span>
                      </td>
                      <td className="muted small nowrap">
                        {t('assignmentSummary', { global: role.globalAssignments, scoped: role.scopedAssignments })}
                      </td>
                      <td className="cell-actions nowrap">
                        {!role.isSystem ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(role)}>{t('edit')}</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={assigned > 0 || remove.busy}
                              title={assigned > 0 ? t('roleInUse') : undefined}
                              onClick={() => void deleteRole(role)}
                            >
                              {t('delete')}
                            </Button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing ? (
        <RoleModal
          role={editing === 'new' ? null : editing}
          catalog={permissions.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await roles.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function RoleModal({
  role,
  catalog,
  onClose,
  onSaved,
}: {
  role: Role | null;
  catalog: PermissionInfo[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [key, setKey] = useState(role?.key ?? '');
  const [displayName, setDisplayName] = useState(role?.displayName ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const action = useAction();
  const hasGlobal = selected.some((permission) => catalog.find((entry) => entry.key === permission)?.scope === 'global');
  const usedOnLocations = (role?.scopedAssignments ?? 0) > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = { displayName, description, permissionKeys: selected };
    const ok = await action.run(() =>
      role
        ? api(`/api/v1/admin/roles/${role.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/api/v1/admin/roles', { method: 'POST', body: JSON.stringify({ ...body, key }) }),
    );
    if (ok) await onSaved();
  }

  return (
    <Modal
      wide
      title={role ? t('editRole', { name: role.displayName }) : t('newRole')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" form="role-form" variant="primary" disabled={action.busy || selected.length === 0}>
            {action.busy ? t('saving') : t('save')}
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={(event) => void submit(event)}>
        {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
        <div className="form-grid">
          <Field label={t('roleName')} htmlFor="role-name">
            <input id="role-name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </Field>
          <Field label={t('roleKey')} htmlFor="role-key" hint={role ? t('roleKeyLocked') : t('roleKeyHint')}>
            <input
              id="role-key"
              className="mono"
              required
              disabled={Boolean(role)}
              pattern="[a-z][a-z0-9_]{1,63}"
              value={key}
              onChange={(event) => setKey(event.target.value.toLowerCase())}
            />
          </Field>
        </div>
        <Field label={t('roleDescription')} htmlFor="role-desc">
          <textarea id="role-desc" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>

        {scopeOrder.map((group) => {
          const entries = catalog.filter((entry) => entry.scope === group.scope && entry.key !== 'system.admin');
          if (!entries.length) return null;
          return (
            <fieldset key={group.scope} className="checklist">
              <legend>{t(group.label)}</legend>
              <p className="hint">{t(group.hint)}</p>
              {entries.map((entry) => {
                const locked = usedOnLocations && entry.scope === 'global';
                return (
                  <label key={entry.key} className={`check-row${locked ? ' is-disabled' : ''}`}>
                    <input
                      type="checkbox"
                      disabled={locked && !selected.includes(entry.key)}
                      checked={selected.includes(entry.key)}
                      onChange={(event) =>
                        setSelected((current) => (event.target.checked ? [...current, entry.key] : current.filter((value) => value !== entry.key)))
                      }
                    />
                    <span>
                      <strong>{permissionLabel(t, entry.key)}</strong> <span className="muted small mono">{entry.key}</span>
                      <span className="hint block">{entry.description}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          );
        })}
        {hasGlobal ? <Alert tone="info">{t('roleGlobalWarning')}</Alert> : null}
        {usedOnLocations ? <p className="hint">{t('roleUsedOnLocations')}</p> : null}
      </form>
    </Modal>
  );
}
