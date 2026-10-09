import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthErrorReason } from './auth-flow';
import type { Role } from './types';
import { administratorInvitationId } from './administrator-invitations';

export type SessionCompletion =
  | { ok: true; role: Role }
  | { ok: false; reason: AuthErrorReason; stage: string; code: string };

/**
 * Turns a freshly verified Supabase session into an authorized portal session.
 *
 * Both email entry points (the TokenHash confirmation POST and the PKCE
 * callback) end here so admin and client sign-ins are authorized identically.
 * Every read runs through the user's own session, so RLS — not this function —
 * remains the authorization boundary; the checks below exist to fail closed
 * with a useful reason instead of dropping a half-authorized viewer into a
 * shell that will bounce them.
 */
export async function completeAuthenticatedSession(supabase: SupabaseClient, userId: string, requestedNext?: string | null): Promise<SessionCompletion> {
  const invitationId = administratorInvitationId(requestedNext);
  if (invitationId) {
    // Only this explicitly addressed invitation can activate this verified user.
    // Ordinary login/client invitation paths make no additional RPC call.
    const { data, error } = await supabase.rpc('accept_administrator_invitation', { invitation_id: invitationId });
    if (error || data !== userId) {
      await supabase.auth.signOut({ scope: 'local' });
      return { ok: false, reason: 'unauthorized', stage: 'administrator_invitation', code: 'invitation_unavailable' };
    }
  }
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'client')) {
    await supabase.auth.signOut({ scope: 'local' });
    return { ok: false, reason: 'unauthorized', stage: 'authorization', code: 'invalid_profile' };
  }

  const role = profile.role as Role;
  if (role === 'admin') return { ok: true, role };

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (clientError || !client) {
    await supabase.auth.signOut({ scope: 'local' });
    return { ok: false, reason: 'unauthorized', stage: 'authorization', code: 'inactive_or_missing_client' };
  }

  // Activation must precede the membership read: project_clients RLS only
  // exposes rows to an *active* client, so an invited client checked first
  // would look membership-less and be rejected on their very first sign-in.
  const { error: activationError } = await supabase.rpc('activate_current_client');
  if (activationError) {
    await supabase.auth.signOut({ scope: 'local' });
    return { ok: false, reason: 'unauthorized', stage: 'authorization', code: 'client_activation_denied' };
  }

  // Also the disabled-client gate: RLS hides membership rows from any client
  // whose status is not 'active'.
  const { data: memberships, error: membershipError } = await supabase
    .from('project_clients')
    .select('project_id')
    .eq('client_id', client.id)
    .limit(1);

  if (membershipError || !memberships?.length) {
    await supabase.auth.signOut({ scope: 'local' });
    return { ok: false, reason: 'unauthorized', stage: 'authorization', code: 'missing_project_membership' };
  }

  return { ok: true, role };
}
