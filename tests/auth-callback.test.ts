import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSupabaseEnv: vi.fn(() => true),
  createServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  activateCurrentClient: vi.fn(),
  profileRole: 'client' as 'admin' | 'client' | null,
  client: { id: 'client-fixture' } as { id: string } | null,
  memberships: [{ project_id: 'project-fixture' }] as Array<{ project_id: string }>,
  cookieAdapter: null as null | {
    getAll: () => Array<{ name: string; value: string }>;
    setAll: (cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>) => void;
  },
}));

vi.mock('@/lib/env', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/env')>(),
  hasSupabaseEnv: mocks.hasSupabaseEnv,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}));

import { GET } from '@/app/auth/callback/route';

const authorizationCode = '4f1e0a2b-8c3d-4e5f-9a0b-1c2d3e4f5a6b';

function callbackRequest(cookie?: string, query = `next=%2Fportal&code=${authorizationCode}`) {
  return new NextRequest(`http://127.0.0.1:3000/auth/callback?${query}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function query(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      if (table === 'users') return { data: mocks.profileRole ? { role: mocks.profileRole } : null, error: null };
      if (table === 'clients') return { data: mocks.client, error: null };
      return { data: null, error: null };
    }),
    limit: vi.fn(async () => ({ data: mocks.memberships, error: null })),
  };
  return builder;
}

describe('PKCE callback cookie propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseEnv.mockReturnValue(true);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.example.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'publishable-test-key';
    mocks.profileRole = 'client';
    mocks.client = { id: 'client-fixture' };
    mocks.memberships = [{ project_id: 'project-fixture' }];
    mocks.activateCurrentClient.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: 'user-fixture' }, session: { access_token: 'not-observed-by-route-tests' } },
      error: null,
    });
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      mocks.cookieAdapter = options.cookies;
      return {
        auth: { exchangeCodeForSession: mocks.exchangeCodeForSession, signOut: mocks.signOut },
        from: query,
        rpc: mocks.activateCurrentClient,
      };
    });
  });

  it('receives the verifier, exchanges once, and attaches session cookies to the redirect', async () => {
    mocks.exchangeCodeForSession.mockImplementationOnce(async () => {
      expect(mocks.cookieAdapter?.getAll()).toContainEqual({
        name: 'sdk-generated-pkce-fixture',
        value: 'verifier-fixture',
      });
      mocks.cookieAdapter?.setAll([{
        name: 'sdk-generated-session-fixture',
        value: 'session-fixture',
        options: { path: '/', sameSite: 'lax', httpOnly: true, secure: true },
      }]);
      return { data: { user: { id: 'user-fixture' }, session: { access_token: 'x' } }, error: null };
    });

    const response = await GET(callbackRequest('sdk-generated-pkce-fixture=verifier-fixture'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/portal');
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith(authorizationCode);
    expect(response.headers.get('set-cookie')).toContain('sdk-generated-session-fixture=session-fixture');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });

  it('returns the generic error route and logs only safe metadata when the verifier is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.exchangeCodeForSession.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: {
        name: 'AuthPKCECodeVerifierMissingError',
        code: 'pkce_code_verifier_not_found',
        message: 'Sensitive diagnostic detail that must not be logged',
      },
    });

    const response = await GET(callbackRequest());

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/auth/error');
    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('different_device');
    expect(JSON.stringify(warn.mock.calls)).toContain('pkce_code_verifier_not_found');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Sensitive diagnostic detail');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(authorizationCode);
    warn.mockRestore();
  });

  it('applies the same role routing as the confirmation POST', async () => {
    mocks.profileRole = 'admin';
    const response = await GET(callbackRequest());

    expect(new URL(response.headers.get('location')!).pathname).toBe('/admin');
    expect(mocks.activateCurrentClient).not.toHaveBeenCalled();
  });

  it('denies a client whose membership rows are hidden by row level security', async () => {
    mocks.memberships = [];
    const response = await GET(callbackRequest());

    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('unauthorized');
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('maps a Supabase verification error reported on the redirect target', async () => {
    const response = await GET(callbackRequest(undefined, 'next=%2Fportal&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'));

    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('expired');
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed authorization code before contacting Supabase', async () => {
    const response = await GET(callbackRequest(undefined, 'next=%2Fportal'));

    expect(new URL(response.headers.get('location')!).pathname).toBe('/auth/error');
    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('invalid');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
