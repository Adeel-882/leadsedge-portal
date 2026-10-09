import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSupabaseEnv: vi.fn(() => true),
  createServerClient: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  activateCurrentClient: vi.fn(),
  profileRole: 'client' as 'admin' | 'client' | null,
  client: { id: 'client-fixture' } as { id: string } | null,
  memberships: [{ project_id: 'project-fixture' }] as Array<{ project_id: string }>,
  membershipEq: vi.fn(),
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

import { GET, POST } from '@/app/auth/confirm/route';

const tokenHash = 'a'.repeat(56);
const authorizationCode = '4f1e0a2b-8c3d-4e5f-9a0b-1c2d3e4f5a6b';

/** The request shape Supabase's own /auth/v1/verify redirect produces. */
function supabaseRedirectRequest(query: string) {
  return new NextRequest(new URL('http://127.0.0.1:3000/auth/confirm?' + query));
}

async function preparedRedirect(query: string) {
  const response = await GET(supabaseRedirectRequest(query));
  const html = await response.text();
  const cookie = response.headers.get('set-cookie')?.match(/leadsedge_auth_confirmation=([^;]+)/)?.[1];
  const nonce = html.match(/name="confirmation_nonce" value="([^"]+)"/)?.[1];
  if (!cookie || !nonce) throw new Error('Confirmation response did not contain its protected state.');
  return { cookie, nonce };
}

function confirmationRequest({
  type = 'email',
  next = '/portal',
  token = tokenHash,
  cookie,
}: { type?: string; next?: string; token?: string; cookie?: string } = {}) {
  const url = new URL('http://127.0.0.1:3000/auth/confirm');
  url.searchParams.set('token_hash', token);
  url.searchParams.set('type', type);
  url.searchParams.set('next', next);
  // A browser returns the confirmation-state cookie on every later GET of the
  // same link, which is what lets the route keep one nonce.
  return new NextRequest(url, cookie ? { headers: { Cookie: `leadsedge_auth_confirmation=${cookie}` } } : undefined);
}

async function preparedConfirmation(options: Parameters<typeof confirmationRequest>[0] = {}) {
  const response = await GET(confirmationRequest(options));
  const html = await response.text();
  const cookie = response.headers.get('set-cookie')?.match(/leadsedge_auth_confirmation=([^;]+)/)?.[1];
  const nonce = html.match(/name="confirmation_nonce" value="([^"]+)"/)?.[1];
  if (!cookie || !nonce) throw new Error('Confirmation response did not contain its protected state.');
  return { response, html, cookie, nonce };
}

function postRequest(cookie: string, nonce: string, origin = 'http://localhost:3000') {
  return new NextRequest('http://localhost:3000/auth/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `leadsedge_auth_confirmation=${cookie}`,
      Origin: origin,
      'Sec-Fetch-Site': origin === 'http://localhost:3000' ? 'same-origin' : 'cross-site',
    },
    body: new URLSearchParams({ confirmation_nonce: nonce }),
  });
}

function query(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: string) => {
      if (table === 'project_clients') mocks.membershipEq(column, value);
      return builder;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === 'users') return { data: mocks.profileRole ? { role: mocks.profileRole } : null, error: null };
      if (table === 'clients') return { data: mocks.client, error: null };
      return { data: null, error: null };
    }),
    limit: vi.fn(async () => ({ data: mocks.memberships, error: null })),
  };
  return builder;
}

