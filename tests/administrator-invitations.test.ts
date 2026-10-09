import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
const mocks = vi.hoisted(() => ({
  role: 'admin' as string | null, rpc: vi.fn(), from: vi.fn(), deliver: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  requireApiRole: async () => mocks.role === 'admin' ? { id: 'admin-a', role: 'admin' } : null,
  requireRole: async () => { if (mocks.role !== 'admin') throw new Error('Access denied'); return { id: 'admin-a', role: 'admin' }; },
}));
vi.mock('@/lib/env', () => ({ isDemoMode: () => false, hasEmailEnv: () => true, hasServiceRoleEnv: () => true }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/administrator-invitation-service', () => ({ deliverAdministratorInvitation: mocks.deliver }));
import { GET, POST } from '@/app/api/admin/administrators/route';
import { POST as action } from '@/app/api/admin/administrators/[invitationId]/route';
import Page from '@/app/admin/settings/admins/page';
const id = '10000000-0000-4000-8000-000000000001';
const request = (body: unknown, origin = 'http://127.0.0.1:3000') => new Request('http://127.0.0.1:3000/api/admin/administrators', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ invitationId: id }) };
beforeEach(() => {
  vi.clearAllMocks(); mocks.role = 'admin';
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:3000');
  mocks.rpc.mockResolvedValue({ data: { id, full_name: 'New Admin', email: 'new@example.test', auth_user_id: null }, error: null });
  mocks.deliver.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());
describe('equal administrator management', () => {
  it('allows an existing admin to render the page with no role/permission selector', async () => {
    const html = renderToString(await Page());
    expect(html).toContain('Administrators'); expect(html).toContain('Full Name'); expect(html).toContain('Email Address');
    expect(html).not.toContain('<select'); expect(html).not.toContain('Super Admin');
  });
  it.each(['client', null])('denies page/list/invitation actions to %s', async role => {
    mocks.role = role;
    await expect(Page()).rejects.toThrow('Access denied');
    expect((await GET()).status).toBe(403);
    expect((await POST(request({ fullName: 'New Admin', email: 'new@example.test' }))).status).toBe(403);
    expect((await action(request({ action: 'revoke' }), params)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('normalizes and reserves before delivery, exposing no link in the response', async () => {
    const response = await POST(request({ fullName: ' New Admin ', email: ' NEW@example.test ' }));
    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('prepare_administrator_invitation', { full_name_input: 'New Admin', email_input: 'new@example.test' });
    expect(mocks.deliver).toHaveBeenCalledWith(expect.objectContaining({ id }), 'admin-a');
    expect(await response.json()).toEqual({ message: 'Administrator invitation sent.' });
  });
  it('lists active administrators and pending invitations with safe attribution', async () => {
    mocks.from.mockImplementation((table: string) => {
      const result = { data: table === 'users' ? [{ id: 'admin-a', full_name: 'Admin A', email: 'a@example.test', created_at: '2026-10-01' }] : [{ id, full_name: 'Admin B', email: 'b@example.test', status: 'pending', created_at: '2026-10-09', expires_at: '2099-01-01', invited_by: 'admin-a', delivery_status: 'sent' }], error: null };
      const builder = { select: () => builder, eq: () => builder, order: () => builder, limit: () => builder, then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve(result)) };
      return builder;
    });
    const response = await GET();
    const result = await response.json();
    expect(result.administrators[0]).toMatchObject({ status: 'Active', fullName: 'Admin A' });
    expect(result.invitations[0]).toMatchObject({ status: 'Pending', invitedBy: 'Admin A' });
    expect(result.available).toBe(true);
  });
  it('rejects caller-supplied role and foreign-origin submissions', async () => {
    expect((await POST(request({ fullName: 'New Admin', email: 'new@example.test', role: 'admin' }))).status).toBe(400);
    expect((await POST(request({ fullName: 'New Admin', email: 'new@example.test' }, 'https://external.test'))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(['existing client', 'existing administrator', 'duplicate pending invitation'])('does not generate email for %s conflicts', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23505' } });
    expect((await POST(request({ fullName: 'New Admin', email: 'new@example.test' }))).status).toBe(409);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('does not generate email before the migration is installed', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    expect((await POST(request({ fullName: 'New Admin', email: 'new@example.test' }))).status).toBe(503);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('revokes through the user-session RPC, not a direct table write', async () => {
    expect((await action(request({ action: 'revoke' }), params)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('revoke_administrator_invitation', { invitation_id: id });
  });
  it('rejects deletion/demotion actions on active admins', async () => {
    expect((await action(request({ action: 'delete' }), params)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('resends using a new reserved generation and the original bound identity', async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: 'New Admin', email: 'new@example.test' }, error: null }) }) }) });
    expect((await action(request({ action: 'resend' }), params)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('prepare_administrator_invitation', { full_name_input: 'New Admin', email_input: 'new@example.test', previous_id: id });
  });
});
