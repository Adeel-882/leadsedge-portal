import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientInvitationStatus, type ClientInvitationAttempt } from '@/lib/client-invitation-status';
const mocks = vi.hoisted(() => ({ send: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendPortalInvitation: mocks.send }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
import { invitationFingerprint, sendTrackedClientInvitation, recordClientInvitationSignIn, clientInvitationExpirySeconds } from '@/lib/client-invitation-tracking';
const token = 'b'.repeat(56);
const sent: ClientInvitationAttempt = { id: 'attempt', created_at: '2026-11-19T10:00:00Z', expires_at: '2026-11-20T10:00:00Z', sent_at: '2026-11-19T10:00:01Z', signed_in_at: null, delivery_status: 'sent', email_delivery_id: 'delivery' };
const input = () => ({ admin: { rpc: mocks.rpc } as unknown as SupabaseClient, clientId: 'client', projectId: 'project', authUserId: 'user', tokenHash: token, type: 'invite' as const, issuedAt: sent.created_at, to: 'synthetic@example.test', clientName: 'Synthetic Client', projectName: 'Synthetic Project' });
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: 'attempt-id', error: null }); mocks.send.mockResolvedValue({ ok: true, id: 'provider-id' }); });
afterEach(() => vi.unstubAllEnvs());
describe('deterministic invitation status', () => {
  it('awaits verified use, not email open or delivery', () => expect(clientInvitationStatus(sent, Date.parse(sent.created_at))).toBe('awaiting'));
  it('expires at the expected boundary', () => expect(clientInvitationStatus(sent, Date.parse(sent.expires_at))).toBe('expired'));
  it('never expires an already successful attempt', () => expect(clientInvitationStatus({ ...sent, signed_in_at: sent.sent_at }, Date.parse(sent.expires_at) + 1000)).toBe('signed_in'));
  it('distinguishes rejected delivery and ambiguous delivery from expiry', () => {
    expect(clientInvitationStatus({ ...sent, delivery_status: 'failed' }, Infinity)).toBe('failed');
    expect(clientInvitationStatus({ ...sent, delivery_status: 'pending' }, Infinity)).toBe('unavailable');
  });
  it('does not transfer an earlier invitation success to a resend', () => {
    const old = { ...sent, signed_in_at: sent.sent_at };
    expect(clientInvitationStatus(old, Infinity)).toBe('signed_in');
    expect(clientInvitationStatus({ ...sent, id: 'new' }, Date.parse(sent.created_at))).toBe('awaiting');
  });
});
describe('trusted invitation delivery and correlation', () => {
  it('uses a one-way, type-separated fingerprint and persists before sending', async () => {
    expect(invitationFingerprint(token, 'invite')).toMatch(/^[a-f0-9]{64}$/);
    expect(invitationFingerprint(token, 'invite')).not.toBe(invitationFingerprint(token, 'magiclink'));
    await sendTrackedClientInvitation(input());
    expect(mocks.rpc.mock.calls[0][0]).toBe('prepare_client_invitation_attempt');
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(token);
    const link = new URL(mocks.send.mock.calls[0][0].actionLink);
    expect(link.pathname).toBe('/auth/confirm');
    expect(link.searchParams.get('token_hash')).toBe(token);
    expect(link.searchParams.has('invitation_id')).toBe(false);
    expect(mocks.rpc.mock.calls[1]).toEqual(['finish_client_invitation_delivery', { attempt_id_input: 'attempt-id', accepted_input: true, provider_id_input: 'provider-id' }]);
  });
  it('preserves the resend magiclink credential type', async () => {
    await sendTrackedClientInvitation({ ...input(), type: 'magiclink' });
    expect(new URL(mocks.send.mock.calls[0][0].actionLink).searchParams.get('type')).toBe('magiclink');
  });
  it('does not send when persistence is unavailable', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: 'missing-migration' } });
    expect((await sendTrackedClientInvitation(input())).ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('records provider rejection without successful delivery', async () => {
    mocks.send.mockResolvedValue({ ok: false, error: 'Rejected' });
    expect((await sendTrackedClientInvitation(input())).ok).toBe(false);
    expect(mocks.rpc.mock.calls[1][1].accepted_input).toBe(false);
  });
  it('keeps ambiguous transport failures pending and never retries the email', async () => {
    mocks.send.mockRejectedValue(new Error('transport'));
    expect((await sendTrackedClientInvitation(input())).ok).toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('reports a delivery-history save failure without retrying', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'attempt-id' }).mockResolvedValueOnce({ error: {} });
    expect((await sendTrackedClientInvitation(input())).ok).toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('records only a fingerprint and verified user, never a browser timestamp or ID', async () => {
    await recordClientInvitationSignIn('verified-user', token, 'invite');
    expect(mocks.rpc).toHaveBeenCalledWith('record_client_invitation_sign_in', { fingerprint_input: invitationFingerprint(token, 'invite'), auth_user_id_input: 'verified-user' });
  });
  it('does not turn a tracking outage into a login failure or expose credentials', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.rpc.mockRejectedValue(new Error(token));
    await expect(recordClientInvitationSignIn('verified-user', token, 'invite')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[client-invitation] sign_in_record_unavailable');
    warn.mockRestore();
  });
  it('validates the configured lifetime', () => {
    vi.stubEnv('LEADSEDGE_CLIENT_INVITATION_EXPIRY_SECONDS', '86400'); expect(clientInvitationExpirySeconds()).toBe(86400);
    vi.stubEnv('LEADSEDGE_CLIENT_INVITATION_EXPIRY_SECONDS', '-1'); expect(() => clientInvitationExpirySeconds()).toThrow();
  });
});
