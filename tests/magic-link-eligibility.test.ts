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

  it('uses the anonymous OTP flow without privileged pre-auth authorization', () => {
    expect(route).toContain('shouldCreateUser: false');
    expect(route).toContain('/auth/confirm?next=');
    expect(route).toContain('signInWithOtp');
    expect(route).toContain('hasPublicAuthEnv');
    expect(route).not.toContain('createSupabaseAdminClient');
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(route).not.toContain(".from('users')");
    expect(route).not.toContain('getUserById');
    expect(route).not.toContain('generateLink');
    expect(route).not.toContain('sendBrandedEmail');
    expect(route).not.toContain('properties.action_link');
    expect(route).not.toContain('#access_token');
  });

  it('does not expose account existence or provider errors', () => {
    expect(route).toContain('If this email is authorized, check your inbox for a sign-in link.');
    expect(route).toContain("console.warn('[auth] Magic-link request was not accepted by the provider.'");
    expect(route).not.toContain('otpError.message');
    expect(route).not.toContain('unauthorizedMessage');
  });

  it('keeps admin and client route guards separated', () => {
    expect(adminLayout).toContain("requireBootstrapRole('admin')");
    expect(portalLayout).toContain("requireBootstrapRole('client')");
  });
});
