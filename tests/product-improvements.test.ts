import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { countTaskAttention } from '@/lib/task-attention';
import type { ClientTaskSummary } from '@/lib/types';
const mocks = vi.hoisted(() => ({ send: vi.fn(), role: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('@/lib/auth', () => ({ requireApiRole: mocks.role }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
import { sendPortalInvitation, sendBrandedEmail } from '@/lib/email';
import { activityPage, activityPresentation, getProjectActivity } from '@/lib/project-activity';
const task = (status: ClientTaskSummary['status'], requiresCompletion = true) => ({ status, requiresCompletion } as ClientTaskSummary);
beforeEach(() => { vi.clearAllMocks(); process.env.RESEND_API_KEY = 'test'; process.env.RESEND_FROM_EMAIL = 'test@example.com'; mocks.send.mockResolvedValue({ data: { id: 'mail-id' }, error: null }); });
it('invites the full client name to the product and preserves the secure URL', async () => {
  const link = 'https://example.com/auth/confirm?token_hash=synthetic&type=magiclink&next=%2Fportal';
  await sendPortalInvitation({ to: 'zack@example.com', clientName: 'Zack Wilson', projectName: 'Zack', actionLink: link });
  const payload = mocks.send.mock.calls[0][0];
  expect(payload.to).toBe('zack@example.com');
  expect(payload.subject).toBe('Your LeadsEdge Portal invitation');
  expect(payload.html).toContain('Hi Zack Wilson, you’ve been invited to <strong>LeadsEdge Portal</strong>');
  expect(payload.html).not.toContain('<strong>Zack</strong>');
  expect(payload.html).toContain(link.replaceAll('&', '&amp;'));
  expect(payload.html).toContain('This link is private and expires automatically.');
});
it('passes the stable delivery key to the existing provider', async () => {
  await sendBrandedEmail({ to: 'x@example.com', subject: 'Assignment', heading: 'Lead', body: 'Details', actionLabel: 'View Lead', actionLink: 'https://example.com', idempotencyKey: 'assignment/123' });
  expect(mocks.send.mock.calls[0][1]).toEqual({ idempotencyKey: 'assignment/123' });
});
it('counts active work requiring completion, not drafts, completed work or informational tasks', () => {
  expect(countTaskAttention([task('active'), task('active'), task('active', false), task('completed'), task('draft')])).toBe(2);
  expect(countTaskAttention([task('active'), task('completed')])).toBe(1);
  expect(countTaskAttention([])).toBe(0);
});
it('renders Tasks attention in both navigation variants using the authorized task query', () => {
  const shell = readFileSync('components/portal/portal-shell.tsx', 'utf8');
  expect(shell.match(/tasks requiring action/g)).toHaveLength(2);
  const queries = readFileSync('lib/queries.ts', 'utf8').split('export async function getClientTaskList()')[1].split('export async function getAdminMessageInbox')[0];
  for (const guard of [".eq('assignee.auth_user_id', viewer.id)", ".neq('assignee.status', 'disabled')", ".is('archived_at', null)", ".eq('client_visible', true)", ".neq('status', 'draft')"]) expect(queries).toContain(guard);
});
it.each([
  ['task.comment', 'New task comment', 'Zack commented on Lead Assignment.'],
  ['lead.completed', 'Lead completed', 'Zack completed Lead Assignment.'],
  ['task.active', 'Task ready', 'Zack made Lead Assignment available.'],
  ['task.assigned', 'Task assigned', 'Zack updated the assignment for Lead Assignment.'],
  ['feedback.submitted', 'Feedback submitted', 'Zack submitted feedback for Lead Assignment.'],
])('formats supported %s with actor and task context', (event, title, description) => {
  expect(activityPresentation(event, 'event body', 'Zack', 'Lead Assignment')).toEqual({ title, description });
});
it('bounds newest-first activity and uses deterministic tie ordering and a cursor', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: String(i).padStart(2, '0'), title: 'Task', description: 'Detail', createdAt: '2026-10-01T10:00:00Z' }));
  const page = activityPage(items);
  expect(page.items).toHaveLength(20);
  expect(page.items[0].id).toBe('24');
  expect(page.next).toBe('2026-10-01T10:00:00Z|05');
  expect(activityPage([])).toEqual({ items: [], next: null });
});
it('rejects client access before reading admin activity', async () => {
  mocks.role.mockResolvedValue(null);
  await expect(getProjectActivity('foreign-project')).rejects.toThrow('Administrator access required');
});
