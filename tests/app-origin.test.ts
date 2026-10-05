import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuredAppOrigin, externalRequestUrl, PRODUCTION_APP_ORIGIN } from '@/lib/app-origin';

afterEach(() => vi.unstubAllEnvs());

describe('external application origin', () => {
  it.each(['http://portal.leadsedge.us', 'https://obsolete.hostingersite.com', 'https://portal.leadsedge.us/path/'])('canonicalizes %s', (configured) => {
    expect(configuredAppOrigin(configured)).toBe(PRODUCTION_APP_ORIGIN);
  });

  it.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'])('preserves explicit local origin %s in standalone builds', (origin) => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(configuredAppOrigin(origin)).toBe(origin);
  });

  it('defaults production to HTTPS without configuration', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(configuredAppOrigin()).toBe(PRODUCTION_APP_ORIGIN);
  });

  it.each(['not-a-url', 'javascript:alert(1)', 'https://user:password@portal.leadsedge.us'])('rejects invalid configuration %s', (value) => {
    expect(() => configuredAppOrigin(value)).toThrow();
  });

  it('ignores proxy origins for outward URLs and preserves path/query safely', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', PRODUCTION_APP_ORIGIN);
    const request = new Request('http://internal:3000//evil.example/auth?next=%2Fportal', {
      headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http' },
    });
    const external = externalRequestUrl(request);
    expect(external.origin).toBe(PRODUCTION_APP_ORIGIN);
    expect(external.pathname).toBe('//evil.example/auth');
    expect(external.searchParams.get('next')).toBe('/portal');
  });
});
