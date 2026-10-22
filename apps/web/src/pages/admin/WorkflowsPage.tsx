import { type FormEvent, useMemo, useState } from 'react';
import { IconPlus, IconTasks } from '../../components/icons';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, SkeletonRows } from '../../components/ui';
import {
  api,
  type AdminUser,
  type AdminWorkflow,
  type Department,
  type Role,
  type WorkflowDefinitionBody,
  type WorkflowStepAssignee,
} from '../../lib/api';
import { useI18n } from '../../i18n';
import { Field, LoadError, Modal, useAction, useLoad } from './shared';

type DraftStep = {
  key: string;
  name: string;
  type: WorkflowStepAssignee['type'];
  userId: string;
  roleId: string;
  departmentId: string;
};

function toDraft(definition: WorkflowDefinitionBody): DraftStep[] {
  return definition.steps.map((step) => ({
    key: step.key,
    name: step.name,
    type: step.assignee.type,
    userId: step.assignee.type === 'user' ? step.assignee.userId : '',
    roleId: step.assignee.type === 'role' ? step.assignee.roleId : '',
    departmentId: step.assignee.type === 'department' ? step.assignee.departmentId : '',
  }));
}

function toDefinition(steps: DraftStep[]): WorkflowDefinitionBody {
  return {
    steps: steps.map((step) => {
      const assignee: WorkflowStepAssignee =
        step.type === 'user'
          ? { type: 'user', userId: step.userId }
          : step.type === 'role'
            ? { type: 'role', roleId: step.roleId }
            : { type: 'department', departmentId: step.departmentId };
      return { key: step.key.trim(), name: step.name.trim(), assignee };
    }),
  };
}

function assigneeLabel(
  step: DraftStep,
  users: AdminUser[],
  roles: Role[],
  departments: Department[],
): string {
  if (step.type === 'user') {
    const user = users.find((item) => item.id === step.userId);
    return user ? `${user.displayName} (@${user.login})` : step.userId;
  }
  if (step.type === 'role') {
    return roles.find((item) => item.id === step.roleId)?.displayName ?? step.roleId;
  }
  return departments.find((item) => item.id === step.departmentId)?.name ?? step.departmentId;
}

