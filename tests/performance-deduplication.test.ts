import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { createTimedSupabaseFetch } from '@/lib/perf';

describe('request-scoped Supabase read deduplication', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shares an identical in-flight read only inside one request', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ request: calls }));
    }));
    const requestA = createTimedSupabaseFetch('request-a');
    const [first, second] = await Promise.all([
      requestA('https://example.supabase.co/rest/v1/users?id=eq.1'),
      requestA('https://example.supabase.co/rest/v1/users?id=eq.1'),
    ]);
    expect(calls).toBe(1);
    expect(await first.json()).toEqual(await second.json());

    await createTimedSupabaseFetch('request-b')('https://example.supabase.co/rest/v1/users?id=eq.1');
    expect(calls).toBe(2);
  });

  it('never deduplicates mutations', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const request = createTimedSupabaseFetch('mutation-request');
    await Promise.all([
      request('https://example.supabase.co/rest/v1/messages', { method: 'POST', body: '{}' }),
      request('https://example.supabase.co/rest/v1/messages', { method: 'POST', body: '{}' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates only the explicitly read-only bootstrap RPC', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const request = createTimedSupabaseFetch('bootstrap-request');
    await Promise.all([
      request('https://example.supabase.co/rest/v1/rpc/get_portal_bootstrap', { method: 'POST', body: '{}' }),
      request('https://example.supabase.co/rest/v1/rpc/get_portal_bootstrap', { method: 'POST', body: '{}' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('removes a rejected read immediately so retries can proceed', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const request = createTimedSupabaseFetch('retry-request');
    await expect(request('https://example.supabase.co/rest/v1/users')).rejects.toThrow('network failure');
    await request('https://example.supabase.co/rest/v1/users');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
