import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  viewer: { id: 'client-auth-user', role: 'client', fullName: 'Client', email: '', avatarUrl: null } as { id: string; role: string; fullName: string; email: string; avatarUrl: null } | null,
  tables: {} as Record<string, Row[]>,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  rpc: vi.fn(),
  projectGate: undefined as Promise<void> | undefined,
  started: [] as string[],
}));

vi.mock('@/lib/env', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/env')>(),
  isDemoMode: () => false,
}));

vi.mock('@/lib/auth', () => ({
  getViewer: async () => mocks.viewer,
  requireApiRole: async () => mocks.viewer,
}));

/**
 * A chainable query stub that resolves to the fixture rows for its table at any
 * point in the chain, so it does not matter which builder method the production
 * code happens to await on.
 */
function builder(table: string) {
  const chain: Record<string, unknown> = {
    then(resolve: (value: { data: Row[]; error: null }) => unknown) {
      mocks.started.push(table);
      return Promise.resolve(table === 'projects' ? mocks.projectGate : undefined).then(() => ({ data: mocks.tables[table] || [], error: null })).then(resolve);
    },
  };
  for (const method of ['select', 'eq', 'neq', 'is', 'in', 'order', 'limit', 'not', 'lt', 'maybeSingle', 'single']) {
    chain[method] = (...args: unknown[]) => {
      mocks.calls.push({ table, method, args });
      return chain;
    };
  }
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ from: (table: string) => builder(table), rpc: mocks.rpc }),
}));

import { getClientConversationThreads, getClientTaskList } from '@/lib/queries';

const P1 = 'project-one';
const P2 = 'project-two';
const P3 = 'project-three';
const T1 = 'task-one';
const T2 = 'task-two';
const T3 = 'task-quiet';

function project(id: string, name: string, createdAt: string, isPrimary: boolean) {
  return {
    id,
    project_name: name,
    status: 'active',
    created_at: createdAt,
    owner: { full_name: 'Admin', admin_settings: null },
    project_clients: [{ is_primary: isPrimary, client: { id: 'client-record', full_name: 'Client', auth_user_id: 'client-auth-user', status: 'active' } }],
    project_tasks: [],
  };
}

function task(id: string, projectId: string, title: string) {
  return { id, project_id: projectId, title, status: 'active', feedback_state: 'not_configured', feedback_submitted_at: null, project: { project_name: title } };
}

function projectReceipt(projectId: string, messageType = 'user') {
  return { project_message: { project_id: projectId, message_type: messageType }, task_message: null };
}

function taskReceipt(taskId: string, messageType = 'user') {
  return { project_message: null, task_message: { task_id: taskId, message_type: messageType } };
}

function repeat<T>(count: number, make: () => T) {
  return Array.from({ length: count }, make);
}

