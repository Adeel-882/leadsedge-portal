import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { completeAuthenticatedSession } from '@/lib/auth-session';
import { administratorInvitationDestination, administratorInvitationId } from '@/lib/administrator-invitations';
import { administratorInvitationEmail } from '@/lib/administrator-invitation-email';
const id = '10000000-0000-4000-8000-000000000001';
function client(error: unknown = null, role = 'admin') {
  const rpc = vi.fn(async () => ({ data: 'verified-user', error }));
  const signOut = vi.fn();
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role }, error: null }) }) }) }));
  return { rpc, signOut, from, supabase: { rpc, from, auth: { signOut } } as unknown as SupabaseClient };
}
describe('explicit verified administrator invitation acceptance', () => {
  it('accepts the addressed invitation after verification and resolves the existing admin role', async () => {
    const mock = client();
    expect(await completeAuthenticatedSession(mock.supabase, 'verified-user', administratorInvitationDestination(id))).toEqual({ ok: true, role: 'admin' });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('accept_administrator_invitation', { invitation_id: id });
  });
  it.each(['expired', 'revoked', 'wrong identity', 'replayed', 'client conflict'])('denies %s without leaving an authorized session', async code => {
    const mock = client({ code });
    expect(await completeAuthenticatedSession(mock.supabase, 'verified-user', administratorInvitationDestination(id))).toMatchObject({ ok: false, code: 'invitation_unavailable' });
    expect(mock.signOut).toHaveBeenCalledWith({ scope: 'local' }); expect(mock.from).not.toHaveBeenCalled();
  });
  it('leaves ordinary administrator login unchanged', async () => {
    const mock = client();
    expect(await completeAuthenticatedSession(mock.supabase, 'verified-user', '/admin')).toEqual({ ok: true, role: 'admin' });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('accepts only a precisely addressed internal invitation destination', () => {
    expect(administratorInvitationId(`https://outside.test/admin?admin_invitation=${id}`)).toBeNull();
    expect(administratorInvitationId('/portal?admin_invitation=' + id)).toBeNull();
    expect(administratorInvitationId('/admin?admin_invitation=bad')).toBeNull();
  });
  it('uses branded escaped email content with an explicit full-access disclosure', () => {
    const email = administratorInvitationEmail('<script>', 'https://portal.leadsedge.us/auth/confirm?example=1&other=2');
    expect(email.subject).toBe("You're invited to LeadsEdge Portal as an Administrator");
    expect(email.html).toContain('#FF4134'); expect(email.html).toContain('#070707');
    expect(email.html).toContain('full administrator access'); expect(email.html).toContain('Accept Invitation');
    expect(email.html).not.toContain('<script>'); expect(email.html).toContain('&lt;script&gt;');
  });
});
