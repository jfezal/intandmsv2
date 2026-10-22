import { request as playwrightRequest, type APIRequestContext, type APIResponse } from '@playwright/test';

export type SessionUser = { id: string; login: string; displayName: string; permissions: string[] };

export class ApiSession {
  private constructor(
    readonly api: APIRequestContext,
    readonly user: SessionUser,
    private csrf: string,
  ) {}

  static credentials(): { admin: { login: string; password: string }; staff: { login: string; password: string } } | null {
    const adminLogin = process.env.E2E_ADMIN_LOGIN ?? 'admin';
    const adminPassword = process.env.E2E_ADMIN_PASSWORD;
    const staffLogin = process.env.E2E_STAFF_LOGIN ?? 'pegawai1';
    const staffPassword = process.env.E2E_STAFF_PASSWORD;
    if (!adminPassword || !staffPassword) return null;
    return {
      admin: { login: adminLogin, password: adminPassword },
      staff: { login: staffLogin, password: staffPassword },
    };
  }

  static async login(baseURL: string, login: string, password: string): Promise<ApiSession> {
    const api = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
    const csrfResponse = await api.get('/api/v1/auth/csrf');
    if (!csrfResponse.ok()) {
      throw new Error(`CSRF issue failed (${csrfResponse.status()})`);
    }
    const csrf = ((await csrfResponse.json()) as { token: string }).token;
    const loginResponse = await api.post('/api/v1/auth/login', {
      headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      data: { login, password },
    });
    if (!loginResponse.ok()) {
      const problem = (await loginResponse.json().catch(() => ({}))) as { detail?: string; title?: string };
      await api.dispose();
      throw new Error(problem.detail ?? problem.title ?? `Login failed for ${login} (${loginResponse.status()})`);
    }
    const body = (await loginResponse.json()) as { user: SessionUser };
    return new ApiSession(api, body.user, csrf);
  }

  async close(): Promise<void> {
    await this.api.dispose();
  }

  async send(method: string, path: string, body?: unknown): Promise<APIResponse> {
    const headers: Record<string, string> = {};
    if (method !== 'GET' && method !== 'HEAD') {
      headers['X-CSRF-Token'] = this.csrf;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
    }
    return this.api.fetch(path, { method, headers, ...(body !== undefined ? { data: body } : {}) });
  }

  async json<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const response = await this.send(method, path, body);
    const parsed = (await response.json().catch(() => ({}))) as T;
    return { status: response.status(), body: parsed };
  }
}

export async function apiIsReachable(baseURL: string): Promise<boolean> {
  const probe = await playwrightRequest.newContext({ baseURL });
  try {
    const health = await probe.get('/api/v1/health');
    return health.ok();
  } catch {
    return false;
  } finally {
    await probe.dispose();
  }
}