describe('scanner-resistant TokenHash confirmation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('traces successful handoff without logging credentials, cookies or nonce', async () => {
    vi.stubEnv('LEADSEDGE_AUTH_DIAGNOSTICS', 'true');
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { cookie, nonce } = await preparedConfirmation();
      await POST(postRequest(cookie, nonce));
      const output = JSON.stringify(log.mock.calls);
      for (const value of [tokenHash, cookie, nonce, 'session-fixture']) expect(output).not.toContain(value);
      for (const stage of ['GET_RECEIVED', 'GET_READY', 'POST_RECEIVED', 'POST_VERIFY', 'POST_COMPLETE']) expect(output).toContain(stage);
    } finally { log.mockRestore(); }
  });

  it('rejects a second POST after the browser applies the cleared state cookie', async () => {
    const { cookie, nonce } = await preparedConfirmation();
    const first = await POST(postRequest(cookie, nonce));
    expect(first.headers.get('set-cookie')).toContain('Max-Age=0');
    const second = await POST(postRequest('', nonce));
    expect(new URL(second.headers.get('location')!).searchParams.get('reason')).toBe('invalid');
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('preserves a task deep link after invite confirmation', async () => {
    const { cookie, nonce } = await preparedConfirmation({ type: 'invite', next: '/portal/tasks/task-fixture' });
    const response = await POST(postRequest(cookie, nonce));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/portal/tasks/task-fixture');
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: tokenHash, type: 'invite' });
  });

  it('preserves a task deep link through the normal PKCE confirmation', async () => {
    const { cookie, nonce } = await preparedRedirect(`next=%2Fportal%2Ftasks%2Ftask-fixture&code=${authorizationCode}`);
    const response = await POST(postRequest(cookie, nonce));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/portal/tasks/task-fixture');
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it.each([
    ['client', 'token_hash', '/portal'],
    ['admin', 'token_hash', '/admin'],
    ['client', 'code', '/portal'],
    ['admin', 'code', '/admin'],
  ] as const)('redirects proxied %s %s confirmation with HTTPS and GET', async (role, kind, destination) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.leadsedge.us');
    mocks.profileRole = role;
    const internal = 'http://portal.leadsedge.us/auth/confirm';
    const headers = { Host: 'portal.leadsedge.us', 'X-Forwarded-Proto': 'https' };
    const search = kind === 'code' ? `code=${authorizationCode}` : `token_hash=${tokenHash}&type=magiclink`;
    const page = await GET(new NextRequest(`${internal}?${search}`, { headers }));
    const html = await page.text();
    expect(html).toContain('action="/auth/confirm"');
    expect(page.headers.get('set-cookie')).toContain('Secure');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    const cookie = page.headers.get('set-cookie')!.match(/leadsedge_auth_confirmation=([^;]+)/)![1];
    const nonce = html.match(/name="confirmation_nonce" value="([^"]+)"/)![1];
    const submit = (origin: string) => POST(new NextRequest(internal, {
      method: 'POST',
      headers: { ...headers, Origin: origin, 'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/x-www-form-urlencoded', Cookie: `leadsedge_auth_confirmation=${cookie}` },
      body: new URLSearchParams({ confirmation_nonce: nonce }),
    }));
    const rejected = await submit('https://evil.example');
    expect(rejected.status).toBe(303);
    expect(rejected.headers.get('location')).toBe('https://portal.leadsedge.us/auth/error?reason=invalid');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    const response = await submit('https://portal.leadsedge.us');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`https://portal.leadsedge.us${destination}`);
    expect(response.headers.get('set-cookie')).toContain('sdk-generated-session-fixture=');
    expect(kind === 'code' ? mocks.exchangeCodeForSession : mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(kind === 'code' ? mocks.verifyOtp : mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.profileRole = 'client';
    mocks.client = { id: 'client-fixture' };
    mocks.memberships = [{ project_id: 'project-fixture' }];
    mocks.activateCurrentClient.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.exchangeCodeForSession.mockImplementation(async () => {
      mocks.cookieAdapter?.setAll([{
        name: 'sdk-generated-session-fixture',
        value: 'session-fixture',
        options: { path: '/', sameSite: 'lax', httpOnly: true, secure: true },
      }]);
      return {
        data: { user: { id: 'user-fixture' }, session: { access_token: 'not-observed-by-route-tests' } },
        error: null,
      };
    });
    mocks.verifyOtp.mockImplementation(async () => {
      mocks.cookieAdapter?.setAll([{
        name: 'sdk-generated-session-fixture',
        value: 'session-fixture',
        options: { path: '/', sameSite: 'lax', httpOnly: true, secure: true },
      }]);
      return {
        data: {
          user: { id: 'user-fixture' },
          session: { access_token: 'not-observed-by-route-tests' },
        },
        error: null,
      };
    });
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      mocks.cookieAdapter = options.cookies;
      return {
        auth: { verifyOtp: mocks.verifyOtp, exchangeCodeForSession: mocks.exchangeCodeForSession, signOut: mocks.signOut },
        from: query,
        rpc: mocks.activateCurrentClient,
      };
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.example.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'publishable-test-key';
  });

  it('renders a non-consuming confirmation page with protected server handoff state', async () => {
    const { response, html } = await preparedConfirmation();

    expect(response.status).toBe(200);
    expect(html).toContain('<h1>Secure sign-in</h1>');
    expect(html).toContain('Continue to portal');
    expect(html).not.toContain(tokenHash);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    // Lax so the cookie survives an externally initiated navigation; cross-site
    // POSTs are blocked by the Origin check and the HttpOnly nonce instead.
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('accepts an actual-format 56-character hexadecimal TokenHash', async () => {
    const response = await GET(confirmationRequest({ token: 'A1'.repeat(28), type: 'email', next: '/portal' }));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Continue to portal');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('allows repeated scanner or prefetch GETs without consuming the token', async () => {
    await GET(confirmationRequest());
    await GET(confirmationRequest());

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  // Regression guard: the demo failed here. A browser fetches a confirmation
  // URL more than once for ordinary reasons (omnibox preload, reload, duplicated
  // tab, back-navigation re-fetch forced by Cache-Control: no-store). Minting a
  // fresh nonce per GET left the visible form holding a nonce the cookie had
  // already replaced, and Continue failed as tampered state -- reason=invalid,
  // indistinguishable from a broken link. curl never caught it: one GET, one POST.
  it('keeps one nonce across repeated GETs of the same link', async () => {
    const first = await preparedConfirmation();
    const second = await preparedConfirmation({ cookie: first.cookie });

    expect(second.nonce).toBe(first.nonce);
    expect(second.cookie).toBe(first.cookie);

    // The page opened first still completes against the cookie written last.
    const response = await POST(postRequest(second.cookie, first.nonce));
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/portal');
  });

  it('mints fresh state when a different link is opened', async () => {
    const first = await preparedConfirmation();
    const other = await preparedConfirmation({ token: 'b'.repeat(56), cookie: first.cookie });

    expect(other.nonce).not.toBe(first.nonce);
    const stale = await POST(postRequest(other.cookie, first.nonce));
    expect(new URL(stale.headers.get('location')!).searchParams.get('reason')).toBe('invalid');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('consumes the token exactly once on explicit POST and attaches session cookies', async () => {
    const { cookie, nonce } = await preparedConfirmation();
    const response = await POST(postRequest(cookie, nonce));

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: tokenHash, type: 'email' });
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/portal');
    expect(response.headers.get('set-cookie')).toContain('sdk-generated-session-fixture=session-fixture');
    expect(response.headers.get('set-cookie')).toContain('leadsedge_auth_confirmation=');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('redirects an administrator to admin and rejects a cross-role requested destination', async () => {
    mocks.profileRole = 'admin';
    const { cookie, nonce } = await preparedConfirmation({ next: '/portal' });
    const response = await POST(postRequest(cookie, nonce));

    expect(new URL(response.headers.get('location')!).pathname).toBe('/admin');
    expect(mocks.activateCurrentClient).not.toHaveBeenCalled();
  });

  it('rejects external next destinations', async () => {
    const { cookie, nonce } = await preparedConfirmation({ next: 'https://evil.example/steal' });
    const response = await POST(postRequest(cookie, nonce));

    expect(new URL(response.headers.get('location')!).origin).toBe('http://localhost:3000');
    expect(new URL(response.headers.get('location')!).pathname).toBe('/portal');
  });

  it('rejects cross-origin POSTs before creating an authentication client', async () => {
    const { cookie, nonce } = await preparedConfirmation();
    const response = await POST(postRequest(cookie, nonce, 'https://evil.example'));

    expect(new URL(response.headers.get('location')!).pathname).toBe('/auth/error');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('returns a safe expired-link error and does not log the token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', code: 'otp_expired', message: `Expired ${tokenHash}` },
    });
    const { cookie, nonce } = await preparedConfirmation();
    const response = await POST(postRequest(cookie, nonce));

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('expired');
    expect(JSON.stringify(warn.mock.calls)).toContain('POST_VERIFICATION_FAILED');
    expect(JSON.stringify(warn.mock.calls)).toContain('otp_expired');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(tokenHash);
    warn.mockRestore();
  });

  it('fails safely for missing session creation', async () => {
    mocks.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'user-fixture' }, session: null },
      error: null,
    });
    const { cookie, nonce } = await preparedConfirmation();
    const response = await POST(postRequest(cookie, nonce));

    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('configuration');
  });

  it('denies a disabled or unavailable client after authentication', async () => {
    mocks.client = null;
    const { cookie, nonce } = await preparedConfirmation();
    const response = await POST(postRequest(cookie, nonce));

    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('unauthorized');
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('scopes the membership check to the authenticated client identity', async () => {
    const { cookie, nonce } = await preparedConfirmation();
    await POST(postRequest(cookie, nonce));

    expect(mocks.membershipEq).toHaveBeenCalledWith('client_id', 'client-fixture');
    expect(mocks.membershipEq).toHaveBeenCalledTimes(1);
  });

  it('preserves the existing invitation TokenHash flow behind the same explicit POST', async () => {
    const { cookie, nonce } = await preparedConfirmation({ type: 'invite' });
    await POST(postRequest(cookie, nonce));

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: tokenHash, type: 'invite' });
  });

  it('rejects missing tokens and unsupported OTP types without verification', async () => {
    const missing = await GET(confirmationRequest({ token: '' }));
    const recovery = await GET(confirmationRequest({ type: 'recovery' }));

    expect(new URL(missing.headers.get('location')!).pathname).toBe('/auth/error');
    expect(new URL(recovery.headers.get('location')!).pathname).toBe('/auth/error');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  // Regression guard for the failure this suite originally missed: nothing here
  // used to exercise the URL Supabase actually produces. The built-in mailer
  // sends its own /auth/v1/verify link, so the browser arrives carrying a PKCE
  // authorization code -- never a token_hash -- and every real sign-in ended at
  // /auth/error?reason=invalid while every synthetic test passed.
  describe('the URL Supabase actually redirects to', () => {
    it('accepts the PKCE authorization code the built-in mailer produces', async () => {
      const response = await GET(supabaseRedirectRequest('next=%2Fportal&code=' + authorizationCode));

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Continue to portal');
      expect(mocks.createServerClient).not.toHaveBeenCalled();
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('exchanges the code exactly once on explicit POST and lands the client in the portal', async () => {
      const { cookie, nonce } = await preparedRedirect('next=%2Fportal&code=' + authorizationCode);
      const response = await POST(postRequest(cookie, nonce));

      expect(mocks.exchangeCodeForSession).toHaveBeenCalledTimes(1);
      expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith(authorizationCode);
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expect(new URL(response.headers.get('location')!).pathname).toBe('/portal');
      expect(response.headers.get('set-cookie')).toContain('sdk-generated-session-fixture=session-fixture');
    });

    it('sends an administrator to the admin console through the same code exchange', async () => {
      mocks.profileRole = 'admin';
      const { cookie, nonce } = await preparedRedirect('next=%2Fadmin&code=' + authorizationCode);
      const response = await POST(postRequest(cookie, nonce));

      expect(new URL(response.headers.get('location')!).pathname).toBe('/admin');
    });

    it('reports an expired link as expired instead of invalid', async () => {
      const response = await GET(supabaseRedirectRequest('next=%2Fportal&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'));

      expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('expired');
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('fails closed, and says why, when the credential only exists in the URL fragment', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      // Implicit-flow links put access_token in the fragment, which no browser
      // sends to a server, so the request arrives bare.
      const response = await GET(supabaseRedirectRequest('next=%2Fportal'));

      expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('invalid');
      expect(JSON.stringify(warn.mock.calls)).toContain('GET_NO_SERVER_VISIBLE_CREDENTIAL');
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('rejects a malformed authorization code without contacting Supabase', async () => {
      const response = await GET(supabaseRedirectRequest('next=%2Fportal&code=nope'));

      expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('invalid');
      expect(mocks.createServerClient).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['implausibly short hash', 'a'.repeat(16)],
    ['arbitrary text', 'not-a-supabase-token-hash'],
    ['non-hex hash', 'g'.repeat(56)],
  ])('rejects a %s', async (_label, token) => {
    const response = await GET(confirmationRequest({ token }));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/auth/error');
    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('invalid');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
