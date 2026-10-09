import { createSupabaseAdminClient } from './supabase/admin';
import { buildAuthConfirmationUrl, parsePortalEmailOtpType } from './auth-flow';
import { administratorInvitationDestination } from './administrator-invitations';
import { sendAdministratorInvitation } from './administrator-invitation-email';

export type PendingAdministratorInvitation = { id: string; full_name: string; email: string; auth_user_id: string | null };
/** No generated credential is returned, persisted, or logged. */
export async function deliverAdministratorInvitation(invitation: PendingAdministratorInvitation, actorId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  let delivered = false;
  try {
    // Resends retain the bound identity; they never recreate or convert a client.
    if (invitation.auth_user_id) {
      const { data, error } = await admin.auth.admin.getUserById(invitation.auth_user_id);
      if (error || data.user?.email?.toLowerCase() !== invitation.email) return false;
    }
    const { data, error } = await admin.auth.admin.generateLink(invitation.auth_user_id
      ? { type: 'magiclink', email: invitation.email }
      : { type: 'invite', email: invitation.email, options: { data: { full_name: invitation.full_name, administrator_invitation: invitation.id } } });
    const type = parsePortalEmailOtpType(data?.properties?.verification_type ?? null);
    if (error || !type || !data?.properties?.hashed_token || !data.user
      || (invitation.auth_user_id && invitation.auth_user_id !== data.user.id)) return false;
    const { error: bindError } = await admin.rpc('bind_administrator_invitation', {
      invitation_id: invitation.id, target_user_id: data.user.id, actor_id: actorId,
    });
    if (bindError) return false;
    const actionLink = buildAuthConfirmationUrl({ tokenHash: data.properties.hashed_token, type, role: 'admin', next: administratorInvitationDestination(invitation.id) });
    delivered = await sendAdministratorInvitation(invitation.email, invitation.full_name, actionLink, invitation.id);
    return delivered;
  } catch { return false; }
  finally {
    try { await admin.rpc('record_administrator_invitation_delivery', { invitation_id: invitation.id, delivered }); } catch { /* Safe retry from the invitation list. */ }
  }
}
