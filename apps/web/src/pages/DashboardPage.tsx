import { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, PageHeader, SkeletonRows } from '../components/ui';
import { IconDatabase, IconFolder, IconLock, IconTasks } from '../components/icons';
import { api, type MeUser, type Repository, type WorkflowTask } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { href } from '../lib/route';
import { useI18n } from '../i18n';
import { useTaskStepLabel } from './TasksPage';

export function DashboardPage({
  user,
  repositories,
  tasks,
}: {
  user: MeUser;
  repositories: Repository[] | null;
  tasks: WorkflowTask[] | null;
}) {
  const { t, locale } = useI18n();
  const stepLabel = useTaskStepLabel();
  const [pending, setPending] = useState<number | null>(null);
  const canJobs = user.permissions.includes('jobs.manage');

  useEffect(() => {
    if (!canJobs) {
      return;
    }
    let active = true;
    const load = () =>
      api<{ pending: number }>('/api/v1/jobs/outbox/pending-count')
        .then((body) => active && setPending(body.pending))
        .catch(() => active && setPending(null));
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canJobs]);

  const managed = repositories?.filter((repo) => repo.type === 'MANAGED').length ?? 0;
  const indexed = repositories?.filter((repo) => repo.type === 'INDEXED').length ?? 0;

  return (
    <div className="page">
      <PageHeader title={t('dashboardGreeting', { name: user.displayName })} subtitle={t('dashboardSubtitle')} />

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-icon tone-accent"><IconFolder /></span>
          <div>
            <span className="stat-label">{t('widgetRepositories')}</span>
            <strong className="stat-value">{repositories ? repositories.length : '—'}</strong>
            <span className="stat-foot">
              {t('managed')} {managed} · {t('indexed')} {indexed}
            </span>
          </div>
        </div>
        <div className="stat">
          <span className="stat-icon tone-warning"><IconTasks /></span>
          <div>
            <span className="stat-label">{t('widgetTasks')}</span>
            <strong className="stat-value">{tasks ? tasks.length : '—'}</strong>
            <a className="stat-foot link" href={href({ name: 'tasks' })}>{t('viewAllTasks')}</a>
          </div>
        </div>
        {canJobs ? (
          <div className="stat">
            <span className="stat-icon tone-info"><IconDatabase /></span>
            <div>
              <span className="stat-label">{t('widgetOutbox')}</span>
              <strong className="stat-value">{pending ?? '—'}</strong>
              <span className="stat-foot">{t('widgetOutboxHint')}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="dash-grid">
        <Card title={t('widgetRepositories')} extra={<span className="muted small">{t('widgetScopeYou')}</span>}>
          {repositories === null ? (
            <SkeletonRows rows={3} />
          ) : repositories.length === 0 ? (
            <EmptyState icon={<IconFolder size={28} />} title={t('noRepositoriesYet')} hint={t('noRepositoriesHint')} />
          ) : (
            <ul className="repo-cards">
              {repositories.map((repo) => (
                <li key={repo.id}>
                  <a className="repo-card" href={href({ name: 'documents', repositoryId: repo.id })}>
                    <span className={`repo-glyph ${repo.type === 'MANAGED' ? 'tone-accent' : 'tone-neutral'}`}>
                      {repo.type === 'MANAGED' ? <IconFolder /> : <IconLock />}
                    </span>
                    <span className="repo-card-body">
                      <strong>{repo.name}</strong>
                      <span className="repo-card-meta">
                        <Badge tone={repo.type === 'MANAGED' ? 'accent' : 'neutral'}>
                          {repo.type === 'MANAGED' ? t('managed') : t('indexed')}
                        </Badge>
                      </span>
                    </span>
                    <span className="repo-open">{t('openRepository')}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('widgetTasks')} extra={<a className="link small" href={href({ name: 'tasks' })}>{t('viewAllTasks')}</a>}>
          {tasks === null ? (
            <SkeletonRows rows={3} />
          ) : tasks.length === 0 ? (
            <EmptyState icon={<IconTasks size={28} />} title={t('noTasks')} hint={t('noTasksHint')} />
          ) : (
            <ul className="task-mini">
              {tasks.slice(0, 5).map((task) => (
                <li key={task.id}>
                  <a className="task-mini-link" href={href({ name: 'tasks', taskId: task.id })}>
                    <span className="dot dot-warning" aria-hidden="true" />
                    <span className="task-mini-body">
                      <strong>{task.document?.displayName ?? stepLabel(task.stepKey)}</strong>
                      <span className="muted small">
                        {stepLabel(task.stepKey)} · {t('taskCreated')}: {formatDateTime(task.createdAt, locale)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
