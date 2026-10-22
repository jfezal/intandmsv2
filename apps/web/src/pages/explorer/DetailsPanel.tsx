import { useEffect, useState } from 'react';
import { DocumentPreview } from '../../components/DocumentPreview';
import { FileIcon, IconDownload, IconMessage, IconTasks, IconX } from '../../components/icons';
import { DocumentDiscussion, ShareToChatModal } from '../messages/DocumentChat';
import { Alert, Badge, Button, IconButton } from '../../components/ui';
import { api, type DocumentRow, type WorkflowCandidates, type WorkflowDefinitionSummary } from '../../lib/api';
import { fileKind, formatBytes, formatDateTime } from '../../lib/format';
import { useI18n } from '../../i18n';
import { Field, Modal, errorText, useAction } from '../admin/shared';

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
  const [sharing, setSharing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [flows, setFlows] = useState<WorkflowDefinitionSummary[] | null>(null);

  useEffect(() => {
    setMessage(null);
    setSharing(false);
    setReviewing(false);
  }, [document.id]);

  useEffect(() => {
    if (!canWrite) return;
    let cancelled = false;
    void api<WorkflowDefinitionSummary[]>('/api/v1/workflow/definitions')
      .then((rows) => {
        if (!cancelled) setFlows(rows);
      })
      .catch(() => {
        if (!cancelled) setFlows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canWrite, document.id]);

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
          <Button
            size="sm"
            icon={<IconTasks size={16} />}
            onClick={() => setReviewing(true)}
            disabled={!version || !flows?.length}
            title={
              !version ? t('reviewNeedsVersion') : !flows?.length ? t('reviewNoFlow') : undefined
            }
          >
            {t('startReview')}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" icon={<IconMessage size={16} />} onClick={() => setSharing(true)}>
          {t('chatShare')}
        </Button>
      </div>
      {message ? <Alert tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Alert> : null}
      {canWrite && !version ? <p className="hint">{t('reviewNeedsVersion')}</p> : null}
      {canWrite && version && flows && flows.length === 0 ? <p className="hint">{t('reviewNoFlow')}</p> : null}

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
      {reviewing && flows?.length ? (
        <StartReviewModal
          documentId={document.id}
          flows={flows}
          onClose={() => setReviewing(false)}
          onStarted={() => {
            setReviewing(false);
            setMessage({ tone: 'success', text: t('reviewStarted') });
            onReviewStarted();
          }}
        />
      ) : null}
      {sharing ? (
        <ShareToChatModal documentId={document.id} documentName={document.displayName} meId={meId} onClose={() => setSharing(false)} />
      ) : null}
    </aside>
  );
}

function StartReviewModal({
  documentId,
  flows,
  onClose,
  onStarted,
}: {
  documentId: string;
  flows: WorkflowDefinitionSummary[];
  onClose: () => void;
  onStarted: () => void;
}) {
  const { t } = useI18n();
  const [definitionId, setDefinitionId] = useState(flows[0]?.id ?? '');
  const [candidates, setCandidates] = useState<WorkflowCandidates | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    if (!definitionId) return;
    let cancelled = false;
    setCandidates(null);
    setLoadError(null);
    void api<WorkflowCandidates>(`/api/v1/workflow/documents/${documentId}/candidates?definitionId=${definitionId}`)
      .then((result) => {
        if (cancelled) return;
        setCandidates(result);
        const next: Record<string, string> = {};
        for (const step of result.steps) {
          if (step.candidates.length === 1) next[step.key] = step.candidates[0].id;
        }
        setPicks(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error, t));
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId, documentId, t]);

  const steps =
    candidates && candidates.definitionId === definitionId ? candidates.steps : null;
  const ready = Boolean(steps?.every((step) => picks[step.key] && step.candidates.length > 0));

  return (
    <Modal
      title={t('startReviewTitle')}
      description={t('startReviewHint')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="primary"
            disabled={action.busy || !ready}
            onClick={() =>
              void action.run(async () => {
                await api(`/api/v1/workflow/documents/${documentId}/start-review`, {
                  method: 'POST',
                  body: JSON.stringify({ definitionId, assignees: picks }),
                });
                onStarted();
              })
            }
          >
            {action.busy ? t('saving') : t('startReview')}
          </Button>
        </>
      }
    >
      {action.error ? <Alert tone="danger">{action.error}</Alert> : null}
      {loadError ? <Alert tone="danger">{loadError}</Alert> : null}
      <Field label={t('workflowName')} htmlFor="review-flow">
        <select
          id="review-flow"
          value={definitionId}
          onChange={(event) => {
            setDefinitionId(event.target.value);
            setCandidates(null);
            setPicks({});
            setLoadError(null);
          }}
        >
          {flows.map((flow) => (
            <option key={flow.id} value={flow.id}>
              {flow.name}
            </option>
          ))}
        </select>
      </Field>
      {steps
        ? steps.map((step) => (
            <Field key={step.key} label={step.name} htmlFor={`review-step-${step.key}`}>
              {step.candidates.length === 0 ? (
                <p className="hint">{t('reviewNoCandidates')}</p>
              ) : (
                <select
                  id={`review-step-${step.key}`}
                  required
                  value={picks[step.key] ?? ''}
                  onChange={(event) => setPicks((current) => ({ ...current, [step.key]: event.target.value }))}
                >
                  <option value="">{t('workflowChoosePerson')}</option>
                  {step.candidates.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} (@{user.login})
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ))
        : !loadError ? (
            <p className="muted small">{t('loading')}</p>
          ) : null}
    </Modal>
  );
}
