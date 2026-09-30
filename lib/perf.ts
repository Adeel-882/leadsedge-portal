import { headers } from 'next/headers';

export function performanceDebugEnabled() {
  return process.env.PERF_DEBUG === 'true';
}

export async function performanceRequestId() {
  try { return (await headers()).get('x-request-id') || 'untracked'; }
  catch { return 'untracked'; }
}

export async function measureServerOperation<T>(name: string, operation: () => PromiseLike<T>): Promise<T> {
  if (!performanceDebugEnabled()) return operation();
  const requestId = await performanceRequestId();
  const started = performance.now();
  try { return await operation(); }
  finally { console.info('[PERF]', JSON.stringify({ requestId, operation: name, durationMs: Math.round((performance.now() - started) * 10) / 10 })); }
}

export function createTimedSupabaseFetch(requestId: string): typeof fetch {
  return async (input, init) => {
    const method = (init?.method || (typeof input === 'string' || input instanceof URL ? 'GET' : input.method) || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let pathname = '';
    try { pathname = new URL(url).pathname; } catch { /* Invalid URLs bypass deduplication. */ }
    const readOnlyRpc = pathname === '/rest/v1/rpc/get_unread_counts' || pathname === '/rest/v1/rpc/get_portal_bootstrap';
    const dedupeAllowed = requestId !== 'untracked' && (method === 'GET' || (method === 'POST' && readOnlyRpc));
    const body = typeof init?.body === 'string' ? init.body : '';
    const cacheKey = `${requestId}:${method}:${url}:${body}`;
    const store = requestReadStore();
    const existing = dedupeAllowed ? store.get(cacheKey) : undefined;
    if (existing) return (await existing).clone();
    const started = performance.now();
    const pending = fetch(input, init);
    if (dedupeAllowed) {
      // Bound the cross-environment bridge even if a runtime is flooded with
      // unique request IDs. Normal entries are tiny and live for ten seconds.
      if (store.size >= 1_000) store.delete(store.keys().next().value!);
      store.set(cacheKey, pending);
      const cleanup = setTimeout(() => store.delete(cacheKey), 10_000);
      void pending.catch(() => {
        clearTimeout(cleanup);
        store.delete(cacheKey);
      });
    }
    try { return (await pending).clone(); }
    finally {
      if (performanceDebugEnabled()) {
        let resource = 'supabase';
        try { resource = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname; } catch { /* Redacted fallback. */ }
        console.info('[PERF]', JSON.stringify({ requestId, operation: 'supabase.http', resource, durationMs: Math.round((performance.now() - started) * 10) / 10 }));
      }
    }
  };
}

const requestReadStoreSymbol = Symbol.for('leadsedge.request-read-store');
function requestReadStore(): Map<string, Promise<Response>> {
  const shared = globalThis as typeof globalThis & { [requestReadStoreSymbol]?: Map<string, Promise<Response>> };
  shared[requestReadStoreSymbol] ??= new Map();
  return shared[requestReadStoreSymbol];
}
