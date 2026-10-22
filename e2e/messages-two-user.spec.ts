import { expect, test, type Page } from '@playwright/test';
import { ApiSession, apiIsReachable } from './helpers/session';

type MessagePage = {
  items: Array<{
    id: string;
    body: string;
    sender: { login: string } | null;
    documents: Array<{ id: string | null; available: boolean; displayName?: string }>;
  }>;
};

test.describe.configure({ mode: 'serial' });

const marker = `e2e-msg-${Date.now()}`;
const groupTitle = `e2e-group-${Date.now()}`;

let admin: ApiSession | undefined;
let staff: ApiSession | undefined;
let directId: string | undefined;
let groupId: string | undefined;

test.beforeAll(async ({ baseURL }) => {
  test.skip(!(await apiIsReachable(baseURL!)), 'API is not running — start dev:api (and the web proxy) for this suite.');
  const accounts = ApiSession.credentials();
  test.skip(
    !accounts,
    'Set E2E_ADMIN_PASSWORD and E2E_STAFF_PASSWORD (optional E2E_ADMIN_LOGIN / E2E_STAFF_LOGIN) to run two-user tests.',
  );
  admin = await ApiSession.login(baseURL!, accounts!.admin.login, accounts!.admin.password);
  staff = await ApiSession.login(baseURL!, accounts!.staff.login, accounts!.staff.password);
  expect(admin.user.id).not.toBe(staff.user.id);
});

test.afterAll(async () => {
  await admin?.close();
  await staff?.close();
});

