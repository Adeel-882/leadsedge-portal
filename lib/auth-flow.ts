import { appUrl } from './env';
import type { Role } from './types';

export type PortalEmailOtpType = 'email' | 'invite' | 'magiclink';
export type AuthErrorReason = 'expired' | 'invalid' | 'unauthorized' | 'configuration' | 'different_device';

/**
 * Supabase hashes email OTP tokens (SHA-224, so 56 lowercase hex characters on
 * the GoTrue release behind the current project) and prefixes PKCE-flow tokens
 * with `pkce_`. Match that family rather than one release's digest length:
 * Supabase alone decides whether a token is real, so pinning the length buys no
 * security and turns any provider-side change into an unexplained
 * `/auth/error?reason=invalid`.
 */
const supabaseEmailTokenHashPattern = /^(?:pkce_)?[0-9a-f]{32,128}$/i;

/** PKCE authorization code Supabase appends to `emailRedirectTo` after /auth/v1/verify. */
const supabaseAuthorizationCodePattern = /^[A-Za-z0-9._~-]{16,512}$/;

export function parsePortalEmailOtpType(value: string | null): PortalEmailOtpType | null {
  return value === 'email' || value === 'invite' || value === 'magiclink' ? value : null;
}

export function isSupabaseEmailTokenHash(value: string) {
  return supabaseEmailTokenHashPattern.test(value);
}

export function isSupabaseAuthorizationCode(value: string) {
  return supabaseAuthorizationCodePattern.test(value);
}

/** Shape-only description of a credential, safe to log. Never includes the value. */
export function describeCredential(value: string) {
  return { length: value.length, pkcePrefixed: value.startsWith('pkce_') };
}

export function safeInternalPath(value: string | null, fallback: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded)) return fallback;
    const parsed = new URL(value, 'https://leadsedge.invalid');
    if (parsed.origin !== 'https://leadsedge.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function destinationForRole(role: Role, requestedNext: string | null) {
  const fallback = role === 'admin' ? '/admin' : '/portal';
  const safe = safeInternalPath(requestedNext, fallback);
  const allowedPrefix = role === 'admin' ? '/admin' : '/portal';
  return safe === allowedPrefix || safe.startsWith(`${allowedPrefix}/`) || safe.startsWith(`${allowedPrefix}?`) ? safe : fallback;
}

export function buildPortalConfirmationUrl({ tokenHash, type, next = '/portal', origin = appUrl() }: { tokenHash: string; type: PortalEmailOtpType; next?: string; origin?: string }) {
  return buildAuthConfirmationUrl({ tokenHash, type, role: 'client', next, origin });
}

export function buildAuthConfirmationUrl({ tokenHash, type, role, next, origin = appUrl() }: { tokenHash: string; type: PortalEmailOtpType; role: Role; next: string; origin?: string }) {
  const url = new URL('/auth/confirm', origin);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  url.searchParams.set('next', destinationForRole(role, next));
  return url.toString();
}

export function classifyOtpError(error: { code?: string | null; message?: string | null; name?: string | null } | null): AuthErrorReason {
  const code = error?.code?.toLowerCase() || '';
  const name = error?.name?.toLowerCase() || '';
  const message = error?.message?.toLowerCase() || '';
  // A PKCE link only completes in the browser that requested it, because the
  // code verifier lives in that browser's cookies. Opening the email on a
  // different device is the single most common way a genuinely valid link
  // fails, and it needs its own instruction rather than a bare "invalid".
  if (code.includes('code_verifier') || name.includes('pkcecodeverifiermissing')) return 'different_device';
  return code.includes('expired') || message.includes('expired') || message.includes('already been used')
    ? 'expired'
    : 'invalid';
}
