import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import type { MeUser } from '../lib/api';
import { type Locale, type MessageKey, useI18n } from '../i18n';
import { type Route, href, navigate } from '../lib/route';
import {
  IconDatabase,
  IconFolder,
  IconHome,
  IconLock,
  IconLogout,
  IconMenu,
  IconMessage,
  IconSearch,
  IconServer,
  IconShield,
  IconTasks,
  IconUsers,
} from './icons';
import { IconButton } from './ui';

type NavItem = {
  route: Route;
  match: Route['name'][];
  label: MessageKey;
  icon: ReactNode;
  permission?: string;
  badge?: number;
};

export function Shell({
  user,
  route,
  locale,
  onLocaleChange,
  onLogout,
  taskCount,
  unreadMessages,
  topbarExtra,
  children,
}: {
  user: MeUser;
  route: Route;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onLogout: () => void;
  taskCount: number;
  unreadMessages: number;
  topbarExtra?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState(route.name === 'search' ? (route.q ?? '') : '');
  const admin = user.permissions.includes('system.admin');
  const can = (permission?: string) =>
    !permission || admin || user.permissions.includes(permission) || (user.scopedPermissions ?? []).includes(permission);

  useEffect(() => {
    setNavOpen(false);
  }, [route]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.global-search input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const primary: NavItem[] = [
    { route: { name: 'dashboard' }, match: ['dashboard'], label: 'navDashboard', icon: <IconHome /> },
    { route: { name: 'documents' }, match: ['documents'], label: 'navDocuments', icon: <IconFolder />, permission: 'documents.read' },
    { route: { name: 'search' }, match: ['search'], label: 'navSearch', icon: <IconSearch />, permission: 'search.query' },
    { route: { name: 'tasks' }, match: ['tasks'], label: 'navTasks', icon: <IconTasks />, badge: taskCount },
    { route: { name: 'messages' }, match: ['messages'], label: 'navMessages', icon: <IconMessage />, badge: unreadMessages },
  ];
  const adminItems = (
    [
      { route: { name: 'admin-users' }, match: ['admin-users'], label: 'navUsers', icon: <IconUsers />, permission: 'users.manage' },
      { route: { name: 'admin-departments' }, match: ['admin-departments'], label: 'navDepartments', icon: <IconUsers />, permission: 'users.manage' },
      { route: { name: 'admin-roles' }, match: ['admin-roles'], label: 'navRoles', icon: <IconLock />, permission: 'users.manage' },
      { route: { name: 'admin-repositories' }, match: ['admin-repositories'], label: 'navRepositories', icon: <IconDatabase />, permission: 'repositories.manage' },
      { route: { name: 'admin-connectors' }, match: ['admin-connectors'], label: 'navConnectors', icon: <IconServer />, permission: 'connectors.manage' },
      { route: { name: 'admin-audit' }, match: ['admin-audit'], label: 'navAudit', icon: <IconShield />, permission: 'audit.read' },
      { route: { name: 'admin-messages' }, match: ['admin-messages'], label: 'navMessageInvestigation', icon: <IconMessage />, permission: 'messages.audit' },
    ] satisfies NavItem[]
  ).filter((item) => can(item.permission));

  function renderItem(item: NavItem) {
    const active = item.match.includes(route.name);
    return (
      <li key={item.label}>
        <a className={`nav-link${active ? ' active' : ''}`} href={href(item.route)} aria-current={active ? 'page' : undefined}>
          {item.icon}
          <span>{t(item.label)}</span>
          {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
        </a>
      </li>
    );
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    navigate({ name: 'search', q: query.trim() || undefined });
  }

  const initials = user.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}`}>
      <a className="skip-link" href="#main">
        {t('skipToContent')}
      </a>
      <aside className="sidebar" aria-label={t('mainNavigation')}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">i</span>
          <span className="brand-name">{t('appName')}</span>
        </div>
        <nav>
          <ul className="nav-list">{primary.filter((item) => can(item.permission)).map(renderItem)}</ul>
          {adminItems.length ? (
            <>
              <p className="nav-section">{t('navAdministration')}</p>
              <ul className="nav-list">{adminItems.map(renderItem)}</ul>
            </>
          ) : null}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span className="user-meta">
              <strong>{user.displayName}</strong>
              <span>{user.login}</span>
            </span>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="main-col">
        <header className="topbar">
          <IconButton className="menu-toggle" label={t('mainNavigation')} onClick={() => setNavOpen((open) => !open)}>
            <IconMenu />
          </IconButton>
          {can('search.query') ? (
            <form className="global-search" role="search" onSubmit={onSearch}>
              <IconSearch size={16} />
              <input
                type="search"
                aria-label={t('globalSearchLabel')}
                placeholder={t('globalSearchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd aria-hidden="true">/</kbd>
            </form>
          ) : (
            <span />
          )}
          <div className="topbar-actions">
            {topbarExtra}
            <div className="segmented" role="group" aria-label={t('language')}>
              {(['ms', 'en'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={locale === option ? 'active' : ''}
                  aria-pressed={locale === option}
                  onClick={() => onLocaleChange(option)}
                >
                  {option === 'ms' ? 'BM' : 'EN'}
                </button>
              ))}
            </div>
            <IconButton label={t('logout')} onClick={onLogout}>
              <IconLogout />
            </IconButton>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
