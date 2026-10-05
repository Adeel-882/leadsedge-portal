import { describe, expect, it, vi } from 'vitest';
import config from '../next.config';
vi.mock('@/lib/supabase/response-bound', () => ({ createResponseBoundSupabaseClient: () => null }));
import { GET } from '@/app/auth/confirm/route';
import { NextRequest } from 'next/server';

describe('central security headers', () => {
  it('protects framing without restricting scripts, styles or connections', async () => {
    const rules = await config.headers!();
    const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(headers['content-security-policy']).toBeUndefined();
    expect(headers['strict-transport-security']).toBeUndefined();
    expect(rules[1]).toEqual({ source: '/auth/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] });
  });
  it('preserves the actual confirmation route security headers', async () => {
    const response = await GET(new NextRequest('http://127.0.0.1:3000/auth/confirm'));
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
