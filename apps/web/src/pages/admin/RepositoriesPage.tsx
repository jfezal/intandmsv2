import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { IconDatabase, IconPlus, IconRefresh, IconX } from '../../components/icons';
import { Alert, Badge, Button, Card, EmptyState, IconButton, PageHeader, SkeletonRows } from '../../components/ui';
import { api, type AdminUser, type ConnectorList, type Repository, type RepositoryAdmin, type RepositoryStatus, type Role } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { href, navigate, useRoute } from '../../lib/route';
import { type MessageKey, type Translator, useI18n } from '../../i18n';
import { AccessPanel } from './AccessPanel';
import { Drawer, Field, LoadError, Modal, Steps, Tabs, useAction, useLoad } from './shared';
import { ConnectorState, DirectoryBrowser } from './StoragePage';

const SCHEDULES: Array<{ minutes: number | null; label: MessageKey }> = [
  { minutes: null, label: 'scheduleManual' },
  { minutes: 15, label: 'schedule15m' },
  { minutes: 60, label: 'scheduleHourly' },
  { minutes: 360, label: 'schedule6h' },
  { minutes: 1440, label: 'scheduleDaily' },
];

function scheduleLabel(t: Translator, minutes: number | null): string {
  const preset = SCHEDULES.find((entry) => entry.minutes === minutes);
  return preset ? t(preset.label) : t('scheduleEvery', { minutes: minutes ?? 0 });
}

function statusTone(status: RepositoryStatus): 'success' | 'neutral' | 'warning' {
  return status === 'ACTIVE' ? 'success' : status === 'ARCHIVED' ? 'warning' : 'neutral';
}

function StatusBadge({ status }: { status: RepositoryStatus }) {
  const { t } = useI18n();
  const label: Record<RepositoryStatus, MessageKey> = { ACTIVE: 'enabled', DISABLED: 'disabled', ARCHIVED: 'archived' };
  return <Badge tone={statusTone(status)}>{t(label[status])}</Badge>;
}

