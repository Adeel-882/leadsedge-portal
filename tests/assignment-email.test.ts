import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, send: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendBrandedEmail: state.send }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ from: (table: string) => {
  const filters: Array<(r: Record<string, unknown>) => boolean> = [];
  let update: Record<string, unknown> | undefined, insert: Record<string, unknown> | undefined, single = false;
  const query = {
    select: () => query, order: () => query, limit: () => query,
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return query; },
    neq: (k: string, v: unknown) => { filters.push(r => r[k] !== v); return query; },
    is: (k: string, v: unknown) => { filters.push(r => r[k] === v); return query; },
    in: (k: string, v: unknown[]) => { filters.push(r => v.includes(r[k])); return query; },
    lt: (k: string, v: number) => { filters.push(r => Number(r[k]) < v); return query; },
    lte: () => query,
    maybeSingle: () => { single = true; return query; },
    update: (v: Record<string, unknown>) => { update = v; return query; },
    upsert: (v: Record<string, unknown>) => { insert = v; return query; },
    then: (resolve: (v: unknown) => unknown) => {
      const rows = state.tables[table] || [];
      let found = rows.filter(r => filters.every(f => f(r)));
      if (insert) {
        if (rows.some(r => r.dedupe_key === insert!.dedupe_key)) found = [];
        else { const row = { id: 'outbox-1', status: 'pending', attempts: 0, created_at: new Date().toISOString(), ...insert }; rows.push(row); found = [row]; }
      }
      if (update) found.forEach(r => Object.assign(r, update));
      return Promise.resolve({ data: single ? found[0] || null : found.map(r => ({ ...r })), error: null }).then(resolve);
    },
  };
  return query;
} }) }));
import { assignmentEmailLink, queueAssignmentEmails, deliverAssignmentEmails } from '@/lib/assignment-email';
beforeEach(() => {
  vi.clearAllMocks(); process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000';
  state.send.mockResolvedValue({ ok: true, id: 'provider-id' });
  state.tables = {
    project_tasks: [{ id: 'task-1', project_id: 'project-1', title: 'Lead Assignment', assignee_id: 'client-1', status: 'active', requires_completion: true, client_visible: true, archived_at: null, template: { template: { name: 'Lead Assignment' } } }],
    clients: [{ id: 'client-1', auth_user_id: 'user-1', email: 'client@example.com', full_name: 'Client', status: 'active' }],
    users: [{ id: 'user-1', role: 'client', email: 'client@example.com' }], project_clients: [{ project_id: 'project-1', client_id: 'client-1' }], email_outbox: [], notifications: [],
  };
});
it('queues and delivers an imported lead only once across saves and concurrent delivery attempts', async () => {
  const ids = await queueAssignmentEmails(['task-1']);
  await queueAssignmentEmails(['task-1']);
  expect(state.tables.email_outbox).toHaveLength(1);
  expect(state.tables.notifications).toHaveLength(1);
  await Promise.all([deliverAssignmentEmails(ids), deliverAssignmentEmails(ids)]);
  expect(state.send).toHaveBeenCalledTimes(1);
  expect(state.send.mock.calls[0][0]).toMatchObject({ to: 'client@example.com', actionLabel: 'View Lead', idempotencyKey: 'assignment/outbox-1' });
  expect(state.tables.email_outbox[0].status).toBe('sent');
});
it.each([{ status: 'completed' }, { status: 'draft' }, { client_visible: false }, { requires_completion: false }, { archived_at: '2026-01-01' }, { template: null }, { template: { template: { name: 'Other workflow' } } }])('does not email unavailable or non-Lead-Assignment tasks: %j', async patch => {
  Object.assign(state.tables.project_tasks[0], patch);
  expect(await queueAssignmentEmails(['task-1'])).toEqual([]);
  expect(state.send).not.toHaveBeenCalled();
});
it('requires membership and an enabled linked client profile', async () => {
  state.tables.project_clients = [];
  expect(await queueAssignmentEmails(['task-1'])).toEqual([]);
  state.tables.project_clients = [{ project_id: 'project-1', client_id: 'client-1' }];
  state.tables.clients[0].status = 'disabled';
  expect(await queueAssignmentEmails(['task-1'])).toEqual([]);
});
it('cancels stale assignment mail rather than emailing the former assignee', async () => {
  const ids = await queueAssignmentEmails(['task-1']);
  state.tables.project_tasks[0].assignee_id = 'foreign-client';
  await deliverAssignmentEmails(ids);
  expect(state.send).not.toHaveBeenCalled();
  expect(state.tables.email_outbox[0].status).toBe('cancelled');
});
it('contains provider failure, stores safe metadata and retries with the same key', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const ids = await queueAssignmentEmails(['task-1']);
  state.send.mockRejectedValueOnce(new Error('secret provider diagnostic'));
  expect(await deliverAssignmentEmails(ids)).toEqual({ sentEmails: 0, failedEmails: 1 });
  expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  expect(state.tables.email_outbox[0].status).toBe('failed');
  await deliverAssignmentEmails(ids);
  expect(state.send.mock.calls[0][0]).toEqual(state.send.mock.calls[1][0]);
  warn.mockRestore();
});
it('uses a reusable task destination without any authentication credentials', () => {
  const url = new URL(assignmentEmailLink('task-1'));
  expect(url.origin).toBe('http://127.0.0.1:3000');
  expect(url.pathname).toBe('/portal/tasks/task-1');
  expect(url.search).toBe('');
});
it('generates the permanent HTTPS task URL even with the old production host configured', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://khaki-crocodile-610570.hostingersite.com';
  expect(assignmentEmailLink('task-1')).toBe('https://portal.leadsedge.us/portal/tasks/task-1');
});
