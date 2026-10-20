import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentPreview } from '../components/DocumentPreview';
import {
  FileIcon,
  IconArrowLeft,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFolderOpen,
  IconRefresh,
  IconSearch,
  IconTasks,
  IconX,
} from '../components/icons';
import { Alert, Badge, Button, EmptyState, IconButton, PageHeader, SkeletonRows } from '../components/ui';
import { api, type WorkflowTask } from '../lib/api';
import { fileKind, formatDateTime, formatInboxDate } from '../lib/format';
import { href, navigate } from '../lib/route';
import { type MessageKey, useI18n } from '../i18n';

const STEP_LABELS: Record<string, MessageKey> = {
  review: 'taskStepReview',
  approval: 'taskStepApproval',
  approve: 'taskStepApproval',
};

export function useTaskStepLabel(): (stepKey: string) => string {
  const { t } = useI18n();
  return (stepKey) => (STEP_LABELS[stepKey] ? t(STEP_LABELS[stepKey]) : stepKey);
}

const isOverdue = (task: WorkflowTask) => Boolean(task.dueAt && new Date(task.dueAt).getTime() < Date.now());

function TaskList({
  tasks,
  onRefresh,
}: {
  tasks: WorkflowTask[];
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const stepLabel = useTaskStepLabel();
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return tasks;
    return tasks.filter((task) =>
      [task.document?.displayName, task.document?.repositoryName, task.requestedBy?.displayName, stepLabel(task.stepKey)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [tasks, filter, stepLabel]);

  function onRowKey(event: KeyboardEvent<HTMLTableRowElement>, taskId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate({ name: 'tasks', taskId });
    }
  }

  return (
    <section className="inbox">
      <div className="inbox-toolbar">
        <label className="filter-input">
          <IconSearch size={16} />
          <input
            type="search"
            aria-label={t('tasksFilter')}
            placeholder={t('tasksFilter')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <span className="muted small" aria-live="polite">{t('tasksCount', { count: tasks.length })}</span>
        <IconButton label={t('refresh')} onClick={onRefresh}>
          <IconRefresh size={16} />
        </IconButton>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<IconSearch size={28} />} title={t('tasksFilterNoMatch', { q: filter.trim() })} />
      ) : (
        <table className="data-table inbox-table">
          <thead>
            <tr>
              <th scope="col">{t('taskColDocument')}</th>
              <th scope="col" className="col-type">{t('taskColType')}</th>
              <th scope="col" className="col-from">{t('taskColFrom')}</th>
              <th scope="col" className="col-date">{t('taskColReceived')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((task) => (
              <tr
                key={task.id}
                tabIndex={0}
                className={isOverdue(task) ? 'is-overdue' : undefined}
                onClick={() => navigate({ name: 'tasks', taskId: task.id })}
                onKeyDown={(event) => onRowKey(event, task.id)}
              >
                <td>
                  <span className="inbox-subject">
                    <span className="dot dot-warning" aria-hidden="true" />
                    <FileIcon kind={fileKind(undefined, task.document?.displayName ?? '')} size={28} />
                    <span className="inbox-subject-text">
                      <a
                        href={href({ name: 'tasks', taskId: task.id })}
                        onClick={(event) => event.stopPropagation()}
                        tabIndex={-1}
                      >
                        {task.document?.displayName ?? t('taskDocumentMissing')}
                      </a>
                      <span className="muted small">
                        {task.document?.repositoryName}
                        {isOverdue(task) ? <Badge tone="danger">{t('taskOverdue')}</Badge> : null}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="col-type">
                  <Badge tone="info">{stepLabel(task.stepKey)}</Badge>
                </td>
                <td className="col-from">{task.requestedBy?.displayName ?? '—'}</td>
                <td className="col-date nowrap" title={formatDateTime(task.createdAt, locale)}>
                  {formatInboxDate(task.createdAt, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TaskDetail({
  task,
  position,
  total,
  previousId,
  nextId,
  onDecided,
}: {
  task: WorkflowTask;
  position: number;
  total: number;
  previousId?: string;
  nextId?: string;
  onDecided: () => void;
}) {
  const { t, locale } = useI18n();
  const stepLabel = useTaskStepLabel();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setComment('');
    setError(null);
    setBusy(false);
    headingRef.current?.focus();
  }, [task.id]);

  async function decide(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !window.confirm(t('confirmReject'))) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/workflow/tasks/${task.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
      });
      onDecided();
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : t('errorGeneric'));
      setBusy(false);
    }
  }

  const document = task.document;

  return (
    <article className="task-detail" aria-labelledby="task-detail-title">
      <div className="task-detail-bar">
        <Button variant="ghost" size="sm" icon={<IconArrowLeft size={16} />} onClick={() => navigate({ name: 'tasks' })}>
          {t('backToTasks')}
        </Button>
        <span className="task-detail-pager">
          <span className="muted small">{t('taskPosition', { n: position, total })}</span>
          <IconButton
            label={t('previousTask')}
            disabled={!previousId}
            onClick={() => previousId && navigate({ name: 'tasks', taskId: previousId }, { replace: true })}
          >
            <IconChevronLeft size={16} />
          </IconButton>
          <IconButton
            label={t('nextTask')}
            disabled={!nextId}
            onClick={() => nextId && navigate({ name: 'tasks', taskId: nextId }, { replace: true })}
          >
            <IconChevronRight size={16} />
          </IconButton>
        </span>
      </div>

      <header className="task-detail-head">
        <FileIcon kind={fileKind(undefined, document?.displayName ?? '')} size={44} />
        <div className="task-head-body">
          <span className="task-step muted small">{stepLabel(task.stepKey)}</span>
          <h2 id="task-detail-title" ref={headingRef} tabIndex={-1}>
            {document?.displayName ?? t('taskDocumentMissing')}
          </h2>
          <div className="task-meta muted small">
            {task.requestedBy ? <span>{t('taskRequestedBy', { name: task.requestedBy.displayName })}</span> : null}
            <span>{formatDateTime(task.createdAt, locale)}</span>
          </div>
        </div>
        <Badge tone={isOverdue(task) ? 'danger' : 'warning'}>
          {isOverdue(task) ? t('taskOverdue') : task.status === 'pending' ? t('taskStatusPending') : task.status}
        </Badge>
      </header>

      <div className="task-detail-body">
        <div className="task-detail-main">
          {document ? (
            <>
              <div className="details-actions">
                <a className="btn btn-secondary btn-sm" href={`/api/v1/documents/${document.id}/download`} download>
                  <IconDownload size={16} />
                  <span>{t('download')}</span>
                </a>
                <a
                  className="btn btn-ghost btn-sm"
                  href={href({ name: 'documents', repositoryId: document.repositoryId, folderId: document.folderId ?? undefined })}
                >
                  <IconFolderOpen size={16} />
                  <span>{t('openInFolder')}</span>
                </a>
              </div>
              <DocumentPreview documentId={document.id} displayName={document.displayName} large />
            </>
          ) : (
            <Alert tone="warning">{t('taskDocumentMissing')}</Alert>
          )}
        </div>

        <aside className="task-detail-side">
          <section className="card">
            <div className="card-head"><h2>{t('taskDetailsHeading')}</h2></div>
            <dl className="meta-list">
              <div>
                <dt>{t('taskColType')}</dt>
                <dd>{stepLabel(task.stepKey)}</dd>
              </div>
              {document ? (
                <div>
                  <dt>{t('repositories')}</dt>
                  <dd>{document.repositoryName}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t('taskColFrom')}</dt>
                <dd>{task.requestedBy ? `${task.requestedBy.displayName} (@${task.requestedBy.login})` : '—'}</dd>
              </div>
              <div>
                <dt>{t('taskCreated')}</dt>
                <dd>{formatDateTime(task.createdAt, locale)}</dd>
              </div>
              <div>
                <dt>{t('taskDue')}</dt>
                <dd>{task.dueAt ? formatDateTime(task.dueAt, locale) : '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="card task-decision">
            <div className="card-head"><h2>{t('taskDecisionHeading')}</h2></div>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div className="field">
              <label htmlFor={`comment-${task.id}`}>{t('commentOptional')}</label>
              <textarea
                id={`comment-${task.id}`}
                rows={4}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
            <div className="task-actions">
              <Button variant="danger" icon={<IconX size={16} />} disabled={busy} onClick={() => void decide('reject')}>
                {t('reject')}
              </Button>
              <Button variant="primary" icon={<IconCheck size={16} />} disabled={busy} onClick={() => void decide('approve')}>
                {t('approve')}
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </article>
  );
}

export function TasksPage({
  tasks,
  taskId,
  onChanged,
}: {
  tasks: WorkflowTask[] | null;
  taskId?: string;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [notice, setNotice] = useState<string | null>(null);

  const index = taskId && tasks ? tasks.findIndex((task) => task.id === taskId) : -1;
  const selected = index >= 0 ? tasks![index] : undefined;

  function afterDecision() {
    const following = tasks?.[index + 1] ?? tasks?.[index - 1];
    setNotice(t('taskDecided'));
    onChanged();
    navigate(following ? { name: 'tasks', taskId: following.id } : { name: 'tasks' }, { replace: true });
  }

  let body;
  if (tasks === null) {
    body = <SkeletonRows rows={4} />;
  } else if (taskId && !selected) {
    body = (
      <EmptyState
        icon={<IconTasks size={32} />}
        title={t('taskNotFound')}
        hint={t('taskNotFoundHint')}
        action={<Button icon={<IconArrowLeft size={16} />} onClick={() => navigate({ name: 'tasks' })}>{t('backToTasks')}</Button>}
      />
    );
  } else if (selected) {
    body = (
      <TaskDetail
        task={selected}
        position={index + 1}
        total={tasks.length}
        previousId={tasks[index - 1]?.id}
        nextId={tasks[index + 1]?.id}
        onDecided={afterDecision}
      />
    );
  } else if (tasks.length === 0) {
    body = <EmptyState icon={<IconTasks size={32} />} title={t('noTasks')} hint={t('noTasksHint')} />;
  } else {
    body = <TaskList tasks={tasks} onRefresh={onChanged} />;
  }

  return (
    <div className="page">
      {selected ? null : <PageHeader title={t('tasksHeading')} subtitle={t('tasksSubtitle')} />}
      {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}
      {body}
    </div>
  );
}
