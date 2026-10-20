import { type FormEvent, useEffect, useState } from 'react';
import { IconArrowLeft, IconFolder, IconPlus, IconRefresh, IconServer } from '../../components/icons';
import { Alert, Badge, Button, EmptyState, PageHeader, SkeletonRows, Spinner } from '../../components/ui';
import { api, type Connector, type ConnectorList, type DirectoryListing } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { type MessageKey, useI18n } from '../../i18n';
import { Field, LoadError, Modal, Steps, errorText, useAction, useLoad } from './shared';

export function healthTone(state: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (state === 'healthy' || state === 'mounted' || state === 'local_path') return 'success';
  if (state === 'degraded' || state === 'credentials_ready') return 'warning';
  if (state === 'error') return 'danger';
  return 'neutral';
}

const stateLabels: Record<string, MessageKey> = {
  unconfigured: 'stateUnconfigured',
  credentials_ready: 'stateCredentialsReady',
  healthy: 'stateHealthy',
  mounted: 'stateMounted',
  local_path: 'stateLocalPath',
  degraded: 'stateDegraded',
  error: 'stateError',
};

export function ConnectorState({ state }: { state: string }) {
  const { t } = useI18n();
  const key = stateLabels[state];
  return <Badge tone={healthTone(state)}>{key ? t(key) : state.replace(/_/g, ' ')}</Badge>;
}

function connectorTarget(connector: Connector): string {
  if (connector.protocol === 'local') return connector.mountPath ?? connector.exportPath;
  if (connector.protocol === 'smb') return `//${connector.host}/${connector.exportPath.replace(/^\/+/, '')}`;
  return `${connector.host}:${connector.exportPath}`;
}

