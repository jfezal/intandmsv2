import { expect, test } from '@playwright/test';
import { ApiSession, apiIsReachable } from './helpers/session';

test.describe.configure({ mode: 'serial' });

const flowKey = `e2e_flow_${Date.now()}`;

let admin: ApiSession | undefined;
let staff: ApiSession | undefined;

test.beforeAll(async ({ baseURL }) => {
  test.skip(!(await apiIsReachable(baseURL!)), 'API is not running — start dev:api (and the web proxy) for this suite.');
  const accounts = ApiSession.credentials();
  test.skip(
    !accounts,
    'Set E2E_ADMIN_PASSWORD and E2E_STAFF_PASSWORD (optional E2E_ADMIN_LOGIN / E2E_STAFF_LOGIN) to run two-user tests.',
  );
  admin = await ApiSession.login(baseURL!, accounts!.admin.login, accounts!.admin.password);
  staff = await ApiSession.login(baseURL!, accounts!.staff.login, accounts!.staff.password);
});

test.afterAll(async () => {
  await admin?.close();
  await staff?.close();
});

test.describe('workflow flow control', () => {
  test('staff cannot manage review-flow templates', async () => {
    if (!staff) test.skip();
    const list = await staff.json('GET', '/api/v1/admin/workflows');
    expect(list.status).toBe(403);
    const create = await staff.json('POST', '/api/v1/admin/workflows', {
      key: 'forbidden_flow',
      name: 'Forbidden',
      definition: { steps: [{ key: 'review', name: 'Review', assignee: { type: 'user', userId: staff.user.id } }] },
    });
    expect(create.status).toBe(403);
  });

  test('admin starts a two-step named-user flow; staff approves each step', async () => {
    if (!admin || !staff) test.skip();
    const created = await admin.json<{ id: string }>('POST', '/api/v1/admin/workflows', {
      key: flowKey,
      name: `E2E ${flowKey}`,
      definition: {
        steps: [
          { key: 'review', name: 'Review', assignee: { type: 'user', userId: staff.user.id } },
          { key: 'approve', name: 'Approve', assignee: { type: 'user', userId: staff.user.id } },
        ],
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const definitionId = created.body.id;

    const leftover = await staff.json<WorkflowTask[]>('GET', '/api/v1/workflow/tasks/mine');
    if (leftover.status === 200) {
      for (const task of leftover.body) {
        await staff.json('POST', `/api/v1/workflow/tasks/${task.id}/decide`, { decision: 'reject' });
      }
    }

    const documentIds = await findVersionedDocumentsStaffCanRead(admin, staff);
    test.skip(documentIds.length === 0, 'No versioned document that staff can read.');
    const documentId = documentIds[0]!;

    const selfAsAdmin = await admin.json('POST', `/api/v1/workflow/documents/${documentId}/start-review`, {
      definitionId,
      assignees: { review: admin.user.id, approve: staff.user.id },
    });
    expect(selfAsAdmin.status).toBe(400);

    const selfAsStaff = await staff.json('POST', `/api/v1/workflow/documents/${documentId}/start-review`, {
      definitionId,
      assignees: { review: staff.user.id, approve: staff.user.id },
    });
    expect([400, 403, 404]).toContain(selfAsStaff.status);

    let started: { status: number; body: { id: string; tasks: Array<{ id: string }> } } | undefined;
    let usedDocumentId = documentId;
    for (const candidate of documentIds) {
      const attempt = await admin.json<{ id: string; tasks: Array<{ id: string }> }>(
        'POST',
        `/api/v1/workflow/documents/${candidate}/start-review`,
        { definitionId, assignees: { review: staff.user.id, approve: staff.user.id } },
      );
      if (attempt.status === 201) {
        started = attempt;
        usedDocumentId = candidate;
        break;
      }
    }
    expect(started?.status, JSON.stringify(started?.body)).toBe(201);
    const reviewDocumentId = usedDocumentId;

    const firstMine = await staff.json<WorkflowTask[]>('GET', '/api/v1/workflow/tasks/mine');
    expect(firstMine.status).toBe(200);
    const first = firstMine.body.find((item) => item.instance.documentId === reviewDocumentId);
    expect(first, 'staff must see the first review task').toBeTruthy();
    expect(first!.instance.stepIndex).toBe(0);
    expect(first!.instance.stepCount).toBe(2);
    expect(first!.instance.history).toEqual([]);

    const requesterDecide = await admin.json('POST', `/api/v1/workflow/tasks/${first!.id}/decide`, {
      decision: 'approve',
    });
    expect(requesterDecide.status).toBe(403);

    const approved = await staff.json('POST', `/api/v1/workflow/tasks/${first!.id}/decide`, {
      decision: 'approve',
    });
    expect(approved.status, JSON.stringify(approved.body)).toBe(201);

    const secondMine = await staff.json<WorkflowTask[]>('GET', '/api/v1/workflow/tasks/mine');
    expect(secondMine.status).toBe(200);
    const second = secondMine.body.find((item) => item.instance.documentId === reviewDocumentId);
    expect(second, 'staff must see the second step after approving the first').toBeTruthy();
    expect(second!.id).not.toBe(first!.id);
    expect(second!.instance.stepIndex).toBe(1);
    expect(second!.instance.stepCount).toBe(2);
    expect(second!.instance.history.map((row) => row.decision)).toEqual(['approve']);

    const finished = await staff.json('POST', `/api/v1/workflow/tasks/${second!.id}/decide`, {
      decision: 'approve',
    });
    expect(finished.status, JSON.stringify(finished.body)).toBe(201);

    const after = await staff.json<WorkflowTask[]>('GET', '/api/v1/workflow/tasks/mine');
    expect(after.status).toBe(200);
    expect(after.body.find((item) => item.instance.documentId === reviewDocumentId)).toBeUndefined();
  });
});

type WorkflowTask = {
  id: string;
  instance: {
    documentId: string;
    stepIndex: number;
    stepCount: number;
    history: Array<{ decision: string | null }>;
  };
};

async function findVersionedDocumentsStaffCanRead(
  adminSession: ApiSession,
  staffSession: ApiSession,
): Promise<string[]> {
  const found: string[] = [];
  const repos = await adminSession.json<Array<{ id: string }>>('GET', '/api/v1/repositories');
  if (repos.status !== 200) return found;
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
      const docs = await adminSession.json<Array<{ id: string; currentVersion?: { id: string } | null }>>(
        'GET',
        `/api/v1/repositories/${repo.id}/documents${documentQuery}`,
      );
      if (docs.status !== 200 || docs.body.length === 0) continue;
      const accessQuery = parentId ? `?folderId=${parentId}` : '';
      const access = await staffSession.json<{ read: boolean }>(
        'GET',
        `/api/v1/repositories/${repo.id}/access${accessQuery}`,
      );
      if (access.status !== 200 || access.body.read !== true) continue;
      for (const row of docs.body) {
        if (row.currentVersion) found.push(row.id);
      }
    }
  }
  return found;
}
