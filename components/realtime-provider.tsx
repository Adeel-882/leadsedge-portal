'use client';
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RealtimeSync } from '@/lib/realtime-sync';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { CacheIdentity } from '@/lib/query-cache';

const RealtimeContext = createContext<RealtimeSync | null>(null);
export function RealtimeProvider({ identity, children }: { identity: CacheIdentity; children: React.ReactNode }) {
  const client = useQueryClient();
  const [sync] = useState(() => new RealtimeSync(client, identity, () => document.visibilityState === 'visible'));
  const status = useSyncExternalStore(sync.subscribeStatus, sync.getStatus, () => 'connecting');
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (supabase) void sync.start(supabase);
    const reconcile = () => { if (document.visibilityState === 'visible') sync.reconcile(); };
    const changed = () => sync.communicationChanged();
    const stop = () => sync.stop();
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('leadsedge:unread-counts-changed', changed);
    window.addEventListener('leadsedge:session-ending', stop);
    window.addEventListener('pagehide', stop);
    return () => {
      sync.stop();
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('leadsedge:unread-counts-changed', changed);
      window.removeEventListener('leadsedge:session-ending', stop);
      window.removeEventListener('pagehide', stop);
    };
  }, [sync]);
  return <RealtimeContext.Provider value={sync}><span hidden data-realtime-status={status} data-realtime-channel-count={sync.getChannelCount()}/>{status === 'degraded' && <div role="status" className="bg-warning-soft px-4 py-2 text-sm">Live updates interrupted. Reconnecting… <button onClick={() => { const supabase=createSupabaseBrowserClient(); if(supabase) void sync.start(supabase); sync.reconcile(); }}>Refresh current data</button></div>}{children}</RealtimeContext.Provider>;
}
export function useRealtimeSync() { const sync=useContext(RealtimeContext); if(!sync) throw new Error('Authenticated realtime provider required.'); return sync; }
