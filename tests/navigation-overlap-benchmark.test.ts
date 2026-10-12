// Opt-in synthetic scheduling experiment. No provider/session/network access.
import { afterEach, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { makeQueryClient, queryKeys, freshness, readJson } from '@/lib/query-cache';
const state = vi.hoisted(() => ({ client: null as unknown, identity: { id: 'synthetic', role: 'admin' as 'admin' | 'client' } }));
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('@tanstack/react-query', async importOriginal => ({ ...await importOriginal<object>(), useQueryClient: () => state.client }));
vi.mock('@/components/query-provider', () => ({ useCacheIdentity: () => state.identity }));
import { CacheLink } from '@/components/cache-link';
import { screenUrl } from '@/components/cached-screen';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
afterEach(() => vi.unstubAllGlobals());
it.skipIf(!process.env.NAV_BENCH)('measures real CacheLink and QueryClient scheduling with controlled route/data delays', async () => {
  const output = [];
  for (const [href, screen, role] of [['/admin/people','people','admin'], ['/admin','dashboard','admin'], ['/admin/templates','templates','admin'], ['/portal/tasks','tasks','client']] as const) {
    for (const mode of ['cold-click','warm-return','hover-prefetched','back-cache-model']) {
      const samples = [];
      for (let i = 0; i < 20; i++) {
        const client = makeQueryClient(); state.client = client; state.identity = { id: 'synthetic', role };
        const args = screen === 'people' ? ['', '1'] : [];
        const options = { queryKey: queryKeys.data(state.identity, screen, ...args), queryFn: () => readJson(screenUrl(role, screen, args), state.identity), ...freshness(screen) };
        const fetchMock = vi.fn(async () => { await pause(80); return new Response('{}', { headers: { 'content-type':'application/json' } }); });
        vi.stubGlobal('fetch', fetchMock);
        const link = CacheLink({ href });
        if (mode === 'warm-return' || mode === 'back-cache-model') await client.fetchQuery(options);
        if (mode === 'hover-prefetched') { link.props.onMouseEnter({}); await client.fetchQuery(options); }
        fetchMock.mockClear();
        const start = performance.now();
        if (mode !== 'back-cache-model') link.props.onClick?.({ button:0, currentTarget:{target:'',hasAttribute:()=>false}, defaultPrevented:false });
        // Models route arrival, not an actual RSC request or React commit.
        await pause(50);
        const routeReady = performance.now() - start;
        await client.fetchQuery(options);
        samples.push({ usableMs:performance.now()-start, routeReadyMs:routeReady, dataRequests:fetchMock.mock.calls.length });
        expect(fetchMock.mock.calls.length).toBe(mode === 'cold-click' ? 1 : 0);
        client.clear();
      }
      output.push({href,mode,samples});
    }
  }
  writeFileSync(`work/navigation-${process.env.NAV_BENCH}.json`, JSON.stringify({ synthetic:true, routeDelayMs:50, dataDelayMs:80, output },null,2));
}, 120_000);
