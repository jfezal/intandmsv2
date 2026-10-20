import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronDown, IconChevronRight, IconFolder, IconX } from '../../components/icons';
import { Alert, Button, IconButton, Spinner } from '../../components/ui';
import { ApiError, api, type Folder } from '../../lib/api';
import { type MessageKey, type Translator, useI18n } from '../../i18n';

export function errorText(error: unknown, t: Translator): string {
  if (error instanceof ApiError && error.status === 403 && !error.code) return t('errorForbidden');
  return error instanceof Error ? error.message : t('errorGeneric');
}

export function useLoad<T>(path: string | null) {
  const { t } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!path) return;
    setError(null);
    try {
      setData(await api<T>(path));
    } catch (loadError) {
      setError(errorText(loadError, t));
      setData(null);
    }
  }, [path, t]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, reload: load, setData };
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <Alert tone="danger" action={<Button size="sm" onClick={onRetry}>{t('retryAction')}</Button>}>
      {message}
    </Alert>
  );
}

/** Runs an async action with busy and error state, returning whether it succeeded. */
export function useAction() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await action();
        return true;
      } catch (actionError) {
        setError(errorText(actionError, t));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );
  return { busy, error, setError, run };
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function useInitialFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    const target = node?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button:not(.icon-btn)');
    (target ?? node)?.focus();
  }, []);
  return ref;
}

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  useEscape(onClose);
  const ref = useInitialFocus<HTMLDivElement>();
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={ref} className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {description ? <p className="muted small">{description}</p> : null}
          </div>
          <IconButton label={t('close')} onClick={onClose}>
            <IconX size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Drawer({
  title,
  subtitle,
  badges,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  useEscape(onClose);
  const ref = useInitialFocus<HTMLElement>();
  return (
    <div className="overlay overlay-drawer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="drawer-head">
          <div className="drawer-title">
            <h2>{title}</h2>
            {subtitle ? <div className="muted small">{subtitle}</div> : null}
            {badges ? <div className="badge-row">{badges}</div> : null}
          </div>
          <IconButton label={t('close')} onClick={onClose}>
            <IconX size={18} />
          </IconButton>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={value === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="steps">
      {steps.map((label, index) => (
        <li key={label} className={index < current ? 'done' : index === current ? 'current' : ''} aria-current={index === current ? 'step' : undefined}>
          <span className="step-dot">{index < current ? <IconCheck size={14} /> : index + 1}</span>
          <span className="step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

const permissionLabelKeys: Record<string, MessageKey> = {
  'system.admin': 'permSystemAdmin',
  'users.manage': 'permUsersManage',
  'audit.read': 'permAuditRead',
  'repositories.manage': 'permRepositoriesManage',
  'connectors.manage': 'permConnectorsManage',
  'jobs.manage': 'permJobsManage',
  'messages.audit': 'permMessagesAudit',
  'documents.read': 'permDocumentsRead',
  'documents.write': 'permDocumentsWrite',
  'search.query': 'permSearchQuery',
};

export function permissionLabel(t: Translator, key: string): string {
  const messageKey = permissionLabelKeys[key];
  return messageKey ? t(messageKey) : key;
}

export type PickedFolder = { id: string; name: string; relativePath: string } | null;

/** Lazily loaded folder tree of one repository; `null` means the repository root. */
export function FolderPicker({
  repositoryId,
  value,
  onChange,
}: {
  repositoryId: string;
  value: PickedFolder;
  onChange: (folder: PickedFolder) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="folder-picker" role="tree" aria-label={t('folderPickerLabel')}>
      <button
        type="button"
        role="treeitem"
        aria-selected={value === null}
        className={`picker-row${value === null ? ' selected' : ''}`}
        onClick={() => onChange(null)}
      >
        <IconFolder size={16} />
        <span>{t('wholeRepository')}</span>
      </button>
      <FolderBranch repositoryId={repositoryId} parentId={null} depth={1} value={value} onChange={onChange} />
    </div>
  );
}

function FolderBranch({
  repositoryId,
  parentId,
  depth,
  value,
  onChange,
}: {
  repositoryId: string;
  parentId: string | null;
  depth: number;
  value: PickedFolder;
  onChange: (folder: PickedFolder) => void;
}) {
  const { t } = useI18n();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
    api<Folder[]>(`/api/v1/repositories/${repositoryId}/folders${query}`)
      .then((rows) => active && setFolders(rows))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [repositoryId, parentId]);

  if (failed) return <p className="hint picker-indent" style={{ paddingLeft: depth * 18 }}>{t('errorGeneric')}</p>;
  if (folders === null) {
    return (
      <div className="picker-indent" style={{ paddingLeft: depth * 18 }}>
        <Spinner label={t('loading')} />
      </div>
    );
  }
  if (folders.length === 0 && depth === 1) {
    return <p className="hint" style={{ paddingLeft: depth * 18 }}>{t('noFoldersYet')}</p>;
  }
  return (
    <>
      {folders.map((folder) => {
        const expanded = open.has(folder.id);
        const selected = value?.id === folder.id;
        return (
          <div key={folder.id}>
            <div className={`picker-row${selected ? ' selected' : ''}`} style={{ paddingLeft: depth * 18 }}>
              <button
                type="button"
                className="tree-caret"
                aria-label={t(expanded ? 'collapseFolder' : 'expandFolder', { name: folder.name })}
                onClick={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (next.has(folder.id)) next.delete(folder.id);
                    else next.add(folder.id);
                    return next;
                  })
                }
              >
                {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              </button>
              <button
                type="button"
                role="treeitem"
                aria-selected={selected}
                aria-expanded={expanded}
                className="picker-label"
                onClick={() => onChange({ id: folder.id, name: folder.name, relativePath: folder.relativePath })}
              >
                <IconFolder size={16} />
                <span>{folder.name}</span>
              </button>
            </div>
            {expanded ? (
              <FolderBranch repositoryId={repositoryId} parentId={folder.id} depth={depth + 1} value={value} onChange={onChange} />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function generatePassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?';
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}
