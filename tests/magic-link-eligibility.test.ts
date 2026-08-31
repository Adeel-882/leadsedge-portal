import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isMagicLinkEligible, isSupabaseEmailRateLimit, normalizeSignInEmail, shouldUseBrandedEmailFallback } from '@/lib/sign-in';

const route = readFileSync(new URL('../app/api/auth/magic-link/route.ts', import.meta.url), 'utf8');
const adminLayout = readFileSync(new URL('../app/admin/layout.tsx', import.meta.url), 'utf8');
const portalLayout = readFileSync(new URL('../app/portal/layout.tsx', import.meta.url), 'utf8');

describe('magic-link eligibility', () => {
  it('allows an existing administrator without requiring a client record', () => {
    expect(isMagicLinkEligible({ role: 'admin', clientStatus: null, hasProject: false })).toBe(true);
  });

  it('allows only linked invited or active clients', () => {
    expect(isMagicLinkEligible({ role: 'client', clientStatus: 'invited', hasProject: true })).toBe(true);
    expect(isMagicLinkEligible({ role: 'client', clientStatus: 'active', hasProject: true })).toBe(true);
    expect(isMagicLinkEligible({ role: 'client', clientStatus: 'active', hasProject: false })).toBe(false);
    expect(isMagicLinkEligible({ role: 'client', clientStatus: 'disabled', hasProject: true })).toBe(false);
  });

  it('rejects unknown profiles and normalizes email consistently', () => {
    expect(isMagicLinkEligible({ role: null, clientStatus: null, hasProject: false })).toBe(false);
    expect(normalizeSignInEmail('  AdeelAhmed@Broadigo.COM ')).toBe('adeelahmed@broadigo.com');
  });

  it('recognizes the provider rate limit that triggered the regression', () => {
    expect(isSupabaseEmailRateLimit({ code: 'over_email_send_rate_limit', status: 429 })).toBe(true);
    expect(isSupabaseEmailRateLimit({ code: 'otp_expired', status: 400 })).toBe(false);
  });

  it('uses the branded TokenHash fallback for the authorized Resend test address rejection', () => {
    expect(shouldUseBrandedEmailFallback({ code: 'email_address_invalid', status: 400 })).toBe(true);
    expect(shouldUseBrandedEmailFallback({ code: 'over_email_send_rate_limit', status: 429 })).toBe(true);
    expect(shouldUseBrandedEmailFallback({ code: 'otp_expired', status: 400 })).toBe(false);
  });

  it('checks application authorization before requesting an OTP and keeps the PKCE callback', () => {
    expect(route.indexOf(".from('users')")).toBeLessThan(route.indexOf('signInWithOtp'));
    expect(route).toContain('shouldCreateUser: false');
    expect(route).toContain('/auth/callback?next=');
    expect(route).toContain('getUserById(profile.id)');
    expect(route).toContain("type: 'magiclink'");
    expect(route).not.toContain('properties.action_link');
    expect(route).not.toContain('#access_token');
  });

  it('keeps admin and client route guards separated', () => {
    expect(adminLayout).toContain("requireRole('admin')");
    expect(portalLayout).toContain("requireRole('client')");
  });
});