describe('client conversation threads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls = [];
    mocks.started = [];
    mocks.projectGate = undefined;
    mocks.viewer = { id: 'client-auth-user', role: 'client', fullName: 'Client', email: '', avatarUrl: null };
    mocks.tables = {
      // Deliberately unordered, and P2 is the primary membership rather than the
      // oldest or the newest, so ordering cannot pass by accident.
      projects: [
        project(P3, 'Project Three', '2026-01-03T00:00:00Z', false),
        project(P1, 'Project One', '2026-01-01T00:00:00Z', false),
        project(P2, 'Project Two', '2026-01-02T00:00:00Z', true),
      ],
      project_tasks: [task(T1, P1, 'Lead One'), task(T2, P2, 'Lead Two'), task(T3, P3, 'Quiet Lead')],
      message_read_receipts: [
        ...repeat(20, () => projectReceipt(P1)),
        ...repeat(60, () => taskReceipt(T1)),
        // Must be ignored: hidden by row level security, and a system message.
        { project_message: null, task_message: null },
        projectReceipt(P2, 'system'),
        taskReceipt(T2, 'system'),
      ],
      project_messages: [
        { project_id: P1, body: 'Latest in project one', created_at: '2026-05-01T10:00:00Z' },
        { project_id: P1, body: 'Older in project one', created_at: '2026-04-01T10:00:00Z' },
        { project_id: P2, body: 'Latest in project two', created_at: '2026-03-01T10:00:00Z' },
      ],
      task_messages: [
        { task_id: T1, body: 'Latest lead comment', created_at: '2026-06-01T10:00:00Z' },
        { task_id: T2, body: 'A quieter lead comment', created_at: '2026-02-01T10:00:00Z' },
      ],
    };
  });

  it('lists every project the client belongs to, primary first then oldest', async () => {
    const threads = await getClientConversationThreads();
    const projectThreads = threads.filter((thread) => thread.kind === 'project');

    expect(projectThreads.map((thread) => thread.id)).toEqual([P2, P1, P3]);
  });

  it('starts receipt and activity reads before project discovery finishes', async () => {
    let release!: () => void;
    mocks.projectGate = new Promise<void>(resolve => { release = resolve; });
    const pending = getClientConversationThreads();
    try {
      await vi.waitFor(() => expect(mocks.started).toEqual(expect.arrayContaining(['projects', 'project_tasks', 'message_read_receipts', 'project_messages', 'task_messages'])));
    } finally { release(); }
    expect((await pending).length).toBeGreaterThan(0);
    expect(mocks.calls).toContainEqual({ table: 'task_messages', method: 'eq', args: ['task.assignee.auth_user_id', 'client-auth-user'] });
    expect(mocks.calls).toContainEqual({ table: 'project_messages', method: 'eq', args: ['project.project_clients.client.auth_user_id', 'client-auth-user'] });
  });

  it('counts unread project messages per project', async () => {
    const threads = await getClientConversationThreads();
    const byId = Object.fromEntries(threads.map((thread) => [`${thread.kind}:${thread.id}`, thread]));

    expect(byId[`project:${P1}`].unreadCount).toBe(20);
    expect(byId[`project:${P2}`].unreadCount).toBe(0);
    expect(byId[`project:${P3}`].unreadCount).toBe(0);
  });

  it('preserves task-list data and inner authorization filters without returning identity columns', async () => {
    const tasks = await getClientTaskList();
    expect(tasks.map(task => task.id)).toEqual([T1, T2, T3]);
    const projection = mocks.calls.find(call => call.table === 'project_tasks' && call.method === 'select')?.args[0];
    expect(projection).toContain('assignee:clients!inner()');
    expect(mocks.calls).toContainEqual({table:'project_tasks',method:'eq',args:['assignee.auth_user_id','client-auth-user']});
    expect(mocks.calls).toContainEqual({table:'project_tasks',method:'neq',args:['assignee.status','disabled']});
  });

  it('counts unread task comments per task', async () => {
    const threads = await getClientConversationThreads();
    const byId = Object.fromEntries(threads.map((thread) => [`${thread.kind}:${thread.id}`, thread]));

    expect(byId[`task:${T1}`].unreadCount).toBe(60);
    expect(byId[`task:${T2}`].unreadCount).toBe(0);
  });

  it('accounts for the whole global badge, so nothing it counts is unreachable', async () => {
    const threads = await getClientConversationThreads();
    const total = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);

    // 20 unread project messages + 60 unread task comments, exactly what
    // get_unread_message_count() returns for this fixture.
    expect(total).toBe(80);
  });

  it('ignores receipts hidden by row level security and non-user messages', async () => {
    const threads = await getClientConversationThreads();
    const byId = Object.fromEntries(threads.map((thread) => [`${thread.kind}:${thread.id}`, thread]));

    // Three extra receipts exist in the fixture; none may reach a thread count.
    expect(byId[`project:${P2}`].unreadCount).toBe(0);
    expect(byId[`task:${T2}`].unreadCount).toBe(0);
    expect(threads.reduce((sum, thread) => sum + thread.unreadCount, 0)).toBe(80);
  });

  it('renders a project with no messages as a selectable thread', async () => {
    const threads = await getClientConversationThreads();
    const quiet = threads.find((thread) => thread.kind === 'project' && thread.id === P3);

    expect(quiet).toBeDefined();
    expect(quiet!.unreadCount).toBe(0);
    expect(quiet!.lastMessageAt).toBeNull();
    expect(quiet!.lastMessagePreview).toBeNull();
  });

  it('shows the latest message and time per thread', async () => {
    const threads = await getClientConversationThreads();
    const byId = Object.fromEntries(threads.map((thread) => [`${thread.kind}:${thread.id}`, thread]));

    expect(byId[`project:${P1}`].lastMessagePreview).toBe('Latest in project one');
    expect(byId[`project:${P1}`].lastMessageAt).toBe('2026-05-01T10:00:00Z');
    expect(byId[`task:${T1}`].lastMessagePreview).toBe('Latest lead comment');
  });

  it('gives every task thread its title and owning project', async () => {
    const threads = await getClientConversationThreads();
    const lead = threads.find((thread) => thread.kind === 'task' && thread.id === T1);

    expect(lead!.title).toBe('Lead One');
    expect(lead!.projectId).toBe(P1);
    expect(lead!.projectName).toBe('Project One');
  });

  it('omits leads that have neither messages nor unread comments', async () => {
    const threads = await getClientConversationThreads();

    expect(threads.some((thread) => thread.kind === 'task' && thread.id === T3)).toBe(false);
  });

  it('orders lead threads by unread first, then most recent activity', async () => {
    const threads = await getClientConversationThreads();
    const taskThreads = threads.filter((thread) => thread.kind === 'task');

    expect(taskThreads.map((thread) => thread.id)).toEqual([T1, T2]);
  });

  it('scopes both project and task reads to the authenticated client', async () => {
    await getClientConversationThreads();
    const args = JSON.stringify(mocks.calls);

    expect(args).toContain('project_clients.client.auth_user_id');
    expect(args).toContain('assignee.auth_user_id');
    expect(mocks.calls.some((call) => call.table === 'message_read_receipts' && call.method === 'is' && call.args[0] === 'read_at')).toBe(true);
  });

  it('returns nothing for a viewer who is not a client', async () => {
    mocks.viewer = { id: 'admin-user', role: 'admin', fullName: 'Admin', email: '', avatarUrl: null };

    expect(await getClientConversationThreads()).toEqual([]);
  });

  it('returns nothing when the client has no projects', async () => {
    mocks.tables.projects = [];

    expect(await getClientConversationThreads()).toEqual([]);
  });

  it('leaves a single-project client with exactly one thread', async () => {
    mocks.tables.projects = [project(P1, 'Project One', '2026-01-01T00:00:00Z', true)];
    mocks.tables.project_tasks = [];
    mocks.tables.task_messages = [];
    mocks.tables.message_read_receipts = [];

    const threads = await getClientConversationThreads();

    expect(threads).toHaveLength(1);
    expect(threads[0].kind).toBe('project');
  });
});
