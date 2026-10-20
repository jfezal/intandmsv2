import { useState } from 'react';
import { IconAlert, IconCheck, IconChevronDown, IconChevronRight, IconUpload, IconX } from '../../components/icons';
import { Button, IconButton } from '../../components/ui';
import { formatBytes } from '../../lib/format';
import { useI18n } from '../../i18n';
import type { UploadItem } from './useUploads';

export function UploadQueue({
  items,
  onCancel,
  onRetry,
  onClear,
}: {
  items: UploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onClear: () => void;
}) {
  const { t, locale } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  if (!items.length) return null;

  const active = items.filter((item) => item.state === 'transferring' || item.state === 'processing').length;

  function statusText(item: UploadItem): string {
    switch (item.state) {
      case 'transferring':
        return t('statusTransferring', { pct: Math.round(item.progress * 100) });
      case 'processing':
        return t('statusScanning');
      case 'published':
        return t('statusPublished');
      case 'rejected':
        return t('statusRejected');
      case 'cancelled':
        return t('statusCancelled');
      default:
        return t('statusFailed', { reason: item.error ?? t('errorGeneric') });
    }
  }

  return (
    <section className="upload-queue" aria-label={t('uploadQueue')}>
      <header>
        <button type="button" className="uq-toggle" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
          {collapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
          <IconUpload size={16} />
          <strong>{t('uploadQueue')}</strong>
          <span className="muted small">{active ? `${active}/${items.length}` : items.length}</span>
        </button>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={active === items.length}>
          {t('clearFinished')}
        </Button>
      </header>
      {collapsed ? null : (
        <ul aria-live="polite">
          {items.map((item) => (
            <li key={item.id} className={`uq-item uq-${item.state}`}>
              <span className="uq-icon" aria-hidden="true">
                {item.state === 'published' ? <IconCheck size={16} /> : item.state === 'failed' || item.state === 'rejected' ? <IconAlert size={16} /> : <IconUpload size={16} />}
              </span>
              <div className="uq-body">
                <div className="uq-line">
                  <span className="uq-name" title={item.name}>{item.name}</span>
                  <span className="muted small">{formatBytes(item.size, locale)}</span>
                </div>
                {item.state === 'transferring' || item.state === 'processing' ? (
                  <div
                    className={`progress${item.state === 'processing' ? ' progress-indeterminate' : ''}`}
                    role="progressbar"
                    aria-label={item.name}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.state === 'transferring' ? Math.round(item.progress * 100) : undefined}
                  >
                    <span style={item.state === 'transferring' ? { width: `${item.progress * 100}%` } : undefined} />
                  </div>
                ) : null}
                <span className="uq-status small">{statusText(item)}</span>
              </div>
              {item.state === 'transferring' ? (
                <IconButton label={t('cancelUpload', { name: item.name })} onClick={() => onCancel(item.id)}>
                  <IconX size={14} />
                </IconButton>
              ) : item.state === 'failed' || item.state === 'cancelled' ? (
                <Button size="sm" variant="ghost" onClick={() => onRetry(item.id)}>
                  {t('retry')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
