import { FormEvent, useCallback, useEffect, useState } from 'react';

type MeUser = {
  id: string;
  login: string;
  displayName: string;
  permissions: string[];
};

type Repository = {
  id: string;
  name: string;
  type: string;
  capabilities: { upload: boolean; physicalWrite: boolean };
};

type Folder = {
  id: string;
  name: string;
  relativePath: string;
};

type DocumentRow = {
  id: string;
  displayName: string;
  currentVersion?: { id: string; mimeType: string; sequence: number };
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init });
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as { detail?: string; title?: string };
    throw new Error(problem.detail ?? problem.title ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function App(): React.ReactElement {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<MeUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [newRepoName, setNewRepoName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<Array<{ documentId: string; displayName: string; snippet: string }>>(
    [],
  );

  const refreshRepositories = useCallback(async () => {
    const rows = await api<Repository[]>('/api/v1/repositories');
    setRepositories(rows);
    if (!selectedRepoId && rows[0]) {
      setSelectedRepoId(rows[0].id);
    }
  }, [selectedRepoId]);

  const refreshDocuments = useCallback(async () => {
    if (!selectedRepoId) {
      return;
    }
    const [folderRows, documentRows] = await Promise.all([
      api<Folder[]>(`/api/v1/repositories/${selectedRepoId}/folders`),
      api<DocumentRow[]>(`/api/v1/repositories/${selectedRepoId}/documents`),
    ]);
    setFolders(folderRows);
    setDocuments(documentRows);
  }, [selectedRepoId]);

  useEffect(() => {
    void api<MeUser>('/api/v1/auth/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    void refreshRepositories().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to load repositories.');
    });
  }, [user, refreshRepositories]);

  useEffect(() => {
    if (!user || !selectedRepoId) {
      return;
    }
    void refreshDocuments().catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to load documents.');
    });
  }, [user, selectedRepoId, refreshDocuments]);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = await api<{ user: MeUser }>('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      setUser(body.user);
      setPassword('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  async function onLogout(): Promise<void> {
    await api<void>('/api/v1/auth/logout', { method: 'POST' });
    setUser(null);
  }

  async function createRepository(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!newRepoName.trim()) {
      return;
    }
    await api('/api/v1/repositories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRepoName.trim(),
        rootRelativePath: newRepoName.trim().toLowerCase().replace(/\s+/g, '-'),
      }),
    });
    setNewRepoName('');
    await refreshRepositories();
  }

  async function createFolder(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedRepoId || !newFolderName.trim()) {
      return;
    }
    await api(`/api/v1/repositories/${selectedRepoId}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim() }),
    });
    setNewFolderName('');
    await refreshDocuments();
  }

  async function onUpload(file: File | null): Promise<void> {
    if (!file || !selectedRepoId) {
      return;
    }
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`/api/v1/repositories/${selectedRepoId}/documents/upload`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!response.ok) {
      throw new Error('Upload failed.');
    }
    await refreshDocuments();
  }

  async function runSearch(event: FormEvent): Promise<void> {
    event.preventDefault();
    const hits = await api<{ items: Array<{ documentId: string; displayName: string; snippet: string }> }>(
      `/api/v1/search?q=${encodeURIComponent(searchQuery)}&repositoryId=${encodeURIComponent(selectedRepoId)}`,
    );
    setSearchHits(hits.items);
  }

  if (!user) {
    return (
      <main className="shell">
        <header>
          <h1>IntanDMS V2</h1>
          <p>Local sign-in</p>
        </header>
        <form className="panel" onSubmit={(event) => void onSubmit(event)}>
          <label>
            Login
            <input value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="shell wide">
      <header className="row">
        <div>
          <h1>IntanDMS V2</h1>
          <p>
            {user.displayName} ({user.login})
          </p>
        </div>
        <button type="button" onClick={() => void onLogout()}>
          Log out
        </button>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <h2>Repositories</h2>
        <div className="row">
          <select value={selectedRepoId} onChange={(event) => setSelectedRepoId(event.target.value)}>
            {repositories.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name} ({repo.type})
              </option>
            ))}
          </select>
        </div>
        <form className="row" onSubmit={(event) => void createRepository(event)}>
          <input
            placeholder="New managed repository name"
            value={newRepoName}
            onChange={(event) => setNewRepoName(event.target.value)}
          />
          <button type="submit">Create</button>
        </form>
      </section>

      <section className="panel">
        <h2>Explorer</h2>
        <form className="row" onSubmit={(event) => void createFolder(event)}>
          <input
            placeholder="New folder"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
          />
          <button type="submit">Add folder</button>
        </form>
        <ul>
          {folders.map((folder) => (
            <li key={folder.id}>{folder.relativePath}</li>
          ))}
        </ul>
        <label className="upload">
          Upload file
          <input
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void onUpload(file).catch((uploadError: unknown) => {
                setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
              });
            }}
          />
        </label>
        <ul>
          {documents.map((doc) => (
            <li key={doc.id}>
              {doc.displayName}{' '}
              <a href={`/api/v1/documents/${doc.id}/download`} target="_blank" rel="noreferrer">
                Download
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Search</h2>
        <form className="row" onSubmit={(event) => void runSearch(event)}>
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Query" />
          <button type="submit">Search</button>
        </form>
        <ul>
          {searchHits.map((hit) => (
            <li key={hit.documentId}>
              <strong>{hit.displayName}</strong>
              <div className="muted">{hit.snippet}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
