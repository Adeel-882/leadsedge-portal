'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const unreadCountsChangedEvent = 'leadsedge:unread-counts-changed';

export function notifyUnreadCountsChanged(delta?: { messages?: number; notifications?: number }) {
  window.dispatchEvent(new CustomEvent(unreadCountsChangedEvent, { detail: delta }));
}

export function useUnreadCounts(viewerId: string, initialMessageCount: number, initialNotificationCount: number) {
  const [counts, setCounts] = useState({ messages: initialMessageCount, notifications: initialNotificationCount });
  const debounceRef = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/unread-counts', { cache: 'no-store' });
    if (!response.ok) return;
    const next = await response.json() as { messages: number; notifications: number };
    setCounts(next);
  }, []);

  useEffect(() => {
    const sync = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => { void refresh(); }, 150);
    };
    const onChanged = (event: Event) => {
      const delta = (event as CustomEvent<{ messages?: number; notifications?: number }>).detail;
      if (delta) setCounts((current) => ({
        messages: Math.max(0, current.messages - (delta.messages || 0)),
        notifications: Math.max(0, current.notifications - (delta.notifications || 0)),
      }));
      else sync();
    };
    // Realtime is the primary signal. Polling is only a reliability fallback, so
    // it stays idle while the tab is hidden and catches up once it is visible again.
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    const pollWhenVisible = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener(unreadCountsChangedEvent, onChanged);
    document.addEventListener('visibilitychange', onVisible);
    const poll = window.setInterval(pollWhenVisible, 60000);
    const supabase = createSupabaseBrowserClient();
    const channel = supabase?.channel(`unread-counts-${viewerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${viewerId}` }, sync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_read_receipts', filter: `recipient_id=eq.${viewerId}` }, sync)
      .subscribe();
    return () => {
      window.removeEventListener(unreadCountsChangedEvent, onChanged);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(poll);
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [refresh, viewerId]);

  return counts;
}
