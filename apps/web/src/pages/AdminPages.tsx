import { IconRefresh, IconShield } from '../components/icons';
import { Badge, Button, Card, EmptyState, PageHeader, SkeletonRows } from '../components/ui';
import type { AuditEvent } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useI18n } from '../i18n';
import { LoadError, useLoad } from './admin/shared';

export { MessageInvestigationPage } from './admin/MessageInvestigationPage';
export { RepositoriesPage } from './admin/RepositoriesPage';
export { RolesPage } from './admin/RolesPage';
export { StoragePage } from './admin/StoragePage';
export { UsersPage } from './admin/UsersPage';

export function AuditPage() {
  const { t, locale } = useI18n();
  const { data, error, reload } = useLoad<AuditEvent[]>('/api/v1/audit/events?limit=100');
  return (
    <div className="page">
      <PageHeader
        title={t('auditHeading')}
        subtitle={t('auditSubtitle')}
        actions={<Button size="sm" icon={<IconRefresh size={16} />} onClick={() => void reload()}>{t('refresh')}</Button>}
      />
      {error ? <LoadError message={error} onRetry={() => void reload()} /> : null}
      <Card>
        {data === null && !error ? (
          <SkeletonRows rows={6} />
        ) : !data?.length ? (
          <EmptyState icon={<IconShield size={28} />} title={t('auditHeading')} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t('colTime')}</th>
                <th scope="col">{t('colAction')}</th>
                <th scope="col">{t('colTarget')}</th>
                <th scope="col">{t('colActor')}</th>
                <th scope="col">{t('colOutcome')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((event) => (
                <tr key={event.id}>
                  <td className="muted nowrap">{formatDateTime(event.createdAt, locale)}</td>
                  <td className="mono">{event.action}</td>
                  <td className="muted">
                    {event.targetType ?? '—'}
                    {event.targetId ? <span className="mono small"> · {event.targetId.slice(0, 8)}</span> : null}
                  </td>
                  <td>
                    {event.actor ? (
                      <span title={event.actorUserId ?? undefined}>
                        {event.actor.displayName} <span className="muted small">@{event.actor.login}</span>
                      </span>
                    ) : event.actorUserId ? (
                      <span className="mono small" title={event.actorUserId}>{event.actorUserId.slice(0, 8)}</span>
                    ) : (
                      <span className="muted">{t('systemActor')}</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={event.outcome === 'success' ? 'success' : 'danger'}>{event.outcome}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
