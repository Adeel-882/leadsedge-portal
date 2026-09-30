import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSupabaseEnv: vi.fn(() => true),
  createServerClient: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  activateCurrentClient: vi.fn(),
  profileRole: 'client' as 'admin' | 'client',
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

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/auth/confirm/route';
import { buildDemoSignInUrl } from '../scripts/create-sign-in-link.mjs';

const ORIGIN = 'http://127.0.0.1:3000';
const hashedToken = 'a1'.repeat(28);

/** The shape admin.generateLink() returns, per the installed auth-js types. */
function generateLinkProperties(overrides: Record<string, unknown> = {}) {
  return {
    hashed_token: hashedToken,
    verification_type: 'magiclink',
    redirect_to: `${ORIGIN}/portal`,
    email_otp: '12345678',
    action_link: `https://project.supabase.co/auth/v1/verify?token=${hashedToken}&type=magiclink&redirect_to=${encodeURIComponent(ORIGIN)}`,
    ...overrides,
  };
}

function query(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      if (table === 'users') return { data: { role: mocks.profileRole }, error: null };
      if (table === 'clients') return { data: { id: 'client-fixture' }, error: null };
      return { data: null, error: null };
    }),
    limit: vi.fn(async () => ({ data: [{ project_id: 'project-fixture' }], error: null })),
  };
  return builder;
}

/**
 * Drives the helper's URL exactly as a browser would: open it, then submit the
 * rendered form. No PKCE verifier cookie is ever supplied, because the point of
 * the helper is that a terminal cannot create one.
 */
async function openAndContinue(link: string) {
  const opened = await GET(new NextRequest(new URL(link)));
  const html = await opened.text();
  const stateCookie = opened.headers.get('set-cookie')?.match(/leadsedge_auth_confirmation=([^;]+)/)?.[1];
  const nonce = html.match(/name="confirmation_nonce" value="([^"]+)"/)?.[1];
  if (!stateCookie || !nonce) throw new Error('Confirmation page did not carry its protected state.');

  // NextRequest rewrites the host to localhost in this environment, so the
  // origin the route compares against is not the one written into the URL.
  // Derive it rather than assuming; the live server uses the real Host header,
  // which the HTTP-level checks cover.
  const confirmUrl = new URL(`${ORIGIN}/auth/confirm`);
  const effectiveOrigin = new URL(new NextRequest(confirmUrl).url).origin;
  const submitted = await POST(new NextRequest(confirmUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `leadsedge_auth_confirmation=${stateCookie}`,
      Origin: effectiveOrigin,
      'Sec-Fetch-Site': 'same-origin',
    },
    body: new URLSearchParams({ confirmation_nonce: nonce }),
  }));

  return { opened, html, submitted };
}

describe('local demo sign-in helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.profileRole = 'client';
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.activateCurrentClient.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockImplementation(async () => {
      mocks.cookieAdapter?.setAll([{
        name: 'sdk-generated-session-fixture',
        value: 'session-fixture',
        options: { path: '/', sameSite: 'lax', httpOnly: true, secure: true },
      }]);
      return { data: { user: { id: 'user-fixture' }, session: { access_token: 'not-observed' } }, error: null };
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

  it('builds a TokenHash portal URL, never an action link or a code URL', () => {
    const { url } = buildDemoSignInUrl({ properties: generateLinkProperties(), role: 'client', origin: ORIGIN });
    const parsed = new URL(url);

    expect(parsed.origin).toBe(ORIGIN);
    expect(parsed.pathname).toBe('/auth/confirm');
    expect(parsed.searchParams.get('token_hash')).toBe(hashedToken);
    expect(parsed.searchParams.get('code')).toBeNull();
    expect(parsed.hash).toBe('');
    expect(url).not.toContain('/auth/v1/verify');
    expect(url).not.toContain('supabase.co');
  });

  it('never reads action_link, even when Supabase returns one', () => {
    const source = readFileSync('scripts/create-sign-in-link.mjs', 'utf8');
    const code = source.slice(source.indexOf('export function buildDemoSignInUrl'));

    expect(code).not.toContain('action_link');
    expect(source).toContain('hashed_token');
  });

  it('carries the verification_type Supabase actually reported', () => {
    expect(buildDemoSignInUrl({ properties: generateLinkProperties(), role: 'client', origin: ORIGIN }).type).toBe('magiclink');
    expect(buildDemoSignInUrl({ properties: generateLinkProperties({ verification_type: 'invite' }), role: 'client', origin: ORIGIN }).type).toBe('invite');
    expect(buildDemoSignInUrl({ properties: generateLinkProperties({ verification_type: 'signup' }), role: 'client', origin: ORIGIN }).type).toBe('email');
  });

  it('refuses a verification_type the confirmation route cannot verify', () => {
    expect(() => buildDemoSignInUrl({ properties: generateLinkProperties({ verification_type: 'recovery' }), role: 'client', origin: ORIGIN }))
      .toThrow(/Unsupported verification_type/);
    expect(() => buildDemoSignInUrl({ properties: generateLinkProperties({ hashed_token: undefined }), role: 'client', origin: ORIGIN }))
      .toThrow(/hashed_token/);
  });

  it('targets /portal for a client and /admin for an administrator', () => {
    expect(new URL(buildDemoSignInUrl({ properties: generateLinkProperties(), role: 'client', origin: ORIGIN }).url).searchParams.get('next')).toBe('/portal');
    expect(new URL(buildDemoSignInUrl({ properties: generateLinkProperties(), role: 'admin', origin: ORIGIN }).url).searchParams.get('next')).toBe('/admin');
  });

  it('opens without consuming the token', async () => {
    const { url } = buildDemoSignInUrl({ properties: generateLinkProperties(), role: 'client', origin: ORIGIN });
    const first = await GET(new NextRequest(new URL(url)));
    const second = await GET(new NextRequest(new URL(url)));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.text()).not.toContain(hashedToken);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('signs a client in through verifyOtp exactly once, with no code exchange', async () => {
    const { url } = buildDemoSignInUrl({ properties: generateLinkProperties(), role: 'client', origin: ORIGIN });
    const { submitted } = await openAndContinue(url);

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: hashedToken, type: 'magiclink' });
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(new URL(submitted.headers.get('location')!).pathname).toBe('/portal');
    expect(submitted.headers.get('set-cookie')).toContain('sdk-generated-session-fixture=session-fixture');
  });

  it('signs an administrator in and lands on /admin', async () => {
    mocks.profileRole = 'admin';
    const { url } = buildDemoSignInUrl({ properties: generateLinkProperties(), role: 'admin', origin: ORIGIN });
    const { submitted } = await openAndContinue(url);

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(new URL(submitted.headers.get('location')!).pathname).toBe('/admin');
  });

  it('completes with no PKCE verifier cookie anywhere in the exchange', async () => {
    const { url } = buildDemoSignInUrl({ properties: generateLinkProperties(), role: 'client', origin: ORIGIN });
    await openAndContinue(url);

    // The route only ever saw the confirmation-state cookie. A terminal-issued
    // link cannot rely on a verifier, so nothing may consult one.
    const cookiesSeen = mocks.cookieAdapter?.getAll().map((cookie) => cookie.name) || [];
    expect(cookiesSeen.some((name) => name.includes('code-verifier'))).toBe(false);
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
