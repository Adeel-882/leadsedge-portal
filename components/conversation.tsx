'use client';

import { Fragment, FormEvent, useLayoutEffect, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCacheIdentity } from '@/components/query-provider';
import { DataError, freshness, queryKeys, readJson } from '@/lib/query-cache';
import { appendMessage, removeMessage, mergeNewest, mergeGap, flattenMessages, MAX_MESSAGE_PAGES, type MessagePage, type MessagePages } from '@/lib/message-cache';
import { ChatCircleDots, PaperPlaneTilt } from '@phosphor-icons/react';
import { useRealtimeSync } from '@/components/realtime-provider';
import { initials } from '@/lib/format';
import { messageTimeline } from '@/lib/message-time';
import { useMessageClock } from '@/components/use-message-clock';
import type { ConversationMessage } from '@/lib/types';

type ConversationProps = {
  kind: 'task' | 'project';
  resourceId: string;
  viewerId: string;
  initialMessages?: ConversationMessage[];
  compact?: boolean;
  onConversationRead?: (readMessages: number, readNotifications: number) => void;
  onMessageSent?: (message: ConversationMessage) => void;
};

export function Conversation({ kind, resourceId, viewerId, initialMessages, compact = false, onConversationRead, onMessageSent }: ConversationProps) {
  const identity = useCacheIdentity();
  const sync = useRealtimeSync();
  const client = useQueryClient();
  const key = useMemo(() => queryKeys.messages(identity, kind, resourceId), [identity, kind, resourceId]);
  const history = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => readJson<MessagePage>('/api/messages/' + kind + '/' + resourceId + (pageParam ? '?before=' + encodeURIComponent(pageParam) : ''), identity, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last, pages) => pages.length < MAX_MESSAGE_PAGES && last.hasMore ? last.messages[0]?.createdAt : undefined,
    initialData: initialMessages === undefined ? undefined : { pages: [{messages: initialMessages, hasMore: initialMessages.length === 50}], pageParams: [null] },
    ...freshness('messages'),
    refetchOnReconnect: false,
    refetchOnMount: false, // Mounted history reconciles only its newest page below.
  });
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [revoked, setRevoked] = useState(false);
  const [loadingGap, setLoadingGap] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => flattenMessages(history.data), [history.data]);
  const clock = useMessageClock();
  const timeline = useMemo(() => clock ? messageTimeline(messages, clock.split('|')[0], new Date()) : messages.map(message => ({ message, time: message.id.startsWith('pending-') ? 'Sending…' : '—', day: null, dayKey: null })), [messages, clock]);
  const earlierScroll = useRef<{ top: number; height: number } | null>(null);
  const refreshLatest = useCallback(async () => {
    try {
      const next = await readJson<MessagePage>('/api/messages/' + kind + '/' + resourceId, identity);
      client.setQueryData<MessagePages>(key, current => mergeNewest(current,next));
    } catch (failure) { if (failure instanceof DataError && [401,403,404].includes(failure.status)) setRevoked(true); setError(failure instanceof Error ? failure.message : 'Unable to refresh conversation.'); }
  }, [client, identity, key, kind, resourceId]);
  const markRead = useCallback(async () => sync.withRead(async () => {
    const response = await fetch('/api/messages/' + kind + '/' + resourceId, { method: 'PATCH', headers: { 'x-cache-viewer': identity.id } });
    if (!response.ok) { if ([401,403,404].includes(response.status)) setRevoked(true); setError('Conversation could not be marked as read.'); throw new Error('Read acknowledgment failed'); }
    const result = await response.json() as { readMessages?: number; readNotifications?: number };
    // Counts are reconciled authoritatively after the read; receipt events never subtract twice.
    if (!client.getQueryData(queryKeys.data(identity,'conversations'))) onConversationRead?.(result.readMessages || 0, result.readNotifications || 0);
    return result.readMessages || 0;
  }), [client, identity, kind, onConversationRead, resourceId, sync]);
  const hasHistory = Boolean(history.data);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (earlierScroll.current) {
      if (history.isFetchingNextPage || loadingGap) return;
      list.scrollTop = earlierScroll.current.top + list.scrollHeight - earlierScroll.current.height;
      earlierScroll.current = null;
    } else list.scrollTo({ top: list.scrollHeight });
  }, [messages, clock, history.isFetchingNextPage, loadingGap]);
  useEffect(() => {
    if (!hasHistory) return;
    const unregister = sync.register(kind, resourceId, { read:markRead, refresh:refreshLatest });
    return unregister;
  }, [client, hasHistory, key, kind, markRead, refreshLatest, resourceId, sync]);

  const sendMessage = useMutation({
    mutationFn: async (text: string) => {
      const response = await fetch('/api/messages/' + kind + '/' + resourceId, { method: 'POST', headers: { 'Content-Type':'application/json', 'x-cache-viewer':identity.id }, body: JSON.stringify({body:text, attachmentUrl:null}) });
      const result = await response.json() as {error?:string;message?:ConversationMessage};
      if (!response.ok || !result.message) throw new Error(result.error || 'Message could not be sent.');
      return result.message;
    },
    onMutate: async (text) => {
      await client.cancelQueries({queryKey:key});
      const temporary: ConversationMessage = {id:'pending-'+crypto.randomUUID(),senderId:viewerId,senderName:'You',senderRole:identity.role,body:text,attachmentUrl:null,createdAt:new Date().toISOString()};
      sync.beginSend(kind,resourceId,temporary.id);
      client.setQueryData<MessagePages>(key,current=>appendMessage(current,temporary));
      return {id:temporary.id};
    },
    onSuccess: (message,_text,context) => {
      client.setQueryData<MessagePages>(key,current=>appendMessage(removeMessage(current,context.id),message));
      client.setQueryData<{threads:import('@/lib/types').MessageWorkspaceThread[]}>(queryKeys.data(identity,'conversations'), current => current && {...current, threads:current.threads.map(thread => thread.key === kind+':'+resourceId ? {...thread,preview:message.body,senderName:'You',lastMessageAt:message.createdAt} : thread)});
      sync.finishSend(kind,resourceId,context.id);
      onMessageSent?.(message);
      setBody('');
    },
    onError: (failure,_text,context) => {
      if(context) client.setQueryData<MessagePages>(key,current=>removeMessage(current,context.id));
      if(context) sync.finishSend(kind,resourceId,context.id);
      setError(failure.message);
    },
  });
  const sending=sendMessage.isPending;
  const hasMore=history.hasNextPage || Boolean(history.data?.pages[0]?.gap);
  const loadingEarlier=history.isFetchingNextPage || loadingGap;
  async function send(event: FormEvent) { event.preventDefault(); if(!body.trim() || sending) return; setError(''); sendMessage.mutate(body.trim()); }
  async function loadEarlier() {
    setError('');
    if (listRef.current) earlierScroll.current = { top: listRef.current.scrollTop, height: listRef.current.scrollHeight };
    const gap=history.data?.pages[0]?.gap;
    if(!gap) { await history.fetchNextPage(); return; }
    setLoadingGap(true);
    try {
      const page=await readJson<MessagePage>('/api/messages/'+kind+'/'+resourceId+'?before='+encodeURIComponent(gap.before),identity);
      client.setQueryData<MessagePages>(key,current=>current?mergeGap(current,page):current);
    } catch(failure) { setError(failure instanceof Error?failure.message:'Could not load earlier messages.'); }
    finally { setLoadingGap(false); }
  }
  const denied=history.error instanceof DataError && [401,403,404].includes(history.error.status);
  if(denied || revoked) return <p role="alert" className="p-5">This conversation is no longer available.</p>;
  if(history.isPending) return <p role="status" className="p-5">Loading conversation…</p>;
  return <section className={`conversation ${compact ? 'min-h-[360px]' : ''}`}><div ref={listRef} className="message-list">{history.data && history.data.pages.length >= MAX_MESSAGE_PAGES && <p className="text-center text-xs text-muted">Showing the latest 500 messages.</p>}{hasMore && <button type="button" className="button-ghost mx-auto my-2" onClick={loadEarlier} disabled={loadingEarlier}>{loadingEarlier ? 'Loading…' : 'Load earlier messages'}</button>}{messages.length ? timeline.map(({ message, time, day, dayKey }) => { const mine = message.senderId === viewerId; return <Fragment key={message.id}>{day && <div className="message-date-separator" role="separator" aria-label={day}><time dateTime={dayKey || undefined}>{day}</time></div>}<div className={`message-row ${mine ? 'mine' : ''}`}><span className={`avatar h-8 w-8 ${mine ? 'bg-brand-soft text-brand-text' : 'bg-surface-strong text-muted-strong'}`}>{initials(message.senderName)}</span><div><p className={`mb-1 text-[10px] text-muted ${mine ? 'text-right' : ''}`}>{mine ? 'You' : message.senderName}</p><div className="message-bubble">{message.body}</div><time className={`message-time ${mine ? 'text-right' : 'text-left'}`} dateTime={message.id.startsWith('pending-') ? undefined : message.createdAt}>{time}</time></div></div></Fragment>; }) : <div className="m-auto px-5 text-center"><ChatCircleDots className="mx-auto text-muted" size={28} aria-hidden /><p className="mt-3 text-sm font-semibold">No messages yet</p><p className="mt-1 text-sm leading-6 text-muted">Start the conversation with a clear update or question.</p></div>}</div><form className="message-composer" onSubmit={send}><input className="field-input min-w-0 flex-1" aria-label="Message" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message" maxLength={5000} /><button className="button-primary px-3 sm:px-4" aria-label={sending ? 'Sending message' : 'Send message'} disabled={sending || !body.trim()}><PaperPlaneTilt size={16} weight="fill" aria-hidden /><span className="hidden sm:inline">{sending ? 'Sending...' : 'Send'}</span></button></form>{(error || history.error) && <p role="alert" className="bg-danger-soft px-4 py-2 text-xs text-danger">{error || history.error?.message} <button type="button" onClick={() => void history.refetch()}>Retry</button></p>}</section>;
}