export function RepositoriesPage({ onRepositoriesChanged }: { onRepositoriesChanged: () => void }) {
  const { t } = useI18n();
  const route = useRoute();
  const repositories = useLoad<Repository[]>('/api/v1/repositories');
  const [wizard, setWizard] = useState(false);
  const selectedId = route.name === 'admin-repositories' ? (route.repositoryId ?? null) : null;
  const selectedTab = route.name === 'admin-repositories' ? route.tab : undefined;

  function changed() {
    void repositories.reload();
    onRepositoriesChanged();
  }

  return (
    <div className="page">
      <PageHeader
        title={t('repositoriesAdminHeading')}
        subtitle={t('repositoriesAdminSubtitle')}
        actions={
          <>
            <Button size="sm" icon={<IconRefresh size={16} />} onClick={() => void repositories.reload()}>{t('refresh')}</Button>
            <Button size="sm" variant="primary" icon={<IconPlus size={16} />} onClick={() => setWizard(true)}>{t('newRepository')}</Button>
          </>
        }
      />
      {repositories.error ? <LoadError message={repositories.error} onRetry={() => void repositories.reload()} /> : null}
      <Card>
        {repositories.data === null && !repositories.error ? (
          <SkeletonRows rows={3} />
        ) : !repositories.data?.length ? (
          <EmptyState
            icon={<IconDatabase size={28} />}
            title={t('noRepositoriesYet')}
            action={<Button variant="primary" icon={<IconPlus size={16} />} onClick={() => setWizard(true)}>{t('newRepository')}</Button>}
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table clickable-rows">
              <thead>
                <tr>
                  <th scope="col">{t('colName')}</th>
                  <th scope="col">{t('colType')}</th>
                  <th scope="col">{t('colRoot')}</th>
                  <th scope="col">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {repositories.data.map((repository) => (
                  <tr
                    key={repository.id}
                    tabIndex={0}
                    onClick={() => navigate({ name: 'admin-repositories', repositoryId: repository.id })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate({ name: 'admin-repositories', repositoryId: repository.id });
                      }
                    }}
                  >
                    <td>
                      <strong>{repository.name}</strong>
                      {repository.description ? <div className="hint">{repository.description}</div> : null}
                    </td>
                    <td>
                      <span className={`type-pill ${repository.type === 'MANAGED' ? 'pill-managed' : 'pill-indexed'}`}>
                        {repository.type === 'MANAGED' ? t('managed') : t('indexed')}
                      </span>
                    </td>
                    <td className="mono small">/{repository.rootRelativePath}</td>
                    <td><StatusBadge status={repository.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {wizard ? (
        <RepositoryWizard
          onClose={() => setWizard(false)}
          onCreated={(id) => {
            setWizard(false);
            changed();
            navigate({ name: 'admin-repositories', repositoryId: id });
          }}
        />
      ) : null}
      {selectedId ? (
        <RepositoryDrawer
          repositoryId={selectedId}
          initialTab={selectedTab}
          onClose={() => navigate({ name: 'admin-repositories' })}
          onChanged={changed}
        />
      ) : null}
    </div>
  );
}

type InitialGrant = { userId: string; roleId: string };

function RepositoryWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<'MANAGED' | 'INDEXED'>('MANAGED');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectorId, setConnectorId] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [schedule, setSchedule] = useState<number | null>(60);
  const [grants, setGrants] = useState<InitialGrant[]>([]);
  const connectors = useLoad<ConnectorList>(type === 'INDEXED' ? '/api/v1/connectors' : null);
  const users = useLoad<AdminUser[]>('/api/v1/admin/users');
  const roles = useLoad<Role[]>('/api/v1/admin/roles');
  const action = useAction();

  const usable = (connectors.data?.connectors ?? []).filter((connector) => connector.status === 'ACTIVE' && connector.browsable);
  const grantRoles = (roles.data ?? []).filter((role) => role.scopable && !role.isSystem);
  const connector = usable.find((candidate) => candidate.id === connectorId);
  const steps = [t('stepBasics'), t('stepStorage'), t('stepAccess'), t('stepReview')];

  const canNext = [
    name.trim().length > 0,
    type === 'MANAGED' || Boolean(connectorId),
    grants.every((grant) => grant.userId && grant.roleId),
    true,
  ][step];

  async function create() {
    const body =
      type === 'MANAGED'
        ? { type, name, description, grants }
        : { type, name, description, grants, connectorId, rootPath, scanIntervalMinutes: schedule };
    let id = '';
    const ok = await action.run(async () => {
      ({ id } = await api<Repository>('/api/v1/repositories', { method: 'POST', body: JSON.stringify(body) }));
    });
    if (ok) onCreated(id);
  }

  function next(event?: FormEvent) {
    event?.preventDefault();
    if (!canNext) return;
    if (step < 3) setStep(step + 1);
    else void create();
  }

  return (
    <Modal
      wide
      title={t('newRepository')}
      onClose={onClose}
      footer={
        <>
          {step === 0 ? <Button onClick={onClose}>{t('cancel')}</Button> : <Button onClick={() => setStep(step - 1)}>{t('back')}</Button>}
          <Button variant="primary" disabled={!canNext || action.busy} onClick={() => next()}>
            {step < 3 ? t('next') : action.busy ? t('saving') : t('createRepository')}
          </Button>
        </>
      }
    >
      <Steps steps={steps} current={step} />
      {action.error ? <Alert tone="danger" onDismiss={() => action.setError(null)}>{action.error}</Alert> : null}

      {step === 0 ? (
        <form onSubmit={next}>
          <div className="choice-grid choice-grid-2" role="radiogroup" aria-label={t('colType')}>
            {(['MANAGED', 'INDEXED'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={type === option}
                className={`choice-card${type === option ? ' selected' : ''}`}
                onClick={() => setType(option)}
              >
                <strong>{option === 'MANAGED' ? t('managed') : t('indexed')}</strong>
                <span className="hint">{option === 'MANAGED' ? t('repositoryNameHint') : t('indexedRepoHint')}</span>
              </button>
            ))}
          </div>
          <Field label={t('repositoryName')} htmlFor="repo-name">
            <input id="repo-name" required value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label={t('repositoryDescription')} htmlFor="repo-desc">
            <textarea id="repo-desc" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        </form>
      ) : null}

      {step === 1 ? (
        type === 'MANAGED' ? (
          <Alert tone="info">{t('managedStorageNote')}</Alert>
        ) : (
          <div className="stack">
            {connectors.error ? <LoadError message={connectors.error} onRetry={() => void connectors.reload()} /> : null}
            <Field label={t('storageConnection')} htmlFor="repo-conn" hint={usable.length === 0 ? t('noUsableConnectors') : undefined}>
              <select
                id="repo-conn"
                value={connectorId}
                onChange={(event) => {
                  setConnectorId(event.target.value);
                  setRootPath('');
                }}
              >
                <option value="">{t('chooseConnection')}</option>
                {usable.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.protocol.toUpperCase()})
                  </option>
                ))}
              </select>
            </Field>
            {connectorId ? (
              <Field label={t('repositoryRoot')} hint={t('repositoryRootHint')}>
                <DirectoryBrowser key={connectorId} connectorId={connectorId} value={rootPath} onChange={setRootPath} selectable />
              </Field>
            ) : null}
            {usable.length === 0 && connectors.data ? (
              <p className="hint">
                <a className="link" href={href({ name: 'admin-connectors' })}>{t('goToStorage')}</a>
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {step === 2 ? (
        <div className="stack">
          <p className="hint">{t('initialAccessHint')}</p>
          {grants.map((grant, index) => (
            <div key={index} className="grant-line">
              <select
                aria-label={t('colUser')}
                value={grant.userId}
                onChange={(event) => setGrants(grants.map((row, i) => (i === index ? { ...row, userId: event.target.value } : row)))}
              >
                <option value="">{t('chooseUser')}</option>
                {(users.data ?? []).map((user) => (
                  <option key={user.id} value={user.id}>{user.displayName} (@{user.login})</option>
                ))}
              </select>
              <select
                aria-label={t('colRole')}
                value={grant.roleId}
                onChange={(event) => setGrants(grants.map((row, i) => (i === index ? { ...row, roleId: event.target.value } : row)))}
              >
                <option value="">{t('chooseRole')}</option>
                {grantRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.displayName}</option>
                ))}
              </select>
              <IconButton label={t('remove')} onClick={() => setGrants(grants.filter((_, i) => i !== index))}>
                <IconX size={16} />
              </IconButton>
            </div>
          ))}
          <div>
            <Button size="sm" icon={<IconPlus size={16} />} onClick={() => setGrants([...grants, { userId: '', roleId: '' }])}>{t('addPerson')}</Button>
          </div>
          {grants.length === 0 ? <Alert tone="info">{t('noInitialAccess')}</Alert> : null}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="stack">
          {type === 'INDEXED' ? (
            <Field label={t('indexSchedule')} htmlFor="repo-schedule" hint={t('indexScheduleHint')}>
              <select
                id="repo-schedule"
                value={schedule ?? ''}
                onChange={(event) => setSchedule(event.target.value === '' ? null : Number(event.target.value))}
              >
                {SCHEDULES.map((entry) => (
                  <option key={entry.label} value={entry.minutes ?? ''}>{t(entry.label)}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <dl className="meta-list">
            <div><dt>{t('repositoryName')}</dt><dd>{name}</dd></div>
            <div><dt>{t('colType')}</dt><dd>{type === 'MANAGED' ? t('managed') : t('indexed')}</dd></div>
            {type === 'INDEXED' ? (
              <>
                <div><dt>{t('storageConnection')}</dt><dd>{connector?.name ?? '—'}</dd></div>
                <div><dt>{t('repositoryRoot')}</dt><dd className="mono">/{rootPath}</dd></div>
                <div><dt>{t('indexSchedule')}</dt><dd>{scheduleLabel(t, schedule)}</dd></div>
              </>
            ) : null}
            <div><dt>{t('stepAccess')}</dt><dd>{grants.length ? t('peopleCount', { count: grants.length }) : t('adminsOnly')}</dd></div>
          </dl>
          {type === 'INDEXED' ? <Alert tone="info">{t('firstScanNote')}</Alert> : null}
        </div>
      ) : null}
    </Modal>
  );
}

type RepoTab = 'overview' | 'settings' | 'access';

function RepositoryDrawer({
  repositoryId,
  initialTab,
  onClose,
  onChanged,
}: {
  repositoryId: string;
  initialTab?: RepoTab;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const detail = useLoad<RepositoryAdmin>(`/api/v1/repositories/${repositoryId}/admin`);
  const [tab, setTab] = useState<RepoTab>(initialTab ?? 'overview');
  useEffect(() => {
    setTab(initialTab ?? 'overview');
  }, [initialTab, repositoryId]);
  const repository = detail.data;
  const { reload } = detail;
  const scanStatus = repository?.scan?.status;

  useEffect(() => {
    if (scanStatus !== 'running' && scanStatus !== 'queued') return;
    const timer = window.setInterval(() => void reload(), 4000);
    return () => window.clearInterval(timer);
  }, [scanStatus, reload]);

  return (
    <Drawer
      title={repository?.name ?? t('loading')}
      subtitle={repository ? <span className="mono">/{repository.rootRelativePath}</span> : undefined}
      badges={
        repository ? (
          <>
            <span className={`type-pill ${repository.type === 'MANAGED' ? 'pill-managed' : 'pill-indexed'}`}>
              {repository.type === 'MANAGED' ? t('managed') : t('indexed')}
            </span>
            <StatusBadge status={repository.status} />
          </>
        ) : undefined
      }
      onClose={onClose}
    >
      {detail.error ? <LoadError message={detail.error} onRetry={() => void detail.reload()} /> : null}
      {!repository ? (
        detail.error ? null : <SkeletonRows rows={4} />
      ) : (
        <>
          <Tabs<RepoTab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'overview', label: t('tabOverview') },
              { id: 'settings', label: t('tabSettings') },
              { id: 'access', label: t('tabAccess'), count: repository.counts.grants },
            ]}
          />
          {tab === 'overview' ? (
            <OverviewTab repository={repository} onReload={() => void detail.reload()} />
          ) : tab === 'settings' ? (
            <SettingsTab
              repository={repository}
              onSaved={(updated) => {
                detail.setData(updated);
                onChanged();
              }}
            />
          ) : (
            <AccessPanel
              mode={{ kind: 'repository', repositoryId: repository.id }}
              repositoryType={repository.type}
              onChanged={() => void detail.reload()}
            />
          )}
        </>
      )}
    </Drawer>
  );
}

function OverviewTab({ repository, onReload }: { repository: RepositoryAdmin; onReload: () => void }) {
  const { t, locale } = useI18n();
  const action = useAction();
  const [notice, setNotice] = useState<string | null>(null);
  const scan = repository.scan;
  const sources = repository.counts.sources;

  async function rescan() {
    setNotice(null);
    let alreadyPending = false;
    if (await action.run(async () => ({ alreadyPending } = await api<{ alreadyPending: boolean }>(`/api/v1/repositories/${repository.id}/rescan`, { method: 'POST' })))) {
      setNotice(alreadyPending ? t('rescanAlreadyQueued') : t('rescanQueued'));
      onReload();
    }
  }

  return (
    <div className="stack">
      {action.error ? <Alert tone="danger" onDismiss={() => action.setError(null)}>{action.error}</Alert> : null}
      {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}
      <div className="mini-stats">
        <div><span className="stat-value">{repository.counts.documents}</span><span className="stat-label">{t('statDocuments')}</span></div>
        <div><span className="stat-value">{repository.counts.folders}</span><span className="stat-label">{t('folders')}</span></div>
        <div><span className="stat-value">{repository.counts.grants}</span><span className="stat-label">{t('statGrants')}</span></div>
      </div>
      <dl className="meta-list">
        <div><dt>{t('created')}</dt><dd>{formatDateTime(repository.createdAt, locale)}</dd></div>
        {repository.description ? <div><dt>{t('repositoryDescription')}</dt><dd>{repository.description}</dd></div> : null}
        {repository.connector ? (
          <div>
            <dt>{t('storageConnection')}</dt>
            <dd>
              {repository.connector.name} <span className="muted small">({repository.connector.protocol.toUpperCase()})</span>{' '}
              {repository.connector.status !== 'ACTIVE' ? <Badge>{t('disabled')}</Badge> : <ConnectorState state={repository.connector.gatewayState} />}
            </dd>
          </div>
        ) : (
          <div><dt>{t('storageConnection')}</dt><dd>{t('managedStorageShort')}</dd></div>
        )}
      </dl>

      {repository.type === 'INDEXED' ? (
        <section className="panel-section">
          <div className="section-head">
            <h3>{t('indexingHeading')}</h3>
            <Button
              size="sm"
              icon={<IconRefresh size={16} />}
              disabled={action.busy || repository.status !== 'ACTIVE' || scan?.status === 'running' || scan?.status === 'queued'}
              onClick={() => void rescan()}
            >
              {t('rescanNow')}
            </Button>
          </div>
          <dl className="meta-list">
            <div>
              <dt>{t('colStatus')}</dt>
              <dd>
                <Badge tone={scan?.status === 'failed' ? 'danger' : scan?.status === 'running' || scan?.status === 'queued' ? 'info' : 'success'}>
                  {t(scan?.status === 'running' ? 'scanRunning' : scan?.status === 'queued' ? 'scanQueued' : scan?.status === 'failed' ? 'scanFailed' : 'scanIdle')}
                </Badge>
              </dd>
            </div>
            <div><dt>{t('indexSchedule')}</dt><dd>{scheduleLabel(t, repository.scanIntervalMinutes)}</dd></div>
            <div><dt>{t('lastScan')}</dt><dd>{scan?.lastCompletedAt ? formatDateTime(scan.lastCompletedAt, locale) : t('never')}</dd></div>
            <div><dt>{t('filesSeen')}</dt><dd>{t('filesSeenValue', { seen: scan?.filesSeen ?? 0, missing: sources.missing ?? 0 })}</dd></div>
          </dl>
          {scan?.lastError ? <Alert tone="danger" title={t('lastScanError')}>{scan.lastError}</Alert> : null}
        </section>
      ) : null}
    </div>
  );
}

function SettingsTab({ repository, onSaved }: { repository: RepositoryAdmin; onSaved: (updated: RepositoryAdmin) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(repository.name);
  const [description, setDescription] = useState(repository.description ?? '');
  const [schedule, setSchedule] = useState<number | null>(repository.scanIntervalMinutes);
  const [saved, setSaved] = useState(false);
  const action = useAction();

  const scheduleOptions = useMemo(
    () => (SCHEDULES.some((entry) => entry.minutes === repository.scanIntervalMinutes) ? SCHEDULES : [...SCHEDULES, { minutes: repository.scanIntervalMinutes, label: 'scheduleCustom' as MessageKey }]),
    [repository.scanIntervalMinutes],
  );

  async function patch(body: object) {
    setSaved(false);
    let updated: RepositoryAdmin | null = null;
    const ok = await action.run(async () => {
      updated = await api<RepositoryAdmin>(`/api/v1/repositories/${repository.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: repository.revision, ...body }),
      });
    });
    if (ok && updated) {
      setSaved(true);
      onSaved(updated);
    }
  }

  async function setStatus(status: RepositoryStatus) {
    const confirmKey: Partial<Record<RepositoryStatus, MessageKey>> = { DISABLED: 'confirmDisableRepo', ARCHIVED: 'confirmArchiveRepo' };
    const key = confirmKey[status];
    if (key && !window.confirm(t(key, { name: repository.name }))) return;
    await patch({ status });
  }

  return (
    <div className="stack">
      {action.error ? <Alert tone="danger" onDismiss={() => action.setError(null)}>{action.error}</Alert> : null}
      {saved ? <Alert tone="success" onDismiss={() => setSaved(false)}>{t('savedNotice')}</Alert> : null}
      <form
        className="panel-section"
        onSubmit={(event) => {
          event.preventDefault();
          void patch({
            name,
            description: description || null,
            ...(repository.type === 'INDEXED' ? { scanIntervalMinutes: schedule } : {}),
          });
        }}
      >
        <Field label={t('repositoryName')} htmlFor="set-name">
          <input id="set-name" required value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t('repositoryDescription')} htmlFor="set-desc">
          <textarea id="set-desc" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {repository.type === 'INDEXED' ? (
          <Field label={t('indexSchedule')} htmlFor="set-schedule" hint={t('indexScheduleHint')}>
            <select id="set-schedule" value={schedule ?? ''} onChange={(event) => setSchedule(event.target.value === '' ? null : Number(event.target.value))}>
              {scheduleOptions.map((entry) => (
                <option key={entry.label} value={entry.minutes ?? ''}>{entry.label === 'scheduleCustom' ? scheduleLabel(t, entry.minutes) : t(entry.label)}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <div className="inline-actions">
          <Button type="submit" variant="primary" disabled={action.busy}>{action.busy ? t('saving') : t('save')}</Button>
        </div>
      </form>

      <section className="panel-section">
        <h3>{t('lifecycleHeading')}</h3>
        <div className="action-list">
          {repository.status !== 'ACTIVE' ? (
            <div className="action-item">
              <div>
                <strong>{t('reactivateRepo')}</strong>
                <p className="hint">{t('reactivateRepoHint')}</p>
              </div>
              <Button size="sm" disabled={action.busy} onClick={() => void setStatus('ACTIVE')}>{t('reactivateRepo')}</Button>
            </div>
          ) : null}
          {repository.status === 'ACTIVE' ? (
            <div className="action-item">
              <div>
                <strong>{t('disableRepo')}</strong>
                <p className="hint">{t('disableRepoHint')}</p>
              </div>
              <Button size="sm" variant="danger" disabled={action.busy} onClick={() => void setStatus('DISABLED')}>{t('disableRepo')}</Button>
            </div>
          ) : null}
          {repository.status !== 'ARCHIVED' ? (
            <div className="action-item">
              <div>
                <strong>{t('archiveRepo')}</strong>
                <p className="hint">{t('archiveRepoHint')}</p>
              </div>
              <Button size="sm" variant="danger" disabled={action.busy} onClick={() => void setStatus('ARCHIVED')}>{t('archiveRepo')}</Button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
