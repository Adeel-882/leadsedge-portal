import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ viewer: vi.fn(), task: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireApiRole: mocks.viewer }));
vi.mock('@/lib/env', () => ({ isDemoMode: () => false }));
vi.mock('@/lib/client-access', () => ({ getAuthorizedClientTask: mocks.task }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
import { POST } from '@/app/api/portal/tasks/[taskId]/submit/route';
const post = (body: unknown) => POST(new Request('http://127.0.0.1:3000/api/portal/tasks/task/submit', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ taskId: 'task' }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer.mockResolvedValue({ id: 'client', role: 'client' });
  mocks.task.mockResolvedValue({ id: 'task', formSchema: [{ id: 'note', type: 'text', label: 'Note', required: true }] });
  mocks.rpc.mockResolvedValue({ data: 'submission', error: null });
});
describe('feedback submission boundary', () => {
  it('sends a normal valid form exactly once', async () => {
    expect((await post({ answers: { note: 'Normal feedback' } })).status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('submit_lead_feedback', { target_task_id: 'task', submitted_answers: { note: 'Normal feedback' } });
  });
  it('returns 413 before task lookup or RPC for excessive bytes', async () => {
    expect((await post({ answers: { note: 'x'.repeat(524288) } })).status).toBe(413);
    expect(mocks.task).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns 400 for unknown task-form keys without consuming feedback', async () => {
    expect((await post({ answers: { note: 'ok', unexpected: 'x' } })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('denies foreign/hidden tasks before form validation/RPC', async () => {
    mocks.task.mockResolvedValue(null);
    expect((await post({ answers: { note: 'ok' } })).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('denies unavailable/disabled viewers', async () => {
    mocks.viewer.mockResolvedValue(null);
    expect((await post({ answers: { note: 'ok' } })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
