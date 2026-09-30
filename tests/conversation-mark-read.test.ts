import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  viewer: { id: 'client-auth-user', role: 'client', fullName: 'Client', email: '', avatarUrl: null } as { id: string; role: string; fullName: string; email: string; avatarUrl: null } | null,
  authorizedProjects: new Set<string>(),
  authorizedTasks: new Set<string>(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/env', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/env')>(),
  isDemoMode: () => false,
}));

vi.mock('@/lib/auth', () => ({ getViewer: async () => mocks.viewer }));

vi.mock('@/lib/client-access', () => ({
  getAuthorizedClientProject: async (_viewerId: string, projectId: string) => (mocks.authorizedProjects.has(projectId) ? { id: projectId } : null),
  getAuthorizedClientTask: async (_viewerId: string, taskId: string) => (mocks.authorizedTasks.has(taskId) ? { id: taskId } : null),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ rpc: mocks.rpc }),
}));

import { PATCH } from '@/app/api/messages/[kind]/[resourceId]/route';

const OWN_PROJECT = 'project-own';
const OTHER_PROJECT = 'project-foreign';
const OWN_TASK = 'task-own';
const OTHER_TASK = 'task-foreign';

function markRead(kind: string, resourceId: string) {
  return PATCH(new Request(`http://127.0.0.1:3000/api/messages/${kind}/${resourceId}`, { method: 'PATCH' }), {
    params: Promise.resolve({ kind, resourceId }),
  });
}

describe('marking one conversation read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer = { id: 'client-auth-user', role: 'client', fullName: 'Client', email: '', avatarUrl: null };
    mocks.authorizedProjects = new Set([OWN_PROJECT]);
    mocks.authorizedTasks = new Set([OWN_TASK]);
    mocks.rpc.mockResolvedValue({ data: [{ read_messages: 20, read_notifications: 2 }], error: null });
  });

  it('scopes the mark-read to exactly the project opened', async () => {
    const response = await markRead('project', OWN_PROJECT);

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('mark_conversation_read', { target_kind: 'project', target_resource_id: OWN_PROJECT });
    expect(await response.json()).toMatchObject({ ok: true, readMessages: 20 });
  });

  it('never touches another project while one project is open', async () => {
    mocks.authorizedProjects.add(OTHER_PROJECT);
    await markRead('project', OWN_PROJECT);

    const resources = mocks.rpc.mock.calls.map((call) => call[1].target_resource_id);
    expect(resources).toEqual([OWN_PROJECT]);
    expect(resources).not.toContain(OTHER_PROJECT);
  });

  it('scopes the mark-read to exactly the task opened', async () => {
    await markRead('task', OWN_TASK);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('mark_conversation_read', { target_kind: 'task', target_resource_id: OWN_TASK });
  });

  it('opening a task conversation does not clear project receipts', async () => {
    await markRead('task', OWN_TASK);

    expect(mocks.rpc.mock.calls.every((call) => call[1].target_kind === 'task')).toBe(true);
  });

  it('refuses a foreign project and never reaches the database', async () => {
    const response = await markRead('project', OTHER_PROJECT);

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses a foreign task and never reaches the database', async () => {
    const response = await markRead('task', OTHER_TASK);

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses an unknown conversation kind', async () => {
    const response = await markRead('everything', OWN_PROJECT);

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    mocks.viewer = null;
    const response = await markRead('project', OWN_PROJECT);

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reports the cleared count so the badge can be decremented', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ read_messages: 0, read_notifications: 0 }], error: null });
    const response = await markRead('project', OWN_PROJECT);

    expect(await response.json()).toMatchObject({ readMessages: 0, readNotifications: 0 });
  });
});
