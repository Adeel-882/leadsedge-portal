import { QueryClient } from '@tanstack/react-query';
import type { Role } from './types';
export type CacheIdentity = { id: string; role: Role };
export const queryKeys = {
  scope: (identity: CacheIdentity) => ['private', identity.id, identity.role] as const,
  data: (identity: CacheIdentity, resource: string, ...args: (string | number)[]) => [...queryKeys.scope(identity), resource, ...args] as const,
  messages: (identity: CacheIdentity, kind: string, id: string) => queryKeys.data(identity, 'messages', kind, id),
};
export function freshness(resource: string) {
  const staleTime = resource === 'templates' ? 300_000 : ['projects', 'people','conversations','unread'].includes(resource) ? 120_000 : resource === 'messages' ? 300_000 : 45_000;
  return { staleTime, gcTime: resource === 'templates' ? 900_000 : 600_000, refetchOnWindowFocus: false, refetchOnReconnect: !['messages','conversations','unread','tasks','task','home','dashboard'].includes(resource) };
}
export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: 600_000 }, mutations: { retry: false } } });
}
export class DataError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function readJson<T>(url: string, identity: CacheIdentity, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store', headers: { 'x-cache-viewer': identity.id } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new DataError(result.error || 'Unable to load data. Please retry.', response.status);
  return result;
}
export type CacheMutation = 'project' | 'person' | 'template' | 'task' | 'meeting';
export function affectedResources(mutation: CacheMutation) {
  return { project: ['dashboard', 'projects', 'people', 'home', 'conversations'], person: ['people', 'dashboard', 'projects'], template: ['templates', 'template'], task: ['task', 'tasks', 'home', 'dashboard', 'project-activity'], meeting: ['meetings', 'home', 'dashboard', 'project-activity'] }[mutation];
}
export async function invalidateMutation(client: QueryClient, identity: CacheIdentity, mutation: CacheMutation, id?: string) {
  const resources = affectedResources(mutation);
  await client.invalidateQueries({ predicate: (query) => {
    const key = query.queryKey;
    return key[0] === 'private' && key[1] === identity.id && key[2] === identity.role && resources.includes(String(key[3])) && !(key[3] === 'task' && id && key[4] !== id);
  } });
}
