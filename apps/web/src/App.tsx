import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shell } from './components/Shell';
import { Alert, Button, Spinner } from './components/ui';
import { I18nContext, type Locale, type MessageKey, translate } from './i18n';
import {
  ApiError,
  api,
  ensureCsrf,
  setPasswordChangeRequiredHandler,
  type MeUser,
  type Repository,
  type WorkflowTask,
} from './lib/api';
import { useRoute } from './lib/route';
import { AuditPage, MessageInvestigationPage, RepositoriesPage, RolesPage, StoragePage, UsersPage } from './pages/AdminPages';
import { MessagesPage } from './pages/messages/MessagesPage';
import { useMessageEvents, useMessageStream } from './lib/messageStream';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExplorerPage } from './pages/explorer/ExplorerPage';
import { LoginPage } from './pages/LoginPage';
import { SearchPage } from './pages/SearchPage';
import { TasksPage } from './pages/TasksPage';

type SessionState = { kind: 'checking' } | { kind: 'anonymous'; notice?: string } | { kind: 'offline' } | { kind: 'signed-in'; user: MeUser };

function initialLocale(): Locale {
  const stored = localStorage.getItem('intandms.locale');
  return stored === 'en' || stored === 'ms' ? stored : 'ms';
}

export function App(): React.ReactElement {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [session, setSession] = useState<SessionState>({ kind: 'checking' });
  const [repositories, setRepositories] = useState<Repository[] | null>(null);
  const [tasks, setTasks] = useState<WorkflowTask[] | null>(null);
  const route = useRoute();

  const i18n = useMemo(
    () => ({ locale, t: (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars) }),
    [locale],
  );

  useEffect(() => {
    localStorage.setItem('intandms.locale', locale);
    document.documentElement.lang = locale === 'ms' ? 'ms-MY' : 'en';
  }, [locale]);

  const checkSession = useCallback(async () => {
    setSession({ kind: 'checking' });
    try {
      await ensureCsrf();
      const user = await api<MeUser>('/api/v1/auth/me');
      setSession({ kind: 'signed-in', user });
    } catch (error) {
      const unauthenticated = error instanceof ApiError && (error.status === 401 || error.status === 403);
      setSession(unauthenticated ? { kind: 'anonymous' } : { kind: 'offline' });
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const signedIn = session.kind === 'signed-in' && !session.user.mustChangePassword;

  const handleAuthError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        setSession({ kind: 'anonymous', notice: i18n.t('sessionExpired') });
        setRepositories(null);
        setTasks(null);
      }
    },
    [i18n],
  );

  const loadRepositories = useCallback(async () => {
    try {
      setRepositories(await api<Repository[]>('/api/v1/repositories'));
    } catch (error) {
      handleAuthError(error);
      setRepositories([]);
    }
  }, [handleAuthError]);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api<WorkflowTask[]>('/api/v1/workflow/tasks/mine'));
    } catch (error) {
      handleAuthError(error);
      setTasks([]);
    }
  }, [handleAuthError]);

  const [unreadConversations, setUnreadConversations] = useState(0);
  const unreadTimer = useRef<number | undefined>(undefined);
  const loadUnread = useCallback(() => {
    window.clearTimeout(unreadTimer.current);
    unreadTimer.current = window.setTimeout(() => {
      api<{ unreadConversations: number }>('/api/v1/messages/unread')
        .then((summary) => setUnreadConversations(summary.unreadConversations))
        .catch(handleAuthError);
    }, 250);
  }, [handleAuthError]);

  useMessageStream(signedIn);
  useMessageEvents(() => {
    if (signedIn) loadUnread();
  });

  useEffect(() => {
    if (!signedIn) {
      setUnreadConversations(0);
      return;
    }
    void loadRepositories();
    void loadTasks();
    loadUnread();
  }, [signedIn, loadRepositories, loadTasks, loadUnread]);

  useEffect(() => {
    setPasswordChangeRequiredHandler(() =>
      setSession((current) =>
        current.kind === 'signed-in' ? { kind: 'signed-in', user: { ...current.user, mustChangePassword: true } } : current,
      ),
    );
    return () => setPasswordChangeRequiredHandler(null);
  }, []);

  async function login(loginName: string, password: string) {
    const body = await api<{ user: MeUser }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login: loginName, password }),
    });
    const user = await api<MeUser>('/api/v1/auth/me').catch(() => body.user);
    setSession({ kind: 'signed-in', user });
  }

  async function passwordChanged() {
    const user = await api<MeUser>('/api/v1/auth/me');
    setSession({ kind: 'signed-in', user });
  }

  async function logout() {
    await api<void>('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    setRepositories(null);
    setTasks(null);
    setSession({ kind: 'anonymous' });
  }

  let content: React.ReactNode;
  if (session.kind === 'checking') {
    content = (
      <div className="boot">
        <Spinner label={i18n.t('loading')} />
      </div>
    );
  } else if (session.kind === 'offline') {
    content = (
      <div className="boot">
        <Alert tone="danger" title={i18n.t('serverUnreachable')} action={<Button onClick={() => void checkSession()}>{i18n.t('retryAction')}</Button>} />
      </div>
    );
  } else if (session.kind === 'anonymous') {
    content = <LoginPage onLogin={login} locale={locale} onLocaleChange={setLocale} notice={session.notice} />;
  } else if (session.user.mustChangePassword) {
    content = (
      <ChangePasswordPage
        displayName={session.user.displayName}
        forced
        onDone={() => void passwordChanged()}
        onLogout={() => void logout()}
      />
    );
  } else {
    const { user } = session;
    let page: React.ReactNode;
    switch (route.name) {
      case 'documents':
        page = (
          <ExplorerPage
            user={user}
            repositories={repositories}
            repositoryId={route.repositoryId}
            folderId={route.folderId}
            onRepositoriesChanged={loadRepositories}
            onTasksChanged={() => void loadTasks()}
          />
        );
        break;
      case 'search':
        page = <SearchPage initialQuery={route.q} repositories={repositories} />;
        break;
      case 'tasks':
        page = <TasksPage tasks={tasks} taskId={route.taskId} onChanged={() => void loadTasks()} />;
        break;
      case 'messages':
        page = <MessagesPage user={user} conversationId={route.conversationId} />;
        break;
      case 'admin-messages':
        page = <MessageInvestigationPage />;
        break;
      case 'admin-users':
        page = <UsersPage currentUserId={user.id} />;
        break;
      case 'admin-roles':
        page = <RolesPage />;
        break;
      case 'admin-repositories':
        page = <RepositoriesPage onRepositoriesChanged={() => void loadRepositories()} />;
        break;
      case 'admin-connectors':
        page = <StoragePage />;
        break;
      case 'admin-audit':
        page = <AuditPage />;
        break;
      default:
        page = <DashboardPage user={user} repositories={repositories} tasks={tasks} />;
    }
    content = (
      <Shell
        user={user}
        route={route}
        locale={locale}
        onLocaleChange={setLocale}
        onLogout={() => void logout()}
        taskCount={tasks?.length ?? 0}
        unreadMessages={unreadConversations}
      >
        {page}
      </Shell>
    );
  }

  return <I18nContext.Provider value={i18n}>{content}</I18nContext.Provider>;
}
