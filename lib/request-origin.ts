import type { NextRequest } from 'next/server';

/**
 * The origin a browser actually addressed, derived from the request itself.
 *
 * `request.url` and `request.nextUrl` cannot be trusted for this: the framework
 * resolves them against its own base, which rewrote `127.0.0.1:3000` to
 * `localhost:3000`. Comparing a browser's `Origin` header against a normalised
 * value rejects a genuinely same-origin POST, which is exactly how a working
 * sign-in ended at `/auth/error?reason=invalid`.
 *
 * The `Host` header is authoritative here, and safe to be. A cross-site form
 * POST cannot forge it — the browser sets `Host` from the URL it is posting to
 * and `Origin` from the page that submitted — so an attacker page still fails
 * the comparison. A non-browser caller can forge both headers, but CSRF is a
 * browser-driven attack, and such a caller would still need the HttpOnly
 * confirmation-state cookie and its nonce.
 *
 * Forwarded headers are honoured only behind an explicitly trusted proxy, so a
 * direct caller cannot use them to move the origin.
 */
export function resolveRequestOrigin(request: NextRequest): string | null {
  const trustProxy = process.env.LEADSEDGE_TRUST_PROXY_HEADERS?.trim().toLowerCase() === 'true';
  const forwardedHost = trustProxy ? request.headers.get('x-forwarded-host') : null;
  const forwardedProto = trustProxy ? request.headers.get('x-forwarded-proto') : null;

  let fallbackHost: string | null = null;
  let fallbackProtocol = 'http:';
  try {
    const parsed = new URL(request.url);
    fallbackHost = parsed.host;
    fallbackProtocol = parsed.protocol;
  } catch {
    // request.url is unusable; the Host header below still resolves the origin.
  }

  const host = (forwardedHost || request.headers.get('host') || fallbackHost || '').split(',')[0]?.trim();
  if (!host) return null;

  const protocol = forwardedProto ? `${forwardedProto.split(',')[0]?.trim()}:` : fallbackProtocol;

  // The configured app origin is the authority on scheme for its own host, so a
  // deployment behind TLS termination is not downgraded to http by a bare Host.
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const configuredUrl = new URL(configured);
      if (configuredUrl.host === host) return configuredUrl.origin;
    } catch {
      // A malformed NEXT_PUBLIC_APP_URL must not break origin resolution.
    }
  }

  return `${protocol}//${host}`;
}
