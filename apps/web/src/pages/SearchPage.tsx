import { type FormEvent, useEffect, useState } from 'react';
import { FileIcon, IconSearch } from '../components/icons';
import { Alert, Badge, Button, EmptyState, PageHeader, SkeletonRows } from '../components/ui';
import { api, type Repository, type SearchHit } from '../lib/api';
import { fileKind } from '../lib/format';
import { navigate } from '../lib/route';
import { useI18n } from '../i18n';

/** ts_headline wraps matches in <b>…</b>; render only that markup, everything else as text. */
function Snippet({ html }: { html: string }) {
  const parts = html.split(/(<b>.*?<\/b>)/g);
  return (
    <p className="hit-snippet">
      {parts.map((part, index) =>
        part.startsWith('<b>') ? <mark key={index}>{part.slice(3, -4)}</mark> : <span key={index}>{part}</span>,
      )}
    </p>
  );
}

export function SearchPage({ initialQuery, repositories }: { initialQuery?: string; repositories: Repository[] | null }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [scope, setScope] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string, repositoryId: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setError(t('searchMinChars'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: trimmed });
      if (repositoryId) params.set('repositoryId', repositoryId);
      const body = await api<{ items: SearchHit[] }>(`/api/v1/search?${params.toString()}`);
      setHits(body.items);
      setSubmitted(trimmed);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      void run(initialQuery, scope);
    }
  }, [initialQuery]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(query, scope);
  }

  const repoName = (id: string) => repositories?.find((repo) => repo.id === id)?.name ?? '—';

  return (
    <div className="page page-narrow">
      <PageHeader title={t('searchHeading')} subtitle={t('searchSubtitle')} />

      <form className="search-panel" role="search" onSubmit={onSubmit}>
        <div className="search-big">
          <IconSearch size={20} />
          <input
            type="search"
            aria-label={t('globalSearchLabel')}
            placeholder={t('globalSearchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={busy}>{t('searchButton')}</Button>
        </div>
        <div className="search-filters">
          <label htmlFor="scope">{t('searchScope')}</label>
          <select id="scope" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="">{t('allRepositories')}</option>
            {repositories?.map((repo) => (
              <option key={repo.id} value={repo.id}>{repo.name}</option>
            ))}
          </select>
          {scope ? (
            <button type="button" className="chip" onClick={() => setScope('')}>
              {repoName(scope)} ×
            </button>
          ) : null}
        </div>
      </form>

      {error ? <Alert tone={error === t('searchMinChars') ? 'warning' : 'danger'}>{error}</Alert> : null}

      {busy ? (
        <SkeletonRows rows={4} />
      ) : hits === null ? (
        <EmptyState icon={<IconSearch size={32} />} title={t('searchStart')} hint={t('searchStartHint')} />
      ) : hits.length === 0 ? (
        <EmptyState icon={<IconSearch size={32} />} title={t('searchNoResults', { q: submitted ?? '' })} hint={t('searchNoResultsHint')} />
      ) : (
        <>
          <p className="muted small" aria-live="polite">{t('searchResultsCount', { count: hits.length, q: submitted ?? '' })}</p>
          <ul className="hit-list">
            {hits.map((hit) => (
              <li key={hit.documentId}>
                <button
                  type="button"
                  className="hit"
                  onClick={() =>
                    navigate({ name: 'documents', repositoryId: hit.repositoryId, folderId: hit.folderId ?? undefined })
                  }
                  aria-label={`${t('openInFolder')}: ${hit.displayName}`}
                >
                  <FileIcon kind={fileKind(undefined, hit.displayName)} size={32} />
                  <span className="hit-body">
                    <span className="hit-title">
                      <strong>{hit.displayName}</strong>
                      <Badge tone="neutral">{repoName(hit.repositoryId)}</Badge>
                      {hit.matchedOn.includes('name') ? <Badge tone="info">{t('searchMatchedName')}</Badge> : null}
                      {hit.matchedOn.includes('content') ? <Badge tone="success">{t('searchMatchedContent')}</Badge> : null}
                    </span>
                    {hit.snippet ? <Snippet html={hit.snippet} /> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
