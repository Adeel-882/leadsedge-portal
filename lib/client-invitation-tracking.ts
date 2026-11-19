import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPortalConfirmationUrl, type PortalEmailOtpType } from './auth-flow';
import { sendPortalInvitation } from './email';
import { createSupabaseAdminClient } from './supabase/admin';

// This digest cannot be passed to verifyOtp and is never included in a URL.
export function invitationFingerprint(tokenHash: string, type: PortalEmailOtpType) {
  return createHash('sha256').update(`leadsedge-client-invitation:v1:${type}:${tokenHash}`).digest('hex');
}

export function clientInvitationExpirySeconds() {
  // Frankfurt mailer_otp_exp verified read-only on 2026-11-19. Persist per attempt.
  const seconds = Number(process.env.LEADSEDGE_CLIENT_INVITATION_EXPIRY_SECONDS || '86400');
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 604800) throw new Error('Invalid invitation expiry configuration.');
  return seconds;
}

type SendInput = {
  admin: SupabaseClient; clientId: string; projectId: string; authUserId: string;
  tokenHash: string; type: 'invite' | 'magiclink'; issuedAt: string;
  to: string; clientName: string; projectName: string;
};

export async function sendTrackedClientInvitation(input: SendInput) {
  const { admin } = input;
  let attemptId: string;
  try {
    const { data, error } = await admin.rpc('prepare_client_invitation_attempt', {
      client_id_input: input.clientId, project_id_input: input.projectId, auth_user_id_input: input.authUserId,
      fingerprint_input: invitationFingerprint(input.tokenHash, input.type), credential_type_input: input.type,
      issued_at_input: input.issuedAt, expiry_seconds_input: clientInvitationExpirySeconds(),
    });
    if (error || typeof data !== 'string') throw new Error('Unavailable');
    attemptId = data;
  } catch {
    return { ok: false as const, error: 'Invitation tracking is unavailable. No email was sent. Please retry after configuration is restored.' };
  }
  let delivery: Awaited<ReturnType<typeof sendPortalInvitation>>;
  try {
    delivery = await sendPortalInvitation({ to: input.to, clientName: input.clientName, projectName: input.projectName,
      actionLink: buildPortalConfirmationUrl({ tokenHash: input.tokenHash, type: input.type }) });
  } catch {
    // A transport failure is ambiguous: never claim failed delivery or retry automatically.
    return { ok: false as const, error: 'Invitation delivery could not be confirmed. Check email history before retrying.' };
  }
  try {
    const { error: historyError } = await admin.rpc('finish_client_invitation_delivery', {
      attempt_id_input: attemptId, accepted_input: delivery.ok, provider_id_input: delivery.ok ? delivery.id : null,
    });
    if (historyError) throw new Error('Unavailable');
  } catch {
    return { ok: false as const, error: 'Invitation delivery status could not be saved. Check email history before retrying.' };
  }
  return delivery.ok ? delivery : { ok: false as const, error: 'Invitation could not be sent. Please try again.' };
}

/** Called only by the verified TokenHash POST, after completeAuthenticatedSession. */
export async function recordClientInvitationSignIn(userId: string, tokenHash: string, type: PortalEmailOtpType) {
  try {
    const admin = createSupabaseAdminClient();
    if (!admin) throw new Error('Unavailable');
    const { error } = await admin.rpc('record_client_invitation_sign_in', {
      fingerprint_input: invitationFingerprint(tokenHash, type), auth_user_id_input: userId,
    });
    if (error) throw new Error('Unavailable');
  } catch {
    // Tracking must never break an otherwise valid login. No credential/error payloads.
    console.warn('[client-invitation] sign_in_record_unavailable');
  }
}
