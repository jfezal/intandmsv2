import { type DragEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileIcon,
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconFolderOpen,
  IconGrid,
  IconList,
  IconLock,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUpload,
} from '../../components/icons';
import { Alert, Badge, Button, EmptyState, IconButton, SkeletonRows } from '../../components/ui';
import { api, type DocumentRow, type Folder, type MeUser, type Repository } from '../../lib/api';
import { fileKind, formatBytes, formatDateTime } from '../../lib/format';
import { navigate } from '../../lib/route';
import { useI18n } from '../../i18n';
import { DetailsPanel } from './DetailsPanel';
import { UploadQueue } from './UploadQueue';
import { useUploads } from './useUploads';

const ROOT = 'root';
type ChildMap = Record<string, Folder[] | undefined>;

export function ExplorerPage({
  user,
  repositories,
  repositoryId,
  folderId,
  onRepositoriesChanged,
  onTasksChanged,
}: {
  user: MeUser;
  repositories: Repository[] | null;
  repositoryId?: string;
  folderId?: string;
  onRepositoriesChanged: () => Promise<void>;
  onTasksChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const [locationAccess, setLocationAccess] = useState<{ read: boolean; write: boolean } | null>(null);
  const canWrite = locationAccess?.write ?? false;
  const traverseOnly = locationAccess !== null && !locationAccess.read;
  const canManageRepos = ['repositories.manage', 'system.admin'].some((key) => user.permissions.includes(key));

  const repo = repositories?.find((candidate) => candidate.id === repositoryId) ?? null;
  const isManaged = repo?.type === 'MANAGED';
  const canUpload = Boolean(repo && isManaged && canWrite && repo.capabilities.upload);
  const folderKey = folderId ?? ROOT;

  const [children, setChildren] = useState<ChildMap>({});
  const [folderIndex, setFolderIndex] = useState<Record<string, Folder>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('intandms.view') as 'list' | 'grid' | null) ?? 'list',
  );
  const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('intandms.view', view);
  }, [view]);

  useEffect(() => {
    if (!repositoryId && repositories?.length) {
      navigate({ name: 'documents', repositoryId: repositories[0].id });
    }
  }, [repositoryId, repositories]);

  useEffect(() => {
    setChildren({});
    setFolderIndex({});
    setExpanded(new Set());
  }, [repositoryId]);

  const loadFolders = useCallback(
    async (parentKey: string) => {
      if (!repositoryId) return;
      const query = parentKey === ROOT ? '' : `?parentId=${encodeURIComponent(parentKey)}`;
      const rows = await api<Folder[]>(`/api/v1/repositories/${repositoryId}/folders${query}`);
      setChildren((current) => ({ ...current, [parentKey]: rows }));
      setFolderIndex((current) => {
        const next = { ...current };
        for (const row of rows) next[row.id] = row;
        return next;
      });
    },
    [repositoryId],
  );

  const loadDocuments = useCallback(async () => {
    if (!repositoryId) return;
    const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
    const rows = await api<DocumentRow[]>(`/api/v1/repositories/${repositoryId}/documents${query}`);
    setDocuments(rows);
  }, [repositoryId, folderId]);

  const loadAccess = useCallback(async () => {
    if (!repositoryId) return;
    const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
    setLocationAccess(await api<{ read: boolean; write: boolean }>(`/api/v1/repositories/${repositoryId}/access${query}`));
  }, [repositoryId, folderId]);

  const refresh = useCallback(async () => {
    setError(null);
    setDocuments(null);
    setLocationAccess(null);
    try {
      await Promise.all([
        loadFolders(ROOT),
        folderKey !== ROOT ? loadFolders(folderKey) : null,
        loadDocuments(),
        loadAccess(),
      ]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('errorGeneric'));
      setDocuments([]);
    }
  }, [loadFolders, loadDocuments, loadAccess, folderKey, t]);

  useEffect(() => {
    if (!repositoryId) return;
    setSelectedId(null);
    setFilter('');
    void refresh();
  }, [repositoryId, folderId, refresh]);

  useEffect(() => {
    if (folderId) {
      setExpanded((current) => {
        const next = new Set(current);
        let cursor: Folder | undefined = folderIndex[folderId];
        while (cursor?.parentId) {
          next.add(cursor.parentId);
          cursor = folderIndex[cursor.parentId];
        }
        return next;
      });
    }
  }, [folderId, folderIndex]);

  const uploads = useUploads((uploadedRepoId, uploadedFolderId) => {
    if (uploadedRepoId === repositoryId && (uploadedFolderId ?? undefined) === folderId) {
      void loadDocuments();
    }
  });

  const breadcrumbs = useMemo(() => {
    const trail: Folder[] = [];
    let cursor = folderId ? folderIndex[folderId] : undefined;
    while (cursor) {
      trail.unshift(cursor);
      cursor = cursor.parentId ? folderIndex[cursor.parentId] : undefined;
    }
    return trail;
  }, [folderId, folderIndex]);

  const currentFolderName = folderId ? (folderIndex[folderId]?.name ?? '…') : (repo?.name ?? t('root'));
  const needle = filter.trim().toLowerCase();
  const subfolders = (children[folderKey] ?? []).filter((folder) => !needle || folder.name.toLowerCase().includes(needle));
  const docs = (documents ?? []).filter((doc) => !needle || doc.displayName.toLowerCase().includes(needle));
  const selected = documents?.find((doc) => doc.id === selectedId) ?? null;
  const loading = documents === null || children[folderKey] === undefined;

  async function toggleFolder(folder: Folder) {
    const isOpen = expanded.has(folder.id);
    setExpanded((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(folder.id);
      else next.add(folder.id);
      return next;
    });
    if (!isOpen && children[folder.id] === undefined) {
      await loadFolders(folder.id).catch(() => undefined);
    }
  }

  async function createFolder(event: FormEvent) {
    event.preventDefault();
    if (!repositoryId || !newFolderName.trim()) return;
    try {
      await api(`/api/v1/repositories/${repositoryId}/folders`, {
        method: 'POST',
        body: JSON.stringify({ name: newFolderName.trim(), parentId: folderId }),
      });
      setNewFolderName('');
      setCreatingFolder(false);
      await loadFolders(folderKey);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('errorGeneric'));
    }
  }

  async function createRepository(event: FormEvent) {
    event.preventDefault();
    const name = newRepoName.trim();
    if (!name) return;
    try {
      const created = await api<Repository>('/api/v1/repositories', {
        method: 'POST',
        body: JSON.stringify({ type: 'MANAGED', name }),
      });
      setNewRepoName('');
      setCreatingRepo(false);
      await onRepositoriesChanged();
      navigate({ name: 'documents', repositoryId: created.id });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('errorGeneric'));
    }
  }

  function onFilesChosen(files: FileList | null) {
    if (!files?.length || !repositoryId || !canUpload) return;
    uploads.enqueue(files, repositoryId, folderId ?? null);
  }

  function onDragOver(event: DragEvent) {
    if (!canUpload || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDragging(true);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    onFilesChosen(event.dataTransfer.files);
  }

  function renderTree(parentKey: string, depth: number) {
    const rows = children[parentKey];
    if (!rows?.length) return null;
    return (
      <ul role={depth === 0 ? 'tree' : 'group'} aria-label={depth === 0 ? t('folders') : undefined}>
        {rows.map((folder) => {
          const open = expanded.has(folder.id);
          const active = folder.id === folderId;
          return (
            <li key={folder.id} role="treeitem" aria-expanded={open} aria-selected={active}>
              <div className={`tree-row${active ? ' active' : ''}`} style={{ paddingInlineStart: `${8 + depth * 14}px` }}>
                <button
                  type="button"
                  className="tree-caret"
                  aria-label={open ? t('collapseFolder', { name: folder.name }) : t('expandFolder', { name: folder.name })}
                  onClick={() => void toggleFolder(folder)}
                >
                  {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                </button>
                <a
                  className={`tree-label${folder.access === 'traverse' ? ' is-traverse' : ''}`}
                  href={`#/documents/${repositoryId}?folder=${folder.id}`}
                  title={folder.access === 'traverse' ? t('traverseFolderTitle') : folder.relativePath}
                >
                  {open || active ? <IconFolderOpen size={16} /> : <IconFolder size={16} />}
                  <span>{folder.name}</span>
                </a>
              </div>
              {open ? renderTree(folder.id, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={`explorer${selected ? ' with-details' : ''}`}>
      <aside className="explorer-rail" aria-label={t('repositories')}>
        <div className="rail-head">
          <h2>{t('repositories')}</h2>
          {canManageRepos ? (
            <IconButton label={t('newRepository')} onClick={() => setCreatingRepo((value) => !value)}>
              <IconPlus size={16} />
            </IconButton>
          ) : null}
        </div>
        {creatingRepo ? (
          <form className="inline-form" onSubmit={(event) => void createRepository(event)}>
            <label className="sr-only" htmlFor="new-repo">{t('repositoryName')}</label>
            <input
              id="new-repo"
              autoFocus
              placeholder={t('repositoryName')}
              value={newRepoName}
              onChange={(event) => setNewRepoName(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && setCreatingRepo(false)}
            />
            <p className="hint">{t('repositoryNameHint')}</p>
            <div className="inline-actions">
              <Button size="sm" variant="ghost" onClick={() => setCreatingRepo(false)}>{t('cancel')}</Button>
              <Button size="sm" variant="primary" type="submit" disabled={!newRepoName.trim()}>{t('create')}</Button>
            </div>
          </form>
        ) : null}

        {repositories === null ? (
          <SkeletonRows rows={3} />
        ) : (
          <ul className="repo-list">
            {repositories.map((candidate) => (
              <li key={candidate.id}>
                <a
                  className={`repo-item${candidate.id === repositoryId ? ' active' : ''}`}
                  href={`#/documents/${candidate.id}`}
                  aria-current={candidate.id === repositoryId ? 'page' : undefined}
                >
                  {candidate.type === 'MANAGED' ? <IconFolder size={16} /> : <IconLock size={16} />}
                  <span className="repo-item-name">{candidate.name}</span>
                  <span className={`type-pill ${candidate.type === 'MANAGED' ? 'pill-managed' : 'pill-indexed'}`}>
                    {candidate.type === 'MANAGED' ? t('managed') : t('indexed')}
                  </span>
                </a>
                {candidate.id === repositoryId ? (
                  <div className="tree">
                    <a className={`tree-row tree-root${!folderId ? ' active' : ''}`} href={`#/documents/${candidate.id}`}>
                      <IconFolderOpen size={16} />
                      <span>{t('root')}</span>
                    </a>
                    {renderTree(ROOT, 0)}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section
        className={`explorer-main${dragging ? ' dragging' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(false);
        }}
        onDrop={onDrop}
      >
        {error ? (
          <Alert
            tone="danger"
            onDismiss={() => setError(null)}
            action={repo ? <Button size="sm" onClick={() => void refresh()}>{t('retryAction')}</Button> : undefined}
          >
            {error}
          </Alert>
        ) : null}
        {!repo ? (
          repositories && repositories.length === 0 ? (
            <EmptyState
              icon={<IconFolder size={32} />}
              title={t('noRepositoriesYet')}
              hint={t('noRepositoriesHint')}
              action={
                canManageRepos ? (
                  <Button variant="primary" icon={<IconPlus size={16} />} onClick={() => setCreatingRepo(true)}>
                    {t('newRepository')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState icon={<IconFolder size={32} />} title={t('selectRepository')} hint={t('selectRepositoryHint')} />
          )
        ) : (
          <>
            <div className="explorer-head">
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                  <li>
                    <a href={`#/documents/${repo.id}`}>{repo.name}</a>
                  </li>
                  {breadcrumbs.map((crumb, index) => (
                    <li key={crumb.id}>
                      <IconChevronRight size={14} />
                      {index === breadcrumbs.length - 1 ? (
                        <span aria-current="page">{crumb.name}</span>
                      ) : (
                        <a href={`#/documents/${repo.id}?folder=${crumb.id}`}>{crumb.name}</a>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="explorer-title">
                <h1>{currentFolderName}</h1>
                <Badge tone={isManaged ? 'accent' : 'neutral'}>{isManaged ? t('managed') : t('indexed')}</Badge>
                {!isManaged ? <Badge tone="warning" icon={<IconLock size={12} />}>{t('readOnly')}</Badge> : null}
              </div>
            </div>

            <div className="toolbar" role="toolbar" aria-label={t('navDocuments')}>
              <div className="toolbar-group">
                {canUpload ? (
                  <>
                    <Button variant="primary" icon={<IconUpload size={16} />} onClick={() => fileInput.current?.click()}>
                      {t('upload')}
                    </Button>
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      hidden
                      onChange={(event) => {
                        onFilesChosen(event.target.files);
                        event.target.value = '';
                      }}
                    />
                  </>
                ) : null}
                {isManaged && canWrite ? (
                  <Button icon={<IconPlus size={16} />} onClick={() => setCreatingFolder((value) => !value)}>
                    {t('newFolder')}
                  </Button>
                ) : null}
                <IconButton label={t('refresh')} onClick={() => void refresh()}>
                  <IconRefresh size={16} />
                </IconButton>
              </div>
              <div className="toolbar-group">
                <div className="filter-input">
                  <IconSearch size={14} />
                  <input
                    type="search"
                    aria-label={t('filterInFolder')}
                    placeholder={t('filterInFolder')}
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  />
                </div>
                <div className="segmented" role="group" aria-label={`${t('viewList')} / ${t('viewGrid')}`}>
                  <button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} aria-label={t('viewList')} onClick={() => setView('list')}>
                    <IconList size={16} />
                  </button>
                  <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} aria-label={t('viewGrid')} onClick={() => setView('grid')}>
                    <IconGrid size={16} />
                  </button>
                </div>
              </div>
            </div>

            {creatingFolder ? (
              <form className="inline-form inline-form-row" onSubmit={(event) => void createFolder(event)}>
                <label className="sr-only" htmlFor="new-folder">{t('folderName')}</label>
                <IconFolder size={18} />
                <input
                  id="new-folder"
                  autoFocus
                  placeholder={t('folderName')}
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Escape' && setCreatingFolder(false)}
                />
                <Button size="sm" variant="ghost" onClick={() => setCreatingFolder(false)}>{t('cancel')}</Button>
                <Button size="sm" variant="primary" type="submit" disabled={!newFolderName.trim()}>{t('create')}</Button>
              </form>
            ) : null}

            {!isManaged ? <Alert tone="info">{t('readOnlyReason')}</Alert> : null}
            {traverseOnly ? <Alert tone="info">{t('traverseOnlyNotice')}</Alert> : null}

            <div className="listing">
              {loading ? (
                <SkeletonRows rows={6} />
              ) : subfolders.length === 0 && docs.length === 0 ? (
                needle ? (
                  <EmptyState icon={<IconSearch size={28} />} title={t('noMatchesInFolder', { q: filter.trim() })} />
                ) : (
                  <EmptyState
                    icon={<IconFolderOpen size={32} />}
                    title={t('emptyFolder')}
                    hint={traverseOnly ? t('traverseOnlyEmpty') : !canWrite ? undefined : isManaged ? t('emptyFolderHintManaged') : t('emptyFolderHintIndexed')}
                    action={
                      canUpload ? (
                        <Button variant="primary" icon={<IconUpload size={16} />} onClick={() => fileInput.current?.click()}>
                          {t('uploadFiles')}
                        </Button>
                      ) : undefined
                    }
                  />
                )
              ) : view === 'list' ? (
                <table className="file-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('colName')}</th>
                      <th scope="col" className="col-type">{t('colType')}</th>
                      <th scope="col" className="col-size">{t('colSize')}</th>
                      <th scope="col" className="col-date">{t('colModified')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subfolders.map((folder) => (
                      <tr key={folder.id} onDoubleClick={() => navigate({ name: 'documents', repositoryId, folderId: folder.id })}>
                        <td>
                          <a className="file-name" href={`#/documents/${repositoryId}?folder=${folder.id}`}>
                            <span className="folder-glyph"><IconFolder size={20} /></span>
                            <span>{folder.name}</span>
                          </a>
                        </td>
                        <td className="col-type muted">{t('folderLabel')}</td>
                        <td className="col-size muted">—</td>
                        <td className="col-date muted">—</td>
                      </tr>
                    ))}
                    {docs.map((doc) => {
                      const kind = fileKind(doc.currentVersion?.mimeType, doc.displayName);
                      const isSelected = doc.id === selectedId;
                      return (
                        <tr key={doc.id} className={isSelected ? 'selected' : ''} onClick={() => setSelectedId(doc.id)} aria-selected={isSelected}>
                          <td>
                            <button type="button" className="file-name" onClick={() => setSelectedId(doc.id)}>
                              <FileIcon kind={kind} size={24} />
                              <span title={doc.displayName}>{doc.displayName}</span>
                            </button>
                          </td>
                          <td className="col-type muted">{doc.currentVersion?.mimeType.split('/').pop() ?? '—'}</td>
                          <td className="col-size muted">{formatBytes(doc.currentVersion?.sizeBytes, locale)}</td>
                          <td className="col-date muted">{formatDateTime(doc.updatedAt, locale)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <ul className="file-grid">
                  {subfolders.map((folder) => (
                    <li key={folder.id}>
                      <a className="grid-card" href={`#/documents/${repositoryId}?folder=${folder.id}`}>
                        <span className="grid-thumb folder-thumb"><IconFolder size={36} /></span>
                        <span className="grid-name">{folder.name}</span>
                        <span className="muted small">{t('folderLabel')}</span>
                      </a>
                    </li>
                  ))}
                  {docs.map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        className={`grid-card${doc.id === selectedId ? ' selected' : ''}`}
                        onClick={() => setSelectedId(doc.id)}
                        aria-pressed={doc.id === selectedId}
                      >
                        <span className="grid-thumb"><FileIcon kind={fileKind(doc.currentVersion?.mimeType, doc.displayName)} size={44} /></span>
                        <span className="grid-name" title={doc.displayName}>{doc.displayName}</span>
                        <span className="muted small">{formatBytes(doc.currentVersion?.sizeBytes, locale)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!loading ? (
              <p className="listing-foot muted small">{t('itemsCount', { count: subfolders.length + docs.length })}</p>
            ) : null}

            {dragging ? (
              <div className="drop-overlay" aria-hidden="true">
                <IconUpload size={32} />
                <strong>{t('dropFilesHere', { folder: currentFolderName })}</strong>
              </div>
            ) : null}
          </>
        )}
      </section>

      {selected ? (
        <DetailsPanel
          document={selected}
          meId={user.id}
          canWrite={canWrite}
          onClose={() => setSelectedId(null)}
          onReviewStarted={onTasksChanged}
        />
      ) : null}

      <UploadQueue items={uploads.items} onCancel={uploads.cancel} onRetry={uploads.retry} onClear={uploads.clearFinished} />
    </div>
  );
}
