'use client';
import { useQuery } from '@tanstack/react-query';
import { useCacheIdentity } from './query-provider';
import { freshness, queryKeys, readJson } from '@/lib/query-cache';
import { countTaskAttention } from '@/lib/task-attention';
import type { ClientTaskSummary } from '@/lib/types';

export function useTaskAttentionCount() {
  const identity = useCacheIdentity();
  const query = useQuery({
    queryKey: queryKeys.data(identity, 'tasks'),
    queryFn: ({ signal }) => readJson<ClientTaskSummary[]>('/api/data/client/tasks', identity, signal),
    ...freshness('tasks'),
  });
  return query.data ? countTaskAttention(query.data) : 0;
}
