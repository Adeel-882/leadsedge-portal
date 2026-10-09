import { NextRequest, NextResponse } from 'next/server';
import { classifyOtpError, describeCredential, destinationForRole, isSupabaseAuthorizationCode, isSupabaseEmailTokenHash, parsePortalEmailOtpType, safeInternalPath, type AuthErrorReason, type PortalEmailOtpType } from '@/lib/auth-flow';
import { completeAuthenticatedSession } from '@/lib/auth-session';
import { resolveRequestOrigin } from '@/lib/request-origin';
import { createResponseBoundSupabaseClient } from '@/lib/supabase/response-bound';
import { externalRequestUrl } from '@/lib/app-origin';

const confirmationCookie = 'leadsedge_auth_confirmation';
const confirmationLifetimeSeconds = 10 * 60;

/**
 * Two credential shapes reach this route, and both must be handled:
 *
 * - `token_hash` + `type`: the scanner-resistant form. The portal builds these
 *   itself (admin invitations and resends), and Supabase emits them once the
 *   auth email template is customised to use the TokenHash variable.
 * - `code`: what Supabase's own /auth/v1/verify appends to `emailRedirectTo`
 *   after it has already verified the emailed token. The built-in mailer sends
 *   that direct verification URL and the template cannot be edited without
 *   custom SMTP, so this is the shape every live sign-in email produces today.
 */
type PendingCredential =
  | { kind: 'token_hash'; tokenHash: string; type: PortalEmailOtpType }
  | { kind: 'code'; code: string };

type PendingConfirmation = {
  credential: PendingCredential;
  next: string | null;
  nonce: string;
  createdAt: number;
};

function errorRedirect(url: URL, reason: AuthErrorReason) {
  const response = NextResponse.redirect(new URL(`/auth/error?reason=${reason}`, url.origin), 303);
  return secureResponse(response);
}

function secureResponse<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  return response;
}

function confirmationCookieOptions(url: URL) {
  return {
    httpOnly: true,
    secure: url.protocol === 'https:',
    // Lax, not Strict. A sign-in link is opened from outside the site -- an email
    // client, a pasted URL, a file -- and browsers withhold Strict cookies on
    // externally initiated navigations. That would hide the state cookie from a
    // repeat GET and reintroduce the nonce drift this route exists to avoid.
    // Lax still refuses to travel on a cross-site POST, and the explicit Origin
    // check plus the HttpOnly nonce remain the actual CSRF defence.
    sameSite: 'lax' as const,
    path: '/auth/confirm',
    maxAge: confirmationLifetimeSeconds,
  };
}

