'use client';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCacheIdentity } from './query-provider';
import { DataError, freshness, queryKeys, readJson, invalidateMutation, type CacheMutation } from '@/lib/query-cache';
import type { ScreenName, ScreenData } from '@/lib/screen-data';
import { retainOpenProjectThreads } from '@/lib/message-workspace';
export function screenUrl(role: string, screen: string, args: string[] = []) {
  const params = new URLSearchParams(screen === 'people' ? { q: args[0] || '', page: args[1] || '1' } : screen === 'task' ? { id: args[0] } : {});
  return '/api/data/' + role + '/' + screen + (params.size ? '?' + params : '');
}
export function CachedScreen<K extends ScreenName>({ screen, args = [], initial, children }: { screen: K; args?: string[]; initial?: { data: ScreenData<K>; updatedAt: number }; children: (data: ScreenData<K>) => React.ReactNode }) {
  const identity = useCacheIdentity();
  const client = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.data(identity, screen, ...args), queryFn: async ({ signal }) => {
    const data = await readJson<ScreenData<K>>(screenUrl(identity.role, screen, args), identity, signal);
    return screen === 'conversations' ? retainOpenProjectThreads(data as ScreenData<'conversations'>, client.getQueryData(queryKeys.data(identity,screen))) as ScreenData<K> : data;
  }, ...freshness(screen), initialData: initial?.data, initialDataUpdatedAt: initial?.updatedAt });
  const denied = query.error instanceof DataError && [401,403,404].includes(query.error.status);
  useEffect(() => { if (denied) client.removeQueries({ queryKey: queryKeys.scope(identity), type: 'inactive' }); }, [client, denied, identity]);
  // The home response already contains the identical task-list projection.
  useEffect(() => { if (screen === 'home' && query.data) { const tasks = (query.data as ScreenData<'home'>).allTasks; const key = queryKeys.data(identity, 'tasks'); if ((client.getQueryState(key)?.dataUpdatedAt || 0) < query.dataUpdatedAt) client.setQueryData(key, tasks, { updatedAt: query.dataUpdatedAt }); } }, [client, identity, query.data, query.dataUpdatedAt, screen]);
  if (denied || !query.data) return <div className="surface-flat p-6" role={query.error ? 'alert' : 'status'}>{query.error ? <><p>{query.error.message}</p><button className="button-secondary mt-3" onClick={() => void query.refetch()}>Retry</button></> : 'Loading…'}</div>;
  return <>{query.error && <p role="alert" className="mb-3 text-sm text-muted">Could not update this view. Showing saved data. <button onClick={() => void query.refetch()}>Retry</button></p>}{children(query.data)}</>;
}
export function useCacheMutation() { const identity = useCacheIdentity(); const client = useQueryClient(); return (mutation: CacheMutation, id?: string) => invalidateMutation(client, identity, mutation, id); }
