'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCacheIdentity } from '../query-provider';
import { freshness, queryKeys, readJson } from '@/lib/query-cache';
import type { ProjectActivityPage } from '@/lib/project-activity';
import { formatTime } from '@/lib/format';

export function ProjectActivity({ projectId }: { projectId: string }) {
  const identity = useCacheIdentity();
  const query = useInfiniteQuery({
    queryKey: queryKeys.data(identity, 'project-activity', projectId),
    queryFn: ({ pageParam, signal }) => readJson<ProjectActivityPage>(`/api/admin/projects/${projectId}/activity${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`, identity, signal),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.next,
    ...freshness('project-activity'),
  });
  const items = query.data?.pages.flatMap(page => page.items) || [];
  return <section className="surface-flat overflow-hidden">
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h3 className="section-title">Recent activity</h3><p className="section-description">Latest updates for this project.</p></div><button className="text-xs font-semibold text-teal" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh activity</button></div>
    {items.map(item => <div key={item.id} className="flex gap-3 border-b border-line px-5 py-4"><span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-teal" aria-hidden /><div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-sm leading-5 text-muted">{item.description}</p><time dateTime={item.createdAt} className="mt-1.5 block text-[11px] text-muted">{formatTime(item.createdAt)}</time></div></div>)}
    {query.isPending && <p className="p-5 text-sm text-muted">Loading activity…</p>}
    {query.isError && <p role="alert" className="p-5 text-sm">Could not load activity. <button onClick={() => void query.refetch()}>Retry</button></p>}
    {!query.isPending && !query.isError && !items.length && <p className="p-5 text-sm text-muted">No recent activity yet.</p>}
    {query.hasNextPage && <div className="p-4"><button className="button-secondary" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load earlier activity'}</button></div>}
  </section>;
}