function clearConfirmationCookie(response: NextResponse, url: URL) {
  response.cookies.set(confirmationCookie, '', {
    ...confirmationCookieOptions(url),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

function encodeConfirmation(state: PendingConfirmation) {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodeCredential(value: unknown): PendingCredential | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { kind?: unknown; tokenHash?: unknown; code?: unknown; type?: unknown };
  if (candidate.kind === 'token_hash') {
    const type = parsePortalEmailOtpType(typeof candidate.type === 'string' ? candidate.type : null);
    if (!type || typeof candidate.tokenHash !== 'string' || !isSupabaseEmailTokenHash(candidate.tokenHash)) return null;
    return { kind: 'token_hash', tokenHash: candidate.tokenHash, type };
  }
  if (candidate.kind === 'code') {
    if (typeof candidate.code !== 'string' || !isSupabaseAuthorizationCode(candidate.code)) return null;
    return { kind: 'code', code: candidate.code };
  }
  return null;
}

/**
 * Repeated GETs of the same link must converge on one nonce. A browser fetches
 * a confirmation URL more than once for ordinary reasons -- omnibox preload, a
 * reload, a duplicated tab, an extension, a back-navigation re-fetch forced by
 * Cache-Control: no-store -- and minting a fresh nonce each time left the form
 * on screen holding a nonce the cookie had already replaced. The Continue POST
 * then failed as tampered state, which is indistinguishable to the user from a
 * broken link.
 */
function isSameCredential(a: PendingCredential, b: PendingCredential) {
  if (a.kind === 'token_hash' && b.kind === 'token_hash') return a.tokenHash === b.tokenHash && a.type === b.type;
  if (a.kind === 'code' && b.kind === 'code') return a.code === b.code;
  return false;
}

function decodeConfirmation(value: string | undefined): PendingConfirmation | null {
  if (!value || value.length > 2048) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<PendingConfirmation>;
    const credential = decodeCredential(parsed.credential);
    if (!credential) return null;
    if (typeof parsed.nonce !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.nonce)) return null;
    if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt > confirmationLifetimeSeconds * 1000) return null;
    return {
      credential,
      next: typeof parsed.next === 'string' ? parsed.next : null,
      nonce: parsed.nonce,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

function normalizeConfirmationNext(value: string | null, url: URL) {
  if (!value) return null;
  if (value.startsWith('/')) {
    const safe = safeInternalPath(value, '');
    return safe || null;
  }

  try {
    const nested = new URL(value);
    if (nested.origin !== url.origin) return null;
    if (nested.pathname === '/auth/callback') {
      const safe = safeInternalPath(nested.searchParams.get('next'), '');
      return safe || null;
    }
    const safe = safeInternalPath(`${nested.pathname}${nested.search}`, '');
    return safe || null;
  } catch {
    return null;
  }
}

function confirmationPage(nonce: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Secure sign-in | Leadsedge</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171717; background: #f7f7f5; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: linear-gradient(135deg, #f7f7f5 0%, #f3f3f1 100%); }
    main { width: min(100%, 460px); border: 1px solid #e5e5e1; border-radius: 18px; background: #fff; padding: 38px; box-shadow: 0 24px 70px rgba(0, 0, 0, .09); }
    .brand { color: #bd291f; font-size: 18px; font-weight: 800; letter-spacing: -.02em; }
    .eyebrow { margin: 42px 0 10px; color: #bd291f; font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 34px; letter-spacing: -.04em; line-height: 1.08; }
    p { margin: 14px 0 0; color: #666662; font-size: 15px; line-height: 1.65; }
    form { margin-top: 30px; }
    button { width: 100%; min-height: 46px; border: 1px solid #ff4134; border-radius: 10px; background: #ff4134; color: #171717; cursor: pointer; font: inherit; font-size: 14px; font-weight: 750; }
    button:hover { background: #f03b2e; border-color: #f03b2e; }
    button:focus-visible { outline: 3px solid #bd291f; outline-offset: 3px; }
    .note { margin-top: 18px; font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <div class="brand">Leadsedge</div>
    <p class="eyebrow">Secure access</p>
    <h1>Secure sign-in</h1>
    <p>Click Continue to securely sign in to your LeadsEdge portal.</p>
    <form method="post" action="/auth/confirm" autocomplete="off">
      <input type="hidden" name="confirmation_nonce" value="${nonce}">
      <button type="submit">Continue to portal</button>
    </form>
    <p class="note">Opening this page does not sign you in. The secure link is used only after you continue.</p>
  </main>
</body>
</html>`;
}

/**
 * Structured, secret-free confirmation diagnostics. Every rejection names the
 * stage it failed at, so an `/auth/error?reason=invalid` never again has to be
 * re-derived from scratch. Credential values, cookies and sessions are never
 * logged: only shapes, presence flags and provider error codes.
 */
function logConfirmation(stage: string, detail: Record<string, unknown>) {
  console.warn('[auth-confirm]', JSON.stringify({ timestamp: new Date().toISOString(), ...detail, stage }));
}

/** Opt-in tracing; deliberately excludes URL queries, headers with credentials, and state values. */
function traceConfirmation(request: NextRequest, stage: string, detail: Record<string, boolean | string | null> = {}) {
  if (process.env.LEADSEDGE_AUTH_DIAGNOSTICS !== 'true') return;
  const url = new URL(request.url);
  const allowedSite = ['same-origin', 'same-site', 'cross-site', 'none'];
  const allowedMode = ['navigate', 'cors', 'no-cors', 'same-origin'];
  const site = request.headers.get('sec-fetch-site');
  const mode = request.headers.get('sec-fetch-mode');
  logConfirmation(stage, {
    method: request.method,
    path: '/auth/confirm',
    secFetchSite: site && allowedSite.includes(site) ? site : null,
    secFetchMode: mode && allowedMode.includes(mode) ? mode : null,
    tokenHashPresent: url.searchParams.has('token_hash'),
    codePresent: url.searchParams.has('code'),
    type: parsePortalEmailOtpType(url.searchParams.get('type')),
    stateCookiePresent: Boolean(request.cookies.get(confirmationCookie)?.value),
    ...detail,
  });
}

/**
 * Everything the origin decision is made from, safe to log in full: header
 * values that identify the site, never anything that authenticates a caller.
 */
function describeOrigin(request: NextRequest) {
  let requestUrlOrigin: string | null = null;
  try {
    requestUrlOrigin = new URL(request.url).origin;
  } catch {
    requestUrlOrigin = null;
  }
  return {
    originHeader: request.headers.get('origin'),
    hostHeader: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    requestUrlOrigin,
    nextUrlOrigin: request.nextUrl?.origin ?? null,
    configuredAppOrigin: process.env.NEXT_PUBLIC_APP_URL || null,
    effectiveOrigin: resolveRequestOrigin(request),
    secFetchSite: request.headers.get('sec-fetch-site'),
  };
}

/**
 * A Continue POST is accepted only when the browser itself vouches that it came
 * from this site.
 *
 * The confirmation page is served with `Referrer-Policy: no-referrer`, and the
 * Fetch standard makes a browser serialize the Origin of a non-GET request as
 * the opaque value `null` under that policy. Chrome does exactly that, so a
 * genuinely same-origin Continue arrives as Origin: null with
 * Sec-Fetch-Site: same-origin. Comparing origins alone rejected it, which is how
 * a working sign-in ended at /auth/error?reason=invalid.
 *
 * The opaque case is decided by Sec-Fetch-Site instead of by weakening the
 * referrer policy, which would put the token-bearing URL into a Referer header.
 * Sec-Fetch-Site is set by the browser and cannot be influenced by page content.
 * A cross-site submission still fails: it carries either a foreign Origin or
 * Sec-Fetch-Site: cross-site, and the SameSite=Lax state cookie never travels
 * with it, so there is no nonce to match either.
 */
function isSameOriginPost(request: NextRequest) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');

  // A stated origin must be this origin, whatever else the request claims.
  if (origin && origin !== 'null') {
    return origin === resolveRequestOrigin(request) && (!fetchSite || fetchSite === 'same-origin');
  }

  // Opaque or absent origin: trust only the browser-set site signal, and require
  // it to be present rather than treating its absence as permission.
  return fetchSite === 'same-origin';
}

export async function GET(request: NextRequest) {
  traceConfirmation(request, 'GET_RECEIVED', { consumesCredential: false });
  const url = externalRequestUrl(request);
  const next = normalizeConfirmationNext(url.searchParams.get('next'), url);

  // Supabase reports a failed verification on the redirect target itself rather
  // than by refusing to redirect, so a used or expired link arrives here as an
  // ordinary request carrying error parameters.
  const providerErrorCode = url.searchParams.get('error_code');
  const providerError = url.searchParams.get('error');
  if (providerErrorCode || providerError) {
    const reason = classifyOtpError({ code: providerErrorCode, message: url.searchParams.get('error_description') });
    logConfirmation('GET_PROVIDER_ERROR', { providerErrorCode: providerErrorCode || providerError, reason });
    return errorRedirect(url, reason);
  }

  const tokenHash = url.searchParams.get('token_hash') || '';
  const rawType = url.searchParams.get('type');
  const code = url.searchParams.get('code') || '';

  let credential: PendingCredential;
  if (tokenHash || rawType) {
    const type = parsePortalEmailOtpType(rawType);
    if (!isSupabaseEmailTokenHash(tokenHash) || !type) {
      logConfirmation('GET_TOKEN_HASH_REJECTED', {
        tokenPresent: Boolean(tokenHash),
        ...describeCredential(tokenHash),
        tokenShapeValid: isSupabaseEmailTokenHash(tokenHash),
        parsedType: type,
        next,
      });
      return errorRedirect(url, 'invalid');
    }
    credential = { kind: 'token_hash', tokenHash, type };
  } else if (code) {
    if (!isSupabaseAuthorizationCode(code)) {
      logConfirmation('GET_CODE_REJECTED', { ...describeCredential(code), next });
      return errorRedirect(url, 'invalid');
    }
    credential = { kind: 'code', code };
  } else {
    // Nothing the server can act on. The usual cause is an implicit-flow link:
    // Supabase returns the session in the URL fragment, which browsers never
    // send to a server. The portal never emails those, so this is a hand-built
    // or stripped link.
    logConfirmation('GET_NO_SERVER_VISIBLE_CREDENTIAL', {
      queryKeys: [...url.searchParams.keys()],
      next,
    });
    return errorRedirect(url, 'invalid');
  }

  // Keep the nonce already issued for this exact link, so the form on screen and
  // the cookie can never drift apart. createdAt is deliberately not refreshed:
  // re-opening the page must not extend the ten-minute window.
  const existing = decodeConfirmation(request.cookies.get(confirmationCookie)?.value);
  const reusable = existing && existing.next === next && isSameCredential(existing.credential, credential);
  const state: PendingConfirmation = reusable ? existing : {
    credential,
    next,
    nonce: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const response = secureResponse(new NextResponse(confirmationPage(state.nonce), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  }));
  response.cookies.set(confirmationCookie, encodeConfirmation(state), confirmationCookieOptions(url));
  traceConfirmation(request, 'GET_READY', { consumesCredential: false, stateReused: Boolean(reusable), credentialKind: credential.kind });
  return response;
}

export async function POST(request: NextRequest) {
  traceConfirmation(request, 'POST_RECEIVED');
  const url = externalRequestUrl(request);
  if (!isSameOriginPost(request)) {
    logConfirmation('POST_ORIGIN_REJECTED', { originMatches: false, ...describeOrigin(request) });
    return clearConfirmationCookie(errorRedirect(url, 'invalid'), url);
  }

  const stateCookiePresent = Boolean(request.cookies.get(confirmationCookie)?.value);
  const state = decodeConfirmation(request.cookies.get(confirmationCookie)?.value);
  const form = await request.formData().catch(() => null);
  const submittedNonce = form?.get('confirmation_nonce');
  if (!state || typeof submittedNonce !== 'string' || submittedNonce !== state.nonce) {
    logConfirmation('POST_STATE_REJECTED', {
      stateCookiePresent,
      stateDecoded: Boolean(state),
      nonceSubmitted: typeof submittedNonce === 'string',
      nonceMatches: Boolean(state) && submittedNonce === state?.nonce,
    });
    return clearConfirmationCookie(errorRedirect(url, 'invalid'), url);
  }

  const routeClient = createResponseBoundSupabaseClient(request);
  if (!routeClient) {
    logConfirmation('POST_CONFIGURATION', { code: 'missing_public_auth_config' });
    return clearConfirmationCookie(errorRedirect(url, 'configuration'), url);
  }
  const { supabase, attachCookies } = routeClient;

  traceConfirmation(request, 'POST_VERIFY', { credentialKind: state.credential.kind });

  const { data: verification, error: verificationError } = state.credential.kind === 'token_hash'
    ? await supabase.auth.verifyOtp({ token_hash: state.credential.tokenHash, type: state.credential.type })
    : await supabase.auth.exchangeCodeForSession(state.credential.code);

  if (verificationError || !verification.user || !verification.session) {
    logConfirmation(verificationError ? 'POST_VERIFICATION_FAILED' : 'POST_SESSION_MISSING', {
      credentialKind: state.credential.kind,
      name: verificationError?.name || 'AuthSessionError',
      code: verificationError?.code || 'missing_session',
      status: verificationError?.status ?? null,
    });
    const response = attachCookies(errorRedirect(url, verificationError ? classifyOtpError(verificationError) : 'configuration'));
    return clearConfirmationCookie(response, url);
  }

  const completion = await completeAuthenticatedSession(supabase, verification.user.id);
  if (!completion.ok) {
    logConfirmation('POST_AUTHORIZATION_DENIED', { authorizationStage: completion.stage, code: completion.code });
    return clearConfirmationCookie(attachCookies(errorRedirect(url, completion.reason)), url);
  }

  const response = attachCookies(secureResponse(NextResponse.redirect(new URL(destinationForRole(completion.role, state.next), url.origin), 303)));
  traceConfirmation(request, 'POST_COMPLETE', { role: completion.role });
  return clearConfirmationCookie(response, url);
}