export function WorkflowsPage() {
  const { t } = useI18n();
  const workflows = useLoad<AdminWorkflow[]>('/api/v1/admin/workflows');
  const users = useLoad<AdminUser[]>('/api/v1/admin/users');
  const roles = useLoad<Role[]>('/api/v1/admin/roles');
  const departments = useLoad<Department[]>('/api/v1/admin/departments');
  const [editing, setEditing] = useState<AdminWorkflow | 'new' | null>(null);
  const toggle = useAction();

  async function setEnabled(workflow: AdminWorkflow, enabled: boolean) {
    if (await toggle.run(() => api(`/api/v1/admin/workflows/${workflow.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }))) {
      await workflows.reload();
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('workflowsHeading')}
        subtitle={t('workflowsSubtitle')}
        actions={<Button size="sm" variant="primary" icon={<IconPlus size={16} />} onClick={() => setEditing('new')}>{t('newWorkflow')}</Button>}
      />
      {workflows.error ? <LoadError message={workflows.error} onRetry={() => void workflows.reload()} /> : null}
      {toggle.error ? <Alert tone="danger" onDismiss={() => toggle.setError(null)}>{toggle.error}</Alert> : null}
      <Card>
        {workflows.data === null && !workflows.error ? (
          <SkeletonRows rows={4} />
        ) : !workflows.data?.length ? (
          <EmptyState icon={<IconTasks size={28} />} title={t('noWorkflows')} hint={t('noWorkflowsHint')} />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t('colWorkflow')}</th>
                  <th scope="col">{t('colSteps')}</th>
                  <th scope="col">{t('colStatus')}</th>
                  <th scope="col"><span className="sr-only">{t('colActions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {workflows.data.map((workflow) => (
                  <tr key={workflow.id}>
                    <td>
                      <strong>{workflow.name}</strong>
                      <div className="muted small mono">{workflow.key}</div>
                    </td>
                    <td className="muted small">{t('workflowStepCount', { count: workflow.definition.steps.length })}</td>
                    <td>{workflow.enabled ? <Badge tone="success">{t('enabled')}</Badge> : <Badge>{t('disabled')}</Badge>}</td>
                    <td className="cell-actions nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(workflow)}>{t('edit')}</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={toggle.busy}
                        onClick={() => void setEnabled(workflow, !workflow.enabled)}
                      >
                        {workflow.enabled ? t('disableAction') : t('enableAction')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing ? (
        <WorkflowModal
          workflow={editing === 'new' ? null : editing}
          users={users.data ?? []}
          roles={roles.data ?? []}
          departments={departments.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await workflows.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function WorkflowModal({
  workflow,
  users,
  roles,
  departments,
  onClose,
  onSaved,
}: {
  workflow: AdminWorkflow | null;
  users: AdminUser[];
  roles: Role[];
  departments: Department[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [key, setKey] = useState(workflow?.key ?? '');
  const [name, setName] = useState(workflow?.name ?? '');
  const [steps, setSteps] = useState<DraftStep[]>(
    workflow ? toDraft(workflow.definition) : [{ key: 'review', name: '', type: 'user', userId: '', roleId: '', departmentId: '' }],
  );
  const action = useAction();
  const complete = useMemo(
    () =>
      name.trim() &&
      steps.length > 0 &&
      steps.every(
        (step) =>
          step.key.trim() &&
          step.name.trim() &&
          (step.type === 'user' ? step.userId : step.type === 'role' ? step.roleId : step.departmentId),
      ),
    [name, steps],
  );

  function update(index: number, patch: Partial<DraftStep>) {
    setSteps((current) => current.map((step, item) => (item === index ? { ...step, ...patch } : step)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const definition = toDefinition(steps);
    const ok = await action.run(() =>
      workflow
        ? api(`/api/v1/admin/workflows/${workflow.id}`, { method: 'PATCH', body: JSON.stringify({ name, definition }) })
        : api('/api/v1/admin/workflows', { method: 'POST', body: JSON.stringify({ key, name, definition }) }),
    );
    if (ok) await onSaved();
  }

  return (
    <Modal
      wide
      title={workflow ? t('editWorkflow', { name: workflow.name }) : t('newWorkflow')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" form="workflow-form" variant="primary" disabled={action.busy || !complete}>
            {action.busy ? t('saving') : t('save')}
          </Button>
        </>
      }
    >
      <form id="workflow-form" onSubmit={(event) => void submit(event)}>
        {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
        <div className="form-grid">
          <Field label={t('workflowName')} htmlFor="wf-name">
            <input id="wf-name" required value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={t('workflowKey')} htmlFor="wf-key" hint={workflow ? t('workflowKeyLocked') : t('workflowKeyHint')}>
            <input
              id="wf-key"
              className="mono"
              required
              disabled={Boolean(workflow)}
              pattern="[a-z][a-z0-9_]{1,63}"
              value={key}
              onChange={(event) => setKey(event.target.value.toLowerCase())}
            />
          </Field>
        </div>
        <p className="hint">{t('workflowStepsHint')}</p>
        <ol className="workflow-steps">
          {steps.map((step, index) => (
            <li key={index}>
              <div className="form-grid">
                <Field label={t('workflowStepName')} htmlFor={`wf-step-name-${index}`}>
                  <input
                    id={`wf-step-name-${index}`}
                    required
                    value={step.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                </Field>
                <Field label={t('workflowStepKey')} htmlFor={`wf-step-key-${index}`}>
                  <input
                    id={`wf-step-key-${index}`}
                    className="mono"
                    required
                    pattern="[a-z][a-z0-9_]*"
                    value={step.key}
                    onChange={(event) => update(index, { key: event.target.value.toLowerCase() })}
                  />
                </Field>
              </div>
              <div className="form-grid">
                <Field label={t('workflowAssigneeType')} htmlFor={`wf-step-type-${index}`}>
                  <select
                    id={`wf-step-type-${index}`}
                    value={step.type}
                    onChange={(event) => update(index, { type: event.target.value as DraftStep['type'] })}
                  >
                    <option value="user">{t('workflowAssigneeUser')}</option>
                    <option value="role">{t('workflowAssigneeRole')}</option>
                    <option value="department">{t('workflowAssigneeDepartment')}</option>
                  </select>
                </Field>
                {step.type === 'user' ? (
                  <Field label={t('workflowAssigneeUser')} htmlFor={`wf-step-user-${index}`}>
                    <select
                      id={`wf-step-user-${index}`}
                      required
                      value={step.userId}
                      onChange={(event) => update(index, { userId: event.target.value })}
                    >
                      <option value="">{t('workflowChoosePerson')}</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName} (@{user.login})
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {step.type === 'role' ? (
                  <Field label={t('workflowAssigneeRole')} htmlFor={`wf-step-role-${index}`}>
                    <select
                      id={`wf-step-role-${index}`}
                      required
                      value={step.roleId}
                      onChange={(event) => update(index, { roleId: event.target.value })}
                    >
                      <option value="">{t('workflowChooseRole')}</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {step.type === 'department' ? (
                  <Field label={t('workflowAssigneeDepartment')} htmlFor={`wf-step-dept-${index}`}>
                    <select
                      id={`wf-step-dept-${index}`}
                      required
                      value={step.departmentId}
                      onChange={(event) => update(index, { departmentId: event.target.value })}
                    >
                      <option value="">{t('workflowChooseDepartment')}</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>
              <p className="muted small">{assigneeLabel(step, users, roles, departments)}</p>
              {steps.length > 1 ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setSteps((current) => current.filter((_, item) => item !== index))}>
                  {t('remove')}
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
        {steps.length < 10 ? (
          <Button
            type="button"
            size="sm"
            icon={<IconPlus size={16} />}
            onClick={() =>
              setSteps((current) => [
                ...current,
                { key: `step${current.length + 1}`, name: '', type: 'user', userId: '', roleId: '', departmentId: '' },
              ])
            }
          >
            {t('addWorkflowStep')}
          </Button>
        ) : null}
      </form>
    </Modal>
  );
}
