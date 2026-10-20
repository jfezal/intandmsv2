import { useEffect, useState } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'documents'; repositoryId?: string; folderId?: string }
  | { name: 'search'; q?: string }
  | { name: 'tasks'; taskId?: string }
  | { name: 'messages'; conversationId?: string }
  | { name: 'admin-users' }
  | { name: 'admin-departments' }
  | { name: 'admin-messages' }
  | { name: 'admin-roles' }
  | { name: 'admin-repositories'; repositoryId?: string; tab?: 'overview' | 'settings' | 'access' }
  | { name: 'admin-connectors' }
  | { name: 'admin-audit' };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const segments = path.split('/').filter(Boolean);
  switch (segments[0]) {
    case 'documents':
      return {
        name: 'documents',
        repositoryId: segments[1],
        folderId: params.get('folder') ?? undefined,
      };
    case 'search':
      return { name: 'search', q: params.get('q') ?? undefined };
    case 'tasks':
      return { name: 'tasks', taskId: segments[1] };
    case 'messages':
      return { name: 'messages', conversationId: segments[1] };
    case 'admin':
      if (segments[1] === 'messages') return { name: 'admin-messages' };
      if (segments[1] === 'departments') return { name: 'admin-departments' };
      if (segments[1] === 'roles') return { name: 'admin-roles' };
      if (segments[1] === 'repositories') {
        const tab = params.get('tab');
        return {
          name: 'admin-repositories',
          repositoryId: params.get('id') ?? undefined,
          tab: tab === 'overview' || tab === 'settings' || tab === 'access' ? tab : undefined,
        };
      }
      if (segments[1] === 'connectors' || segments[1] === 'storage') return { name: 'admin-connectors' };
      if (segments[1] === 'audit') return { name: 'admin-audit' };
      return { name: 'admin-users' };
    default:
      return { name: 'dashboard' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'documents': {
      const base = route.repositoryId ? `#/documents/${route.repositoryId}` : '#/documents';
      return route.folderId ? `${base}?folder=${encodeURIComponent(route.folderId)}` : base;
    }
    case 'search':
      return route.q ? `#/search?q=${encodeURIComponent(route.q)}` : '#/search';
    case 'tasks':
      return route.taskId ? `#/tasks/${encodeURIComponent(route.taskId)}` : '#/tasks';
    case 'messages':
      return route.conversationId ? `#/messages/${encodeURIComponent(route.conversationId)}` : '#/messages';
    case 'admin-messages':
      return '#/admin/messages';
    case 'admin-users':
      return '#/admin/users';
    case 'admin-departments':
      return '#/admin/departments';
    case 'admin-roles':
      return '#/admin/roles';
    case 'admin-repositories': {
      const params = new URLSearchParams();
      if (route.repositoryId) params.set('id', route.repositoryId);
      if (route.tab) params.set('tab', route.tab);
      const query = params.toString();
      return query ? `#/admin/repositories?${query}` : '#/admin/repositories';
    }
    case 'admin-connectors':
      return '#/admin/storage';
    case 'admin-audit':
      return '#/admin/audit';
    default:
      return '#/';
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  if (options.replace) {
    window.location.replace(href(route));
  } else {
    window.location.hash = href(route);
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
