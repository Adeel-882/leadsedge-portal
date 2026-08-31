import type { Role } from './types';

type ClientStatus = 'invited' | 'active' | 'disabled' | null;

export function normalizeSignInEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isMagicLinkEligible({ role, clientStatus, hasProject }: { role: Role | null; clientStatus: ClientStatus; hasProject: boolean }) {
  if (role === 'admin') return true;
  return role === 'client' && (clientStatus === 'invited' || clientStatus === 'active') && hasProject;
}

export function isSupabaseEmailRateLimit(error: { code?: string; status?: number } | null) {
  return error?.code === 'over_email_send_rate_limit' || error?.status === 429;
}

export function shouldUseBrandedEmailFallback(error: { code?: string; status?: number } | null) {
  return isSupabaseEmailRateLimit(error) || error?.code === 'email_address_invalid';
}
