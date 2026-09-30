import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appUrl: vi.fn(() => 'https://portal.example.test'),
  hasSupabaseEnv: vi.fn(() => true),
  hasPublicAuthEnv: vi.fn(() => true),
  isDemoMode: vi.fn(() => false),
  signInWithOtp: vi.fn(),
  createServerClient: vi.fn(),
  cookieAdapter: null as null | {
    getAll: () => Array<{ name: string; value: string }>;
    setAll: (cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>) => void;
  },
}));

vi.mock('@/lib/env', () => ({
  appUrl: mocks.appUrl,
  hasSupabaseEnv: mocks.hasSupabaseEnv,
  hasPublicAuthEnv: mocks.hasPublicAuthEnv,
  isDemoMode: mocks.isDemoMode,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}));

import { POST } from '@/app/api/auth/magic-link/route';

const genericBody = { message: 'If this email is authorized, check your inbox for a sign-in link.' };

function request(email = 'Admin.Frankfurt@Performance.Example.com', next = '/admin') {
  return new NextRequest('https://example.test/api/auth/magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, next }),
  });
}

describe('public magic-link request route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPublicAuthEnv.mockReturnValue(true);
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.isDemoMode.mockReturnValue(false);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.example.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'publishable-test-key';
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      mocks.cookieAdapter = options.cookies;
      return { auth: { signInWithOtp: mocks.signInWithOtp } };
    });
    mocks.signInWithOtp.mockImplementation(async () => {
      mocks.cookieAdapter?.setAll([{
        name: 'sdk-generated-pkce-fixture',
        value: 'verifier-fixture',
        options: { path: '/', sameSite: 'lax', httpOnly: true, secure: true, maxAge: 600 },
      }]);
      return { error: null };
    });
  });

  it('warns when the configured sign-in origin differs from the browsing origin', async () => {
    // localhost vs 127.0.0.1 is the classic version of this: the emailed link
    // returns to an origin that cannot see the cookies just issued here.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await POST(request());

    expect(JSON.stringify(warn.mock.calls)).toContain('Sign-in origin mismatch');
    expect(JSON.stringify(warn.mock.calls)).toContain('https://example.test');
    expect(JSON.stringify(warn.mock.calls)).toContain('https://portal.example.test');
    warn.mockRestore();
  });

  it('stays quiet when the configured origin matches the request origin', async () => {
    mocks.appUrl.mockReturnValue('https://example.test');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await POST(request());

    expect(JSON.stringify(warn.mock.calls)).not.toContain('Sign-in origin mismatch');
    warn.mockRestore();
    mocks.appUrl.mockReturnValue('https://portal.example.test');
  });

  it('works without a service-role key and requests an existing-user-only OTP', async () => {
    const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(genericBody);
      expect(response.headers.get('set-cookie')).toContain('sdk-generated-pkce-fixture=verifier-fixture');
      expect(response.headers.get('set-cookie')).toContain('Path=/');
      expect(response.headers.get('set-cookie')?.toLowerCase()).toContain('samesite=lax');
      expect(response.headers.get('set-cookie')).toContain('HttpOnly');
      expect(response.headers.get('set-cookie')).toContain('Secure');
      expect(mocks.signInWithOtp).toHaveBeenCalledWith({
        email: 'admin.frankfurt@performance.example.com',
        options: {
          shouldCreateUser: false,
          emailRedirectTo: 'https://portal.example.test/auth/confirm?next=%2Fadmin',
        },
      });
    } finally {
      if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    }
  });

  it('fails closed when the public authentication configuration is missing', async () => {
    mocks.hasPublicAuthEnv.mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Authentication is not configured.' });
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('does not expose whether the provider recognized the account', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const accepted = await POST(request('known@example.com', '/portal'));
    const acceptedBody = await accepted.json();

    mocks.signInWithOtp.mockImplementationOnce(async () => ({ error: { code: 'user_not_found', status: 400, message: 'User not found' } }));
    const unknown = await POST(request('unknown@example.com', '/portal'));
    const unknownBody = await unknown.json();

    expect(accepted.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(acceptedBody).toEqual(genericBody);
    expect(unknownBody).toEqual(genericBody);
    expect(mocks.signInWithOtp).toHaveBeenLastCalledWith(expect.objectContaining({
      options: expect.objectContaining({ shouldCreateUser: false }),
    }));
    expect(warn).toHaveBeenCalledWith(
      '[auth] Magic-link request was not accepted by the provider.',
      { code: 'user_not_found', status: 400 },
    );
    warn.mockRestore();
  });
});
