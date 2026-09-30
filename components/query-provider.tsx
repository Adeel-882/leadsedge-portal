'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RealtimeProvider } from './realtime-provider';
import { makeQueryClient, type CacheIdentity } from '@/lib/query-cache';
const IdentityContext = createContext<CacheIdentity | null>(null);
// Browser-only lifetime: never populate a server singleton with private data.
let browserSession: { key: string; client: QueryClient } | undefined;
export function sessionQueryClient(identity: CacheIdentity) {
  if (typeof window === 'undefined') return makeQueryClient();
  const key = identity.id + ':' + identity.role;
  if (browserSession?.key !== key) {
    browserSession?.client.clear();
    browserSession = { key, client: makeQueryClient() };
  }
  return browserSession.client;
}
export function QueryProvider({ identity, children }: { identity: CacheIdentity; children: React.ReactNode }) {
  return <SessionProvider key={identity.id + ':' + identity.role} identity={identity}>{children}</SessionProvider>;
}
function SessionProvider({ identity, children }: { identity: CacheIdentity; children: React.ReactNode }) {
  const [client] = useState(() => sessionQueryClient(identity));
  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('leadsedge-session') : null;
    const clear = () => { window.dispatchEvent(new Event('leadsedge:session-ending')); client.clear(); };
    const logout = () => { clear(); channel?.postMessage('logout'); };
    if (channel) channel.onmessage = (event) => { if (event.data === 'logout') { clear(); window.location.reload(); } };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) { clear(); window.location.reload(); } };
    const onClick = (event: MouseEvent) => { if (event.target instanceof Element && event.target.closest('a[href="/auth/sign-out"]')) logout(); };
    // No private cache survives a full-document departure / BFCache restoration.
    document.addEventListener('click', onClick, true);
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', onPageShow);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('pagehide', clear); window.removeEventListener('pageshow', onPageShow); channel?.close(); };
  }, [client]);
  return <IdentityContext.Provider value={identity}><QueryClientProvider client={client}><RealtimeProvider identity={identity}>{children}</RealtimeProvider></QueryClientProvider></IdentityContext.Provider>;
}
export function useCacheIdentity() { const identity = useContext(IdentityContext); if (!identity) throw new Error('Authenticated query provider required.'); return identity; }
