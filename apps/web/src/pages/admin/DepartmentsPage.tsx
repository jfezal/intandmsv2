import { type FormEvent, useMemo, useState } from 'react';
import { IconPlus, IconUsers } from '../../components/icons';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, SkeletonRows } from '../../components/ui';
import { api, type AdminUser, type Department } from '../../lib/api';
import { useI18n } from '../../i18n';
import { Drawer, Field, LoadError, Modal, useAction, useLoad } from './shared';

export function DepartmentsPage() {
  const { t } = useI18n();
  const departments = useLoad<Department[]>('/api/v1/admin/departments');
  const users = useLoad<AdminUser[]>('/api/v1/admin/users');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const remove = useAction();
  const selected = departments.data?.find((department) => department.id === selectedId) ?? null;

  async function deleteDepartment(department: Department) {
    if (!window.confirm(t('confirmDeleteDepartment', { name: department.name, count: department.memberCount }))) return;
    if (await remove.run(() => api(`/api/v1/admin/departments/${department.id}`, { method: 'DELETE' }))) {
      if (selectedId === department.id) setSelectedId(null);
      await departments.reload();
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('departmentsHeading')}
        subtitle={t('departmentsSubtitle')}
        actions={<Button size="sm" variant="primary" icon={<IconPlus size={16} />} onClick={() => setCreating(true)}>{t('newDepartment')}</Button>}
      />
      {departments.error ? <LoadError message={departments.error} onRetry={() => void departments.reload()} /> : null}
      {remove.error ? <Alert tone="danger" onDismiss={() => remove.setError(null)}>{remove.error}</Alert> : null}
      <Card>
        {departments.data === null && !departments.error ? (
          <SkeletonRows rows={3} />
        ) : !departments.data?.length ? (
          <EmptyState icon={<IconUsers size={28} />} title={t('noDepartments')} hint={t('noDepartmentsHint')} />
        ) : (
          <div className="table-scroll">
            <table className="data-table clickable-rows">
              <thead>
                <tr>
                  <th scope="col">{t('colDepartment')}</th>
                  <th scope="col">{t('colMembers')}</th>
                  <th scope="col">{t('colAccess')}</th>
                  <th scope="col"><span className="sr-only">{t('colActions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {departments.data.map((department) => (
                  <tr
                    key={department.id}
                    tabIndex={0}
                    onClick={() => setSelectedId(department.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedId(department.id);
                      }
                    }}
                  >
                    <td>
                      <strong>{department.name}</strong>
                      {department.description ? <div className="hint">{department.description}</div> : null}
                    </td>
                    <td>{t('memberCount', { count: department.memberCount })}</td>
                    <td className="muted">{t('grantCount', { count: department.grantCount })}</td>
                    <td className="cell-actions">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteDepartment(department);
                        }}
                      >
                        {t('deleteAction')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating ? (
        <DepartmentEditor
          users={users.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void departments.reload();
          }}
        />
      ) : null}
      {selected ? (
        <Drawer title={selected.name} onClose={() => setSelectedId(null)}>
          <DepartmentEditor
            existing={selected}
            users={users.data ?? []}
            onClose={() => setSelectedId(null)}
            onSaved={() => void departments.reload()}
          />
        </Drawer>
      ) : null}
    </div>
  );
}

function DepartmentEditor({
  existing,
  users,
  onClose,
  onSaved,
}: {
  existing?: Department;
  users: AdminUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set(existing?.members.map((member) => member.id) ?? []));
  const [filter, setFilter] = useState('');
  const action = useAction();
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return users.filter(
      (user) => !needle || user.displayName.toLowerCase().includes(needle) || user.login.includes(needle),
    );
  }, [users, filter]);

  function toggle(userId: string) {
    setMemberIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = { name, description: description.trim() || undefined, memberIds: [...memberIds] };
    const ok = await action.run(() =>
      existing
        ? api(`/api/v1/admin/departments/${existing.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/api/v1/admin/departments', { method: 'POST', body: JSON.stringify(body) }),
    );
    if (ok) onSaved();
  }

  const form = (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
      <Field label={t('colDepartment')} htmlFor="dept-name">
        <input id="dept-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label={t('departmentDescription')} htmlFor="dept-desc">
        <textarea id="dept-desc" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <Field label={t('colMembers')} hint={t('departmentMembersHint')}>
        <input type="search" placeholder={t('filterUsers')} aria-label={t('filterUsers')} value={filter} onChange={(event) => setFilter(event.target.value)} />
        <ul className="user-picker-list">
          {visible.map((user) => (
            <li key={user.id}>
              <label className="dir-row">
                <input type="checkbox" checked={memberIds.has(user.id)} onChange={() => toggle(user.id)} />
                <span>
                  {user.displayName} <span className="muted small">@{user.login}</span>
                  {!user.enabled ? <> <Badge>{t('disabled')}</Badge></> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Field>
      <p className="hint">{t('departmentGrantHint')}</p>
      <div className="inline-actions">
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={action.busy || !name.trim()}>
          {action.busy ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );

  return existing ? form : (
    <Modal title={t('newDepartment')} onClose={onClose}>
      {form}
    </Modal>
  );
}
