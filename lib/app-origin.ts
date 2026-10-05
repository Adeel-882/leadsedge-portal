export const PRODUCTION_APP_ORIGIN = 'https://portal.leadsedge.us';

function isLoopback(url: URL) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/** External URLs never inherit an internal proxy scheme or an obsolete host. */
export function configuredAppOrigin(value = process.env.NEXT_PUBLIC_APP_URL): string {
  if (value?.trim()) {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid application origin configuration');
    return isLoopback(url) ? url.origin : PRODUCTION_APP_ORIGIN;
  }
  return process.env.NODE_ENV === 'production' ? PRODUCTION_APP_ORIGIN : 'http://127.0.0.1:3000';
}

/** Keep query parsing, but replace the origin used by redirects/cookie options. */
export function externalRequestUrl(request: Request): URL {
  const incoming = new URL(request.url);
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const origin = configured?.trim()
    ? configuredAppOrigin(configured)
    : process.env.NODE_ENV !== 'production' && isLoopback(incoming) ? incoming.origin : PRODUCTION_APP_ORIGIN;
  const result = new URL(origin);
  result.pathname = incoming.pathname;
  result.search = incoming.search;
  return result;
}
