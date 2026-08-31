import { describe, expect, it } from 'vitest';
import { buildAuthConfirmationUrl, buildPortalConfirmationUrl, classifyOtpError, destinationForRole, parsePortalEmailOtpType, safeInternalPath } from '@/lib/auth-flow';

describe('server-compatible invitation links', () => {
  it('builds a TokenHash confirmation URL without fragment tokens', () => {
    const url = new URL(buildPortalConfirmationUrl({ tokenHash: 'a'.repeat(64), type: 'invite', origin: 'http://localhost:3000' }));
    expect(url.pathname).toBe('/auth/confirm');
    expect(url.searchParams.get('token_hash')).toBe('a'.repeat(64));
    expect(url.searchParams.get('type')).toBe('invite');
    expect(url.searchParams.get('next')).toBe('/portal');
    expect(url.hash).toBe('');
  });

  it('builds resend links with the magiclink OTP type and portal-only redirect', () => {
    const url = new URL(buildPortalConfirmationUrl({ tokenHash: 'b'.repeat(64), type: 'magiclink', next: '/admin', origin: 'http://localhost:3000' }));
    expect(url.toString()).toBe(`http://localhost:3000/auth/confirm?token_hash=${'b'.repeat(64)}&type=magiclink&next=%2Fportal`);
    expect(url.hash).toBe('');
  });

  it('builds a server-confirmed administrator fallback link without crossing roles', () => {
    const url = new URL(buildAuthConfirmationUrl({ tokenHash: 'c'.repeat(64), type: 'magiclink', role: 'admin', next: '/portal', origin: 'http://localhost:3000' }));
    expect(url.pathname).toBe('/auth/confirm');
    expect(url.searchParams.get('type')).toBe('magiclink');
    expect(url.searchParams.get('next')).toBe('/admin');
    expect(url.hash).toBe('');
  });

  it('accepts only supported portal email OTP types', () => {
    expect(parsePortalEmailOtpType('invite')).toBe('invite');
    expect(parsePortalEmailOtpType('magiclink')).toBe('magiclink');
    expect(parsePortalEmailOtpType('recovery')).toBeNull();
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
    expect(classifyOtpError({ code: 'bad_code_verifier', message: 'Invalid token' })).toBe('invalid');
  });
});
