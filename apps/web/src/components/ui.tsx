import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useI18n } from '../i18n';
import { IconAlert, IconCheck, IconInfo, IconX } from './icons';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon}
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
};

export function Button({ variant = 'secondary', size = 'md', icon, children, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={`btn btn-${variant} btn-${size}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className={`icon-btn${className ? ` ${className}` : ''}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  onDismiss,
  action,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  const icon = tone === 'success' ? <IconCheck /> : tone === 'info' ? <IconInfo /> : <IconAlert />;
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="alert-icon">{icon}</span>
      <div className="alert-body">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action}
      {onDismiss ? (
        <IconButton label={t('dismiss')} onClick={onDismiss}>
          <IconX size={16} />
        </IconButton>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {hint ? <p>{hint}</p> : null}
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div className="skeleton-list" aria-busy="true" aria-label={t('loading')}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-row">
          <span className="skeleton skeleton-icon" />
          <span className="skeleton skeleton-line" style={{ width: `${55 + ((index * 13) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, extra, children, className }: { title?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {title || extra ? (
        <div className="card-head">
          {title ? <h2>{title}</h2> : <span />}
          {extra}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}
