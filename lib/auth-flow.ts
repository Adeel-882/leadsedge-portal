import { appUrl } from './env';
import type { Role } from './types';

export type PortalEmailOtpType = 'invite' | 'magiclink';
export type AuthErrorReason = 'expired' | 'invalid' | 'unauthorized' | 'configuration';

export function parsePortalEmailOtpType(value: string | null): PortalEmailOtpType | null {
  return value === 'invite' || value === 'magiclink' ? value : null;
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

export function classifyOtpError(error: { code?: string; message?: string } | null): AuthErrorReason {
  const code = error?.code?.toLowerCase() || '';
  const message = error?.message?.toLowerCase() || '';
  return code.includes('expired') || message.includes('expired') || message.includes('already been used')
    ? 'expired'
    : 'invalid';
}
