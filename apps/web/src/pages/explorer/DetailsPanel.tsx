import { useEffect, useState } from 'react';
import { DocumentPreview } from '../../components/DocumentPreview';
import { FileIcon, IconDownload, IconMessage, IconTasks, IconX } from '../../components/icons';
import { DocumentDiscussion, ShareToChatModal } from '../messages/DocumentChat';
import { Alert, Badge, Button, IconButton } from '../../components/ui';
import { api, type DocumentRow } from '../../lib/api';
import { fileKind, formatBytes, formatDateTime } from '../../lib/format';
import { useI18n } from '../../i18n';

export function DetailsPanel({
  document,
  meId,
  canWrite,
  onClose,
  onReviewStarted,
}: {
  document: DocumentRow;
  meId: string;
  canWrite: boolean;
  onClose: () => void;
  onReviewStarted: () => void;
}) {
  const { t, locale } = useI18n();
  const version = document.currentVersion;
  const kind = fileKind(version?.mimeType, document.displayName);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setMessage(null);
    setSharing(false);
  }, [document.id]);

  async function startReview() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/v1/workflow/documents/${document.id}/start-review`, { method: 'POST' });
      setMessage({ tone: 'success', text: t('reviewStarted') });
      onReviewStarted();
    } catch (error) {
      setMessage({ tone: 'danger', text: error instanceof Error ? error.message : t('errorGeneric') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="details" aria-label={t('details')}>
      <header className="details-head">
        <FileIcon kind={kind} size={36} />
        <div className="details-title">
          <h2 title={document.displayName}>{document.displayName}</h2>
          {version ? <Badge tone="neutral">{t('versionLabel', { n: version.sequence })}</Badge> : null}
        </div>
        <IconButton label={t('closeDetails')} onClick={onClose}>
          <IconX size={16} />
        </IconButton>
      </header>

      <div className="details-actions">
        <a className="btn btn-primary btn-sm" href={`/api/v1/documents/${document.id}/download`} download>
          <IconDownload size={16} />
          <span>{t('download')}</span>
        </a>
        {canWrite ? (
          <Button size="sm" icon={<IconTasks size={16} />} onClick={() => void startReview()} disabled={busy}>
            {t('startReview')}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" icon={<IconMessage size={16} />} onClick={() => setSharing(true)}>
          {t('chatShare')}
        </Button>
      </div>
      {message ? <Alert tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Alert> : null}

      <DocumentPreview documentId={document.id} displayName={document.displayName} />

      <dl className="meta-list">
        <div>
          <dt>{t('fileType')}</dt>
          <dd>{version?.mimeType ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('fileSize')}</dt>
          <dd>{formatBytes(version?.sizeBytes, locale)}</dd>
        </div>
        <div>
          <dt>{t('created')}</dt>
          <dd>{formatDateTime(document.createdAt, locale)}</dd>
        </div>
        <div>
          <dt>{t('lastModified')}</dt>
          <dd>{formatDateTime(document.updatedAt, locale)}</dd>
        </div>
        {version?.sha256 ? (
          <div>
            <dt>{t('checksum')}</dt>
            <dd className="mono" title={version.sha256}>{version.sha256.slice(0, 16)}…</dd>
          </div>
        ) : null}
      </dl>

      <DocumentDiscussion documentId={document.id} meId={meId} />
      {sharing ? (
        <ShareToChatModal documentId={document.id} documentName={document.displayName} meId={meId} onClose={() => setSharing(false)} />
      ) : null}
    </aside>
  );
}
