export type ClientInvitationAttempt = {
  id: string;
  created_at: string;
  expires_at: string;
  delivery_status: 'pending' | 'sent' | 'failed';
  sent_at: string | null;
  signed_in_at: string | null;
  email_delivery_id: string | null;
};

export function clientInvitationStatus(attempt: ClientInvitationAttempt, now = Date.now()) {
  if (attempt.signed_in_at) return 'signed_in' as const;
  if (attempt.delivery_status === 'failed') return 'failed' as const;
  if (attempt.delivery_status !== 'sent') return 'unavailable' as const;
  if (Date.parse(attempt.expires_at) <= now) return 'expired' as const;
  return 'awaiting' as const;
}
