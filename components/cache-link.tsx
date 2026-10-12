'use client';
import Link from 'next/link';
import { NavigationPending } from './navigation-pending';
import { useQueryClient } from '@tanstack/react-query';
import { useCacheIdentity } from './query-provider';
import { screenUrl } from './cached-screen';
import { freshness, queryKeys, readJson } from '@/lib/query-cache';
export function CacheLink(props: React.ComponentProps<typeof Link>) {
  const client = useQueryClient(); const identity = useCacheIdentity();
  const prefetch = () => {
    if (typeof props.href !== 'string') return;
    const screen = ({'/admin':'dashboard','/admin/people':'people','/admin/templates':'templates','/admin/meetings':'meetings','/portal':'home','/portal/tasks':'tasks','/portal/meetings':'meetings'} as Record<string,string>)[props.href];
    if(!screen) return;
    const args = screen === 'people' ? ['', '1'] : [];
    void client.prefetchQuery({queryKey:queryKeys.data(identity,screen,...args),queryFn:({signal})=>readJson(screenUrl(identity.role,screen,args),identity,signal),...freshness(screen)});
  };
  return <Link {...props} prefetch={false} onMouseEnter={event=>{props.onMouseEnter?.(event);prefetch();}} onFocus={event=>{props.onFocus?.(event);prefetch();}} onClick={event=>{
    props.onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.currentTarget.hasAttribute('download') || (event.currentTarget.target && event.currentTarget.target !== '_self')) return;
    // A tap/direct click may have no hover or focus lead time. Start the same
    // authorized data query alongside RSC navigation, not after it commits.
    // QueryClient deduplicates this with hover and the destination's useQuery.
    prefetch();
  }}>{props.children}<NavigationPending /></Link>;
}
