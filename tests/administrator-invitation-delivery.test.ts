import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generateLink: vi.fn(), getUserById: vi.fn(), rpc: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ auth: { admin: { generateLink: mocks.generateLink, getUserById: mocks.getUserById } }, rpc: mocks.rpc }) }));
vi.mock('@/lib/administrator-invitation-email', () => ({ sendAdministratorInvitation: mocks.send }));
import { deliverAdministratorInvitation } from '@/lib/administrator-invitation-service';
const invitation = { id: '10000000-0000-4000-8000-000000000001', email: 'new@example.test', full_name: 'New Admin', auth_user_id: null as string | null };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.leadsedge.us');
  mocks.generateLink.mockResolvedValue({ data: { user: { id: 'new-user' }, properties: { verification_type: 'invite', hashed_token: 'a'.repeat(56), action_link: 'https://must-not-use.invalid' } }, error: null });
  mocks.rpc.mockResolvedValue({ error: null }); mocks.send.mockResolvedValue(true);
  mocks.getUserById.mockResolvedValue({ data: { user: { email: invitation.email } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe('administrator email delivery', () => {
  it('uses the actual TokenHash type and administrator destination after binding, without role metadata', async () => {
    expect(await deliverAdministratorInvitation(invitation, 'admin-a')).toBe(true);
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: 'invite', email: invitation.email, options: { data: { full_name: invitation.full_name, administrator_invitation: invitation.id } } });
    expect(mocks.rpc.mock.calls[0]).toEqual(['bind_administrator_invitation', { invitation_id: invitation.id, target_user_id: 'new-user', actor_id: 'admin-a' }]);
    const link = new URL(mocks.send.mock.calls[0][2]);
    expect(link.origin).toBe('https://portal.leadsedge.us'); expect(link.pathname).toBe('/auth/confirm');
    expect(link.searchParams.get('type')).toBe('invite'); expect(link.searchParams.get('next')).toBe(`/admin?admin_invitation=${invitation.id}`);
    expect(link.searchParams.has('code')).toBe(false);
  });
  it('retains the bound account on resend and uses the returned magiclink verification type', async () => {
    mocks.generateLink.mockResolvedValue({ data: { user: { id: 'new-user' }, properties: { verification_type: 'magiclink', hashed_token: 'b'.repeat(56) } }, error: null });
    expect(await deliverAdministratorInvitation({ ...invitation, auth_user_id: 'new-user' }, 'admin-a')).toBe(true);
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: invitation.email });
    expect(new URL(mocks.send.mock.calls[0][2]).searchParams.get('type')).toBe('magiclink');
  });
  it('does not send after an identity binding conflict', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '42501' } });
    expect(await deliverAdministratorInvitation(invitation, 'admin-a')).toBe(false); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not leak provider exceptions', async () => {
    mocks.generateLink.mockRejectedValue(new Error('provider-private-detail'));
    const log = vi.spyOn(console, 'error');
    expect(await deliverAdministratorInvitation(invitation, 'admin-a')).toBe(false); expect(log).not.toHaveBeenCalled(); log.mockRestore();
  });
});
