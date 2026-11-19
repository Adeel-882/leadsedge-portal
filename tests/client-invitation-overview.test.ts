import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const mocks = vi.hoisted(() => ({ viewer: vi.fn(), server: vi.fn(), getUser: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getViewer: mocks.viewer }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.server }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ auth: { admin: { getUserById: mocks.getUser } } }) }));
import { getClientInvitationOverview, type InvitationOverview } from '@/lib/client-invitation-query';
import { ClientInvitationStatusView } from '@/components/admin/client-invitation-status';
const attempt = { id: 'attempt', created_at: '2026-11-19T10:00:00Z', expires_at: '2099-11-20T10:00:00Z', delivery_status: 'sent' as const, sent_at: '2026-11-19T10:00:01Z', signed_in_at: null, email_delivery_id: 'delivery' };
const overview: InvitationOverview = { attempt, legacy: null, unavailable: false, lastLogin: '2026-11-18T10:00:00Z' };
const render = (value: InvitationOverview) => renderToStaticMarkup(createElement(ClientInvitationStatusView, { overview: value }));
beforeEach(() => { vi.clearAllMocks(); mocks.viewer.mockResolvedValue({ role: 'admin' }); mocks.getUser.mockResolvedValue({ data: { user: { last_sign_in_at: overview.lastLogin } } }); });
it('distinguishes last login from the newest awaiting invitation', () => {
  const html=render(overview); expect(html).toContain('Awaiting Sign-In'); expect(html).toContain('Last Login (any link)'); expect(html).not.toContain('Signed In Successfully');
});
it('renders success after expected expiry and exposes exact semantic timestamps', () => {
  const html=render({ ...overview, attempt: { ...attempt, expires_at: '2020-01-01', signed_in_at: '2026-11-19T11:00:00Z' } });
  expect(html).toContain('Signed In Successfully'); expect(html).toContain('dateTime="2026-11-19T11:00:00Z"'); expect(html).not.toContain('Invitation Expired');
});
it('does not invent expiry or successful use for historical deliveries', () => {
  const html=render({ ...overview, attempt: null, legacy: { id: 'old', status: 'sent', created_at: attempt.created_at } });
  expect(html).toContain('Sign-In Not Tracked'); expect(html).not.toContain('Expected expiry:'); expect(html).not.toContain('Signed In Successfully');
});
it('does not label a later untracked send using an older tracked success', () => {
  const html=render({ ...overview, attempt: { ...attempt, signed_in_at: attempt.sent_at }, legacy: { id: 'other', status: 'sent', created_at: '2026-11-20T10:00:00Z' } });
  expect(html).toContain('Sign-In Not Tracked'); expect(html).not.toContain('Signed In Successfully');
});
it('shows explicit failure, expiry, loading-data failure and empty history', () => {
  expect(render({ ...overview, attempt: { ...attempt, delivery_status: 'failed' } })).toContain('Invitation Delivery Failed');
  expect(render({ ...overview, attempt: { ...attempt, expires_at: '2020-01-01' } })).toContain('Invitation Expired');
  expect(render({ ...overview, attempt: null, unavailable: true })).toContain('temporarily unavailable');
  expect(render({ ...overview, attempt: null })).toContain('No invitation history');
});
it.each([null, {role:'client'}])('prevents non-admin reads before any privileged query', async viewer => {
  mocks.viewer.mockResolvedValue(viewer);
  expect((await getClientInvitationOverview('project','client')).unavailable).toBe(true);
  expect(mocks.server).not.toHaveBeenCalled(); expect(mocks.getUser).not.toHaveBeenCalled();
});
it('refreshes request data and scopes queries to the intended client and project', async () => {
  const filters: unknown[]=[];
  let used=false;
  mocks.server.mockResolvedValue({ from: (table: string) => {
    const query = { select: vi.fn(() => query), eq: vi.fn((...v: unknown[]) => { filters.push(v); return query; }), order: vi.fn(() => query), limit: vi.fn(() => query), maybeSingle: async () => ({ data: table==='clients' ? { auth_user_id: 'client-auth' } : table==='email_deliveries' ? null : { ...attempt, signed_in_at: used ? attempt.sent_at : null }, error: null }) };
    return query;
  } });
  expect((await getClientInvitationOverview('project','client')).attempt?.signed_in_at).toBeNull();
  used=true;
  expect((await getClientInvitationOverview('project','client')).attempt?.signed_in_at).toBe(attempt.sent_at);
  expect(filters).toContainEqual(['project_id','project']); expect(filters).toContainEqual(['client_id','client']);
  expect(mocks.getUser).toHaveBeenCalledWith('client-auth');
});
it('contains database failures to status loading rather than the project overview', async () => {
  mocks.server.mockRejectedValue(new Error('unavailable'));
  expect((await getClientInvitationOverview('project','client')).unavailable).toBe(true);
});