test.describe('two-user messaging (API)', () => {
  test('admin can send a direct message that the staff account receives', async () => {
    if (!admin || !staff) test.skip();
    const opened = await admin.json<{ id: string }>('POST', '/api/v1/messages/conversations/direct', { userId: staff.user.id });
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    directId = opened.body.id;

    const sent = await admin.json<{ id: string }>('POST', `/api/v1/messages/conversations/${directId}/messages`, {
      body: marker,
      documentIds: [],
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);

    const list = await staff.json<Array<{ id: string; unreadCount: number; lastMessage: { preview: string } | null }>>(
      'GET',
      '/api/v1/messages/conversations',
    );
    expect(list.status).toBe(200);
    const conversation = list.body.find((item) => item.id === directId);
    expect(conversation, 'staff must see the direct conversation').toBeTruthy();
    expect(conversation!.lastMessage?.preview).toContain(marker);
    expect(conversation!.unreadCount).toBeGreaterThan(0);

    const page = await staff.json<MessagePage>('GET', `/api/v1/messages/conversations/${directId}/messages`);
    expect(page.status).toBe(200);
    expect(page.body.items.some((item) => item.body === marker && item.sender?.login === admin.user.login)).toBe(true);
  });

  test('a non-member cannot read or send in a conversation (404, no leak)', async () => {
    if (!admin || !staff) test.skip();
    const created = await admin.json<{ id: string }>('POST', '/api/v1/messages/conversations/group', {
      title: groupTitle,
      memberIds: [staff.user.id],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    groupId = created.body.id;

    const memberRead = await staff.json('GET', `/api/v1/messages/conversations/${groupId}/messages`);
    expect(memberRead.status).toBe(200);

    const removed = await admin.json('DELETE', `/api/v1/messages/conversations/${groupId}/members/${staff.user.id}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);

    const outsiderRead = await staff.json<{ title?: string }>('GET', `/api/v1/messages/conversations/${groupId}/messages`);
    expect(outsiderRead.status).toBe(404);
    expect(JSON.stringify(outsiderRead.body)).not.toContain(groupTitle);

    const outsiderSend = await staff.json('POST', `/api/v1/messages/conversations/${groupId}/messages`, {
      body: 'should not land',
      documentIds: [],
    });
    expect(outsiderSend.status).toBe(404);
  });

  test('staff without messages.audit cannot investigate (403)', async () => {
    if (!admin || !staff || !directId) test.skip();
    expect(staff.user.permissions).not.toContain('messages.audit');
    const probe = await staff.json(
      'GET',
      `/api/v1/messages/investigation/users/${admin.user.id}/conversations?reason=e2e-access-review`,
    );
    expect(probe.status).toBe(403);

    const messages = await staff.json(
      'GET',
      `/api/v1/messages/investigation/conversations/${directId}/messages?reason=e2e-access-review`,
    );
    expect(messages.status).toBe(403);
  });

  test('staff is refused admin user listing (403)', async () => {
    if (!staff) test.skip();
    const users = await staff.json('GET', '/api/v1/admin/users');
    expect(users.status).toBe(403);
  });

  test('a document the staff cannot read is hidden when linked in chat', async () => {
    if (!admin || !staff || !directId) test.skip();
    const document = await findUnreadableDocument(admin, staff);
    test.skip(!document, 'No D-03 denial fixture: staff can already read every listed document.');

    const linked = await admin.json<{ id: string }>('POST', `/api/v1/messages/conversations/${directId}/messages`, {
      body: `${marker}-doc`,
      documentIds: [document.id],
    });
    expect(linked.status, JSON.stringify(linked.body)).toBe(201);

    const page = await staff.json<MessagePage>('GET', `/api/v1/messages/conversations/${directId}/messages`);
    expect(page.status).toBe(200);
    const row = page.body.items.find((item) => item.body === `${marker}-doc`);
    expect(row).toBeTruthy();
    expect(row!.documents[0]).toMatchObject({ id: null, available: false });
  });
});

async function findUnreadableDocument(adminSession: ApiSession, staffSession: ApiSession): Promise<{ id: string } | null> {
  const repos = await adminSession.json<Array<{ id: string }>>('GET', '/api/v1/repositories');
  if (repos.status !== 200) return null;
  for (const repo of repos.body) {
    const queue: Array<string | undefined> = [undefined];
    const seen = new Set<string>();
    while (queue.length && seen.size < 40) {
      const parentId = queue.shift();
      const folderQuery = parentId ? `?parentId=${parentId}` : '';
      const folders = await adminSession.json<Array<{ id: string }>>(
        'GET',
        `/api/v1/repositories/${repo.id}/folders${folderQuery}`,
      );
      if (folders.status === 200) {
        for (const folder of folders.body) {
          if (seen.has(folder.id)) continue;
          seen.add(folder.id);
          queue.push(folder.id);
        }
      }
      const documentQuery = parentId ? `?folderId=${parentId}` : '';
      const docs = await adminSession.json<Array<{ id: string }>>(
        'GET',
        `/api/v1/repositories/${repo.id}/documents${documentQuery}`,
      );
      if (docs.status !== 200 || docs.body.length === 0) continue;
      const accessQuery = parentId ? `?folderId=${parentId}` : '';
      const access = await staffSession.json<{ read: boolean }>(
        'GET',
        `/api/v1/repositories/${repo.id}/access${accessQuery}`,
      );
      if (access.status === 200 && access.body.read === false) {
        return docs.body[0];
      }
    }
  }
  return null;
}

async function signIn(page: Page, login: string, password: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.locator('#login')).toBeVisible();
  await page.locator('#login').fill(login);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

test.describe('two-user messaging (UI)', () => {
  test('staff cannot open message investigation or user admin', async ({ page, baseURL }) => {
    const accounts = ApiSession.credentials();
    test.skip(!(await apiIsReachable(baseURL!)) || !accounts, 'API or E2E credentials unavailable.');
    await signIn(page, accounts!.staff.login, accounts!.staff.password);
    await expect(page.getByRole('link', { name: 'Messages' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Message investigation' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
    await page.goto('/#/admin/messages');
    await expect(page.getByRole('link', { name: 'Message investigation' })).toHaveCount(0);
  });

  test('staff sees the direct message from the administrator', async ({ page, baseURL }) => {
    const accounts = ApiSession.credentials();
    test.skip(!(await apiIsReachable(baseURL!)) || !accounts || !directId, 'Prior API send did not run.');
    await signIn(page, accounts!.staff.login, accounts!.staff.password);
    await page.getByRole('link', { name: 'Messages' }).click();
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible();
    await page.getByText(marker, { exact: false }).first().click();
    await expect(page.locator('.chat-bubble').filter({ hasText: marker }).first()).toBeVisible();
  });
});
