import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSupabaseEnv: vi.fn(() => true),
  createServerClient: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  activateCurrentClient: vi.fn(),
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

const CANONICAL = 'http://127.0.0.1:3000';
const CANONICAL_HOST = '127.0.0.1:3000';
const tokenHash = 'a1'.repeat(28);
const authorizationCode = '4f1e0a2b-8c3d-4e5f-9a0b-1c2d3e4f5a6b';

function query(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      if (table === 'users') return { data: { role: 'client' }, error: null };
      if (table === 'clients') return { data: { id: 'client-fixture' }, error: null };
      return { data: null, error: null };
    }),
    limit: vi.fn(async () => ({ data: [{ project_id: 'project-fixture' }], error: null })),
  };
  return builder;
}

/**
 * The confirmation page carries the canonical Host. NextRequest resolves
 * `request.url` against its own base (localhost) in this environment, so the
 * Host header is deliberately set: it is what the route must resolve the origin
 * from, and setting it also proves the route is not reading `request.url`.
 */
async function prepare(search: string) {
  const response = await GET(new NextRequest(new URL(`${CANONICAL}/auth/confirm?${search}`), {
    headers: { Host: CANONICAL_HOST },
  }));
  const html = await response.text();
  const cookie = response.headers.get('set-cookie')?.match(/leadsedge_auth_confirmation=([^;]+)/)?.[1];
  const nonce = html.match(/name="confirmation_nonce" value="([^"]+)"/)?.[1];
  if (!cookie || !nonce) throw new Error('Confirmation page did not carry its protected state.');
  return { cookie, nonce };
}

function submit({
  cookie,
  nonce,
  origin,
  fetchSite,
  host = CANONICAL_HOST,
}: { cookie?: string; nonce?: string; origin?: string | null; fetchSite?: string | null; host?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Host: host };
  if (cookie) headers.Cookie = `leadsedge_auth_confirmation=${cookie}`;
  if (origin !== null && origin !== undefined) headers.Origin = origin;
  if (fetchSite !== null && fetchSite !== undefined) headers['Sec-Fetch-Site'] = fetchSite;

  return POST(new NextRequest(new URL(`${CANONICAL}/auth/confirm`), {
    method: 'POST',
    headers,
    body: new URLSearchParams({ confirmation_nonce: nonce ?? '' }),
  }));
}

function reasonOf(response: Response) {
  const location = response.headers.get('location');
  return location ? new URL(location).searchParams.get('reason') : null;
}

describe('confirmation POST origin gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.activateCurrentClient.mockResolvedValue({ error: null });
    const session = async () => {
      mocks.cookieAdapter?.setAll([{
        name: 'sdk-generated-session-fixture',
        value: 'session-fixture',
        options: { path: '/', sameSite: 'lax', httpOnly: true, secure: true },
      }]);
      return { data: { user: { id: 'user-fixture' }, session: { access_token: 'not-observed' } }, error: null };
    };
    mocks.verifyOtp.mockImplementation(session);
    mocks.exchangeCodeForSession.mockImplementation(session);
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
    process.env.NEXT_PUBLIC_APP_URL = CANONICAL;
  });

  const tokenSearch = `token_hash=${tokenHash}&type=magiclink&next=%2Fportal`;

  it('accepts a POST whose Origin is the canonical 127.0.0.1 origin', async () => {
    const { cookie, nonce } = await prepare(tokenSearch);
    const response = await submit({ cookie, nonce, origin: CANONICAL, fetchSite: 'same-origin' });

    expect(new URL(response.headers.get('location')!).pathname).toBe('/portal');
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
  });

  // The live failure: Referrer-Policy: no-referrer makes browsers serialize the
  // Origin of a non-GET request as the opaque value "null".
  it('accepts an opaque Origin when the browser reports Sec-Fetch-Site: same-origin', async () => {
    const { cookie, nonce } = await prepare(tokenSearch);
    const response = await submit({ cookie, nonce, origin: 'null', fetchSite: 'same-origin' });

    expect(new URL(response.headers.get('location')!).pathname).toBe('/portal');
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('rejects an opaque Origin that the browser reports as cross-site', async () => {
    const { cookie, nonce } = await prepare(tokenSearch);
    const response = await submit({ cookie, nonce, origin: 'null', fetchSite: 'cross-site' });

    expect(reasonOf(response)).toBe('invalid');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('rejects an absent Origin with no site signal rather than assuming consent', async () => {
    const { cookie, nonce } = await prepare(tokenSearch);
    const response = await submit({ cookie, nonce, origin: null, fetchSite: null });

    expect(reasonOf(response)).toBe('invalid');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('rejects localhost posting to the canonical 127.0.0.1 origin', async () => {
    const { cookie, nonce } = await prepare(tokenSearch);
    const response = await submit({ cookie, nonce, origin: 'http://localhost:3000', fetchSite: 'same-origin' });

    expect(reasonOf(response)).toBe('invalid');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('rejects an external origin', async () => {
    const { cookie, nonce } = await prepare(tokenSearch);
    const response = await submit({ cookie, nonce, origin: 'https://evil.example', fetchSite: 'cross-site' });

    expect(reasonOf(response)).toBe('invalid');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('rejects an external origin even when it lies about Sec-Fetch-Site', async () => {
    const { cookie, nonce } = await prepare(tokenSearch);
    const response = await submit({ cookie, nonce, origin: 'https://evil.example', fetchSite: 'same-origin' });

    expect(reasonOf(response)).toBe('invalid');
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('still requires the state cookie once the origin gate passes', async () => {
    const { nonce } = await prepare(tokenSearch);
    const response = await submit({ nonce, origin: 'null', fetchSite: 'same-origin' });

    expect(reasonOf(response)).toBe('invalid');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('still requires a matching nonce once the origin gate passes', async () => {
    const { cookie } = await prepare(tokenSearch);
    const response = await submit({ cookie, nonce: 'a3f1c2d4-0000-4000-8000-000000000000', origin: 'null', fetchSite: 'same-origin' });

    expect(reasonOf(response)).toBe('invalid');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('verifies a TokenHash link exactly once and never exchanges a code', async () => {
    const { cookie, nonce } = await prepare(tokenSearch);
    await submit({ cookie, nonce, origin: 'null', fetchSite: 'same-origin' });

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: tokenHash, type: 'magiclink' });
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges a PKCE code exactly once and never verifies an OTP', async () => {
    const { cookie, nonce } = await prepare(`next=%2Fportal&code=${authorizationCode}`);
    const response = await submit({ cookie, nonce, origin: 'null', fetchSite: 'same-origin' });

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith(authorizationCode);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(new URL(response.headers.get('location')!).pathname).toBe('/portal');
  });
});