export function StoragePage() {
  const { t, locale } = useI18n();
  const list = useLoad<ConnectorList>('/api/v1/connectors');
  const [wizard, setWizard] = useState(false);
  const [browsing, setBrowsing] = useState<Connector | null>(null);
  const action = useAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(connector: Connector, path: string, init: RequestInit) {
    setBusyId(connector.id);
    await action.run(() => api(`/api/v1/connectors/${connector.id}${path}`, init));
    setBusyId(null);
    await list.reload();
  }

  async function toggle(connector: Connector) {
    const disabling = connector.status === 'ACTIVE';
    if (disabling && !window.confirm(t('confirmDisableConnector', { name: connector.name, count: connector.repositoryCount ?? 0 }))) return;
    await act(connector, '', { method: 'PATCH', body: JSON.stringify({ status: disabling ? 'DISABLED' : 'ACTIVE' }) });
  }

  async function remove(connector: Connector) {
    if (!window.confirm(t('confirmDeleteConnector', { name: connector.name }))) return;
    await act(connector, '', { method: 'DELETE' });
  }

  const connectors = list.data?.connectors;

  return (
    <div className="page">
      <PageHeader
        title={t('connectorsHeading')}
        subtitle={t('connectorsSubtitle')}
        actions={
          <>
            <Button size="sm" icon={<IconRefresh size={16} />} onClick={() => void list.reload()}>{t('refresh')}</Button>
            <Button size="sm" variant="primary" icon={<IconPlus size={16} />} onClick={() => setWizard(true)}>{t('addConnection')}</Button>
          </>
        }
      />
      {list.error ? <LoadError message={list.error} onRetry={() => void list.reload()} /> : null}
      {action.error ? <Alert tone="danger" onDismiss={() => action.setError(null)}>{action.error}</Alert> : null}
      {list.data && !list.data.gatewayConfigured ? <Alert tone="warning">{t('gatewayMissing')}</Alert> : null}
      {connectors === undefined && !list.error ? (
        <SkeletonRows rows={3} />
      ) : !connectors?.length ? (
        <div className="card">
          <EmptyState
            icon={<IconServer size={28} />}
            title={t('noConnectors')}
            hint={t('noConnectorsHint')}
            action={<Button variant="primary" icon={<IconPlus size={16} />} onClick={() => setWizard(true)}>{t('addConnection')}</Button>}
          />
        </div>
      ) : (
        <ul className="connector-grid">
          {connectors.map((connector) => {
            const busy = busyId === connector.id;
            const disabled = connector.status !== 'ACTIVE';
            const inUse = (connector.repositoryCount ?? 0) > 0;
            return (
              <li key={connector.id} className={`card connector-card${disabled ? ' is-muted' : ''}`}>
                <div className="connector-head">
                  <span className="stat-icon tone-info"><IconServer /></span>
                  <div className="connector-title">
                    <strong>{connector.name}</strong>
                    <div className="muted small mono">{connector.protocol.toUpperCase()} · {connectorTarget(connector)}</div>
                  </div>
                  {disabled ? <Badge>{t('disabled')}</Badge> : <ConnectorState state={connector.gatewayState} />}
                </div>
                <p className="connector-note">{connector.lastHealthNote ?? '—'}</p>
                <div className="muted small">
                  {t('usedByRepositories', { count: connector.repositoryCount ?? 0 })} ·{' '}
                  {connector.lastHealthAt ? t('lastChecked', { when: formatDateTime(connector.lastHealthAt, locale) }) : t('neverChecked')}
                </div>
                <div className="connector-foot">
                  <Button size="sm" disabled={busy || disabled} onClick={() => void act(connector, '/connect-test', { method: 'POST' })}>
                    {busy ? t('testing') : t('testConnection')}
                  </Button>
                  {connector.protocol !== 'local' ? (
                    <Button size="sm" disabled={busy || disabled} onClick={() => void act(connector, '/mount', { method: 'POST' })}>
                      {t('mount')}
                    </Button>
                  ) : null}
                  <Button size="sm" disabled={!connector.browsable || disabled} onClick={() => setBrowsing(connector)}>{t('browseFolders')}</Button>
                  <Button size="sm" variant={disabled ? 'secondary' : 'ghost'} disabled={busy} onClick={() => void toggle(connector)}>
                    {disabled ? t('enableAction') : t('disableAction')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy || inUse}
                    title={inUse ? t('deleteConnectorInUse') : undefined}
                    onClick={() => void remove(connector)}
                  >
                    {t('deleteAction')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {wizard && list.data ? (
        <ConnectorWizard
          gatewayConfigured={list.data.gatewayConfigured}
          localRoots={list.data.localRoots}
          onClose={() => {
            setWizard(false);
            void list.reload();
          }}
        />
      ) : null}
      {browsing ? (
        <Modal title={t('browseTitle', { name: browsing.name })} onClose={() => setBrowsing(null)} footer={<Button onClick={() => setBrowsing(null)}>{t('close')}</Button>}>
          <DirectoryBrowser connectorId={browsing.id} value="" onChange={() => undefined} />
        </Modal>
      ) : null}
    </div>
  );
}

/** Browses directories under a connector root. `value` is the selected relative path ('' = root). */
export function DirectoryBrowser({
  connectorId,
  value,
  onChange,
  selectable,
}: {
  connectorId: string;
  value: string;
  onChange: (path: string) => void;
  selectable?: boolean;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(value);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setListing(null);
    setError(null);
    api<DirectoryListing>(`/api/v1/connectors/${connectorId}/browse?path=${encodeURIComponent(current)}`)
      .then((result) => active && setListing(result))
      .catch((browseError) => active && setError(errorText(browseError, t)));
    return () => {
      active = false;
    };
  }, [connectorId, current, t]);

  function open(path: string) {
    setCurrent(path);
    if (selectable) onChange(path);
  }

  const crumbs = current ? current.split('/') : [];
  return (
    <div className="dir-browser">
      <nav className="breadcrumbs dir-crumbs" aria-label={t('folderPickerLabel')}>
        <button type="button" className="link" onClick={() => open('')}>{t('connectorRoot')}</button>
        {crumbs.map((name, index) => {
          const path = crumbs.slice(0, index + 1).join('/');
          return (
            <span key={path}>
              <span aria-hidden="true"> / </span>
              <button type="button" className="link" onClick={() => open(path)}>{name}</button>
            </span>
          );
        })}
      </nav>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {listing === null && !error ? (
        <div className="dir-loading"><Spinner label={t('loading')} /></div>
      ) : listing ? (
        <ul className="dir-list">
          {listing.parent !== null ? (
            <li>
              <button type="button" className="dir-row" onClick={() => open(listing.parent ?? '')}>
                <IconArrowLeft size={16} />
                <span>{t('upOneLevel')}</span>
              </button>
            </li>
          ) : null}
          {listing.directories.map((directory) => (
            <li key={directory.path}>
              <button type="button" className="dir-row" onClick={() => open(directory.path)}>
                <IconFolder size={16} />
                <span>{directory.name}</span>
              </button>
            </li>
          ))}
          {listing.directories.length === 0 ? <li className="hint dir-empty">{t('noSubfolders')}</li> : null}
        </ul>
      ) : null}
      {listing ? (
        <p className="hint">
          {t('filesHere', { count: listing.fileCount })}
          {listing.truncated ? ` · ${t('listingTruncated')}` : ''}
        </p>
      ) : null}
      {selectable ? (
        <p className="selected-path">
          {t('selectedRoot')}: <span className="mono">/{value}</span>
        </p>
      ) : null}
    </div>
  );
}

type Protocol = 'local' | 'smb' | 'nfs';

function ConnectorWizard({ gatewayConfigured, localRoots, onClose }: { gatewayConfigured: boolean; localRoots: string[]; onClose: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [protocol, setProtocol] = useState<Protocol>('smb');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [exportPath, setExportPath] = useState('');
  const [mountPath, setMountPath] = useState(localRoots[0] ? `${localRoots[0]}/` : '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connector, setConnector] = useState<Connector | null>(null);
  const action = useAction();

  const steps = [t('stepType'), t('stepDetails'), t('stepConnect'), t('stepVerify')];

  async function createConnector(event: FormEvent) {
    event.preventDefault();
    const body =
      protocol === 'local'
        ? { protocol, name, mountPath }
        : protocol === 'smb'
          ? { protocol, name, host, exportPath, smbUsername: username || undefined }
          : { protocol, name, host, exportPath };
    const ok = await action.run(async () => setConnector(await api<Connector>('/api/v1/connectors', { method: 'POST', body: JSON.stringify(body) })));
    if (ok) setStep(2);
  }

  async function call(path: string, init: RequestInit = { method: 'POST' }) {
    if (!connector) return false;
    return action.run(async () => setConnector(await api<Connector>(`/api/v1/connectors/${connector.id}${path}`, init)));
  }

  const reachable = connector ? ['local_path', 'healthy', 'mounted'].includes(connector.gatewayState) : false;
  const browsable = connector ? Boolean(connector.mountPath) && reachable : false;

  return (
    <Modal
      wide
      title={t('addConnection')}
      onClose={onClose}
      footer={
        step === 0 ? (
          <>
            <Button onClick={onClose}>{t('cancel')}</Button>
            <Button variant="primary" onClick={() => setStep(1)}>{t('next')}</Button>
          </>
        ) : step === 1 ? (
          <>
            <Button onClick={() => setStep(0)}>{t('back')}</Button>
            <Button type="submit" form="connector-details" variant="primary" disabled={action.busy}>{action.busy ? t('saving') : t('saveAndContinue')}</Button>
          </>
        ) : step === 2 ? (
          <>
            <Button onClick={onClose}>{t('finishLater')}</Button>
            <Button variant="primary" disabled={!browsable} onClick={() => setStep(3)}>{t('next')}</Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>{t('done')}</Button>
        )
      }
    >
      <Steps steps={steps} current={step} />
      {action.error ? <Alert tone="danger" onDismiss={() => action.setError(null)}>{action.error}</Alert> : null}

      {step === 0 ? (
        <div className="choice-grid" role="radiogroup" aria-label={t('stepType')}>
          {(['smb', 'nfs', 'local'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={protocol === option}
              className={`choice-card${protocol === option ? ' selected' : ''}`}
              onClick={() => setProtocol(option)}
            >
              <strong>{t(option === 'smb' ? 'protocolSmb' : option === 'nfs' ? 'protocolNfs' : 'protocolLocal')}</strong>
              <span className="hint">{t(option === 'smb' ? 'protocolSmbHint' : option === 'nfs' ? 'protocolNfsHint' : 'protocolLocalHint')}</span>
            </button>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <form id="connector-details" onSubmit={(event) => void createConnector(event)}>
          <Field label={t('connectionName')} htmlFor="conn-name" hint={t('connectionNameHint')}>
            <input id="conn-name" required value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          {protocol === 'local' ? (
            <Field label={t('localPath')} htmlFor="conn-path" hint={t('localPathHint', { roots: localRoots.join(', ') || '—' })}>
              <input id="conn-path" className="mono" required value={mountPath} onChange={(event) => setMountPath(event.target.value)} />
            </Field>
          ) : (
            <div className="form-grid">
              <Field label={t('nasHost')} htmlFor="conn-host" hint={t('nasHostHint')}>
                <input id="conn-host" className="mono" required value={host} onChange={(event) => setHost(event.target.value)} />
              </Field>
              <Field label={t(protocol === 'smb' ? 'shareName' : 'exportPathLabel')} htmlFor="conn-export" hint={t(protocol === 'smb' ? 'shareNameHint' : 'exportPathHint')}>
                <input id="conn-export" className="mono" required value={exportPath} onChange={(event) => setExportPath(event.target.value)} />
              </Field>
            </div>
          )}
          <Alert tone="info">{t('readOnlyConnectorNote')}</Alert>
        </form>
      ) : null}

      {step === 2 && connector ? (
        <div className="stack">
          <div className="connector-status">
            <strong>{connector.name}</strong>
            <ConnectorState state={connector.gatewayState} />
          </div>
          <p className="hint">{connector.lastHealthNote}</p>
          {connector.protocol !== 'local' && !gatewayConfigured ? <Alert tone="warning">{t('gatewayMissing')}</Alert> : null}
          {connector.protocol === 'smb' ? (
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void call('/credentials', { method: 'POST', body: JSON.stringify({ username, password }) }).then((ok) => ok && setPassword(''));
              }}
            >
              <strong>{t('credentialsHeading')}</strong>
              <p className="hint">{t('credentialsHint')}</p>
              <div className="form-grid">
                <Field label={t('login')} htmlFor="conn-user">
                  <input id="conn-user" required autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} />
                </Field>
                <Field label={t('password')} htmlFor="conn-pass">
                  <input id="conn-pass" type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                </Field>
              </div>
              <div className="inline-actions">
                <Button type="submit" disabled={action.busy || !gatewayConfigured}>{t('saveCredentials')}</Button>
              </div>
            </form>
          ) : null}
          <div className="inline-actions">
            <Button disabled={action.busy} onClick={() => void call('/connect-test')}>{t('testConnection')}</Button>
            {connector.protocol !== 'local' ? (
              <Button variant="primary" disabled={action.busy || !gatewayConfigured} onClick={() => void call('/mount')}>{t('mount')}</Button>
            ) : null}
          </div>
          {!browsable ? <p className="hint">{t(connector.protocol === 'local' ? 'connectLocalHint' : 'connectNasHint')}</p> : <Alert tone="success">{t('connectionReady')}</Alert>}
        </div>
      ) : null}

      {step === 3 && connector ? (
        <div className="stack">
          <p className="hint">{t('verifyHint')}</p>
          <DirectoryBrowser connectorId={connector.id} value="" onChange={() => undefined} />
        </div>
      ) : null}
    </Modal>
  );
}
