'use client';

import { useQuery } from '@tanstack/react-query';
import { useCacheIdentity } from './query-provider';
import { freshness, queryKeys, readJson } from '@/lib/query-cache';

export const unreadCountsChangedEvent = 'leadsedge:unread-counts-changed';

export function notifyUnreadCountsChanged(delta?: { messages?: number; notifications?: number }) {
  window.dispatchEvent(new CustomEvent(unreadCountsChangedEvent, { detail: delta }));
}

export function useUnreadCounts(_viewerId: string, initialMessageCount: number, initialNotificationCount: number) {
  const identity = useCacheIdentity();
  return useQuery({ queryKey: queryKeys.data(identity,'unread'), queryFn: ({signal}) => readJson<{messages:number;notifications:number}>('/api/unread-counts',identity,signal), ...freshness('unread'), initialData:{messages:initialMessageCount,notifications:initialNotificationCount} }).data;
}
