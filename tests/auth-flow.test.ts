import { describe, expect, it } from 'vitest';
import { buildAuthConfirmationUrl, buildPortalConfirmationUrl, classifyOtpError, destinationForRole, isSupabaseAuthorizationCode, isSupabaseEmailTokenHash, parsePortalEmailOtpType, safeInternalPath } from '@/lib/auth-flow';

describe('server-compatible invitation links', () => {
  it('builds a TokenHash confirmation URL without fragment tokens', () => {
    const url = new URL(buildPortalConfirmationUrl({ tokenHash: 'a'.repeat(56), type: 'invite', origin: 'http://localhost:3000' }));
    expect(url.pathname).toBe('/auth/confirm');
    expect(url.searchParams.get('token_hash')).toBe('a'.repeat(56));
    expect(url.searchParams.get('type')).toBe('invite');
    expect(url.searchParams.get('next')).toBe('/portal');
    expect(url.hash).toBe('');
  });

  it('builds resend links with the magiclink OTP type and portal-only redirect', () => {
    const url = new URL(buildPortalConfirmationUrl({ tokenHash: 'b'.repeat(56), type: 'magiclink', next: '/admin', origin: 'http://localhost:3000' }));
    expect(url.toString()).toBe(`http://localhost:3000/auth/confirm?token_hash=${'b'.repeat(56)}&type=magiclink&next=%2Fportal`);
    expect(url.hash).toBe('');
  });

  it('builds a server-confirmed administrator fallback link without crossing roles', () => {
    const url = new URL(buildAuthConfirmationUrl({ tokenHash: 'c'.repeat(56), type: 'magiclink', role: 'admin', next: '/portal', origin: 'http://localhost:3000' }));
    expect(url.pathname).toBe('/auth/confirm');
    expect(url.searchParams.get('type')).toBe('magiclink');
    expect(url.searchParams.get('next')).toBe('/admin');
    expect(url.hash).toBe('');
  });

  it('accepts only supported portal email OTP types', () => {
    expect(parsePortalEmailOtpType('email')).toBe('email');
    expect(parsePortalEmailOtpType('invite')).toBe('invite');
    expect(parsePortalEmailOtpType('magiclink')).toBe('magiclink');
    expect(parsePortalEmailOtpType('recovery')).toBeNull();
  });

  it('accepts the Supabase email TokenHash family rather than one digest length', () => {
    // Frankfurt currently emits SHA-224 (56 lowercase hex). PKCE-flow tokens
    // carry a pkce_ prefix. Supabase remains the authority on the token itself,
    // so this shape check only screens out obvious junk before a round trip.
    expect(isSupabaseEmailTokenHash('a'.repeat(56))).toBe(true);
    expect(isSupabaseEmailTokenHash('A1'.repeat(28))).toBe(true);
    expect(isSupabaseEmailTokenHash('pkce_' + 'a'.repeat(56))).toBe(true);
    expect(isSupabaseEmailTokenHash('a'.repeat(64))).toBe(true);
    expect(isSupabaseEmailTokenHash('g'.repeat(56))).toBe(false);
    expect(isSupabaseEmailTokenHash('a'.repeat(16))).toBe(false);
    expect(isSupabaseEmailTokenHash('not-a-supabase-token-hash')).toBe(false);
    expect(isSupabaseEmailTokenHash('')).toBe(false);
  });

  it('accepts Supabase PKCE authorization codes and rejects junk', () => {
    expect(isSupabaseAuthorizationCode('4f1e0a2b-8c3d-4e5f-9a0b-1c2d3e4f5a6b')).toBe(true);
    expect(isSupabaseAuthorizationCode('short')).toBe(false);
    expect(isSupabaseAuthorizationCode('has spaces in it and is long enough')).toBe(false);
    expect(isSupabaseAuthorizationCode('')).toBe(false);
  });

  it('rejects external, encoded, and cross-role redirects', () => {
    expect(safeInternalPath('//evil.example', '/portal')).toBe('/portal');
    expect(safeInternalPath('/%2F%2Fevil.example', '/portal')).toBe('/portal');
    expect(safeInternalPath('/\\evil.example', '/portal')).toBe('/portal');
    expect(destinationForRole('client', '/admin')).toBe('/portal');
    expect(destinationForRole('admin', '/portal')).toBe('/admin');
    expect(destinationForRole('client', '/portal/tasks?status=active')).toBe('/portal/tasks?status=active');
  });

  it('maps expired OTP responses to a useful error state', () => {
    expect(classifyOtpError({ code: 'otp_expired', message: 'Token has expired' })).toBe('expired');
    expect(classifyOtpError({ code: 'otp_disabled', message: 'Invalid token' })).toBe('invalid');
    // A valid link opened in the wrong browser has no code verifier to pair with.
    expect(classifyOtpError({ code: 'pkce_code_verifier_not_found', name: 'AuthPKCECodeVerifierMissingError', message: 'missing' })).toBe('different_device');
    expect(classifyOtpError({ code: 'bad_code_verifier', message: 'Invalid token' })).toBe('different_device');
  });
});
