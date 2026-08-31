'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatCircleDots, PaperPlaneTilt } from '@phosphor-icons/react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { notifyUnreadCountsChanged } from '@/components/unread-counts';
import { formatTime, initials } from '@/lib/format';
import type { ConversationMessage } from '@/lib/types';

export function Conversation({ kind, resourceId, viewerId, initialMessages, compact = false }: { kind: 'task' | 'project'; resourceId: string; viewerId: string; initialMessages: ConversationMessage[]; compact?: boolean }) {
  const router = useRouter();
  const [pendingMessages, setPendingMessages] = useState<ConversationMessage[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => {
    const known = new Set(initialMessages.map((message) => message.id));
    return [...initialMessages, ...pendingMessages.filter((message) => !known.has(message.id))];
  }, [initialMessages, pendingMessages]);
  const markRead = useCallback(async () => {
    const response = await fetch(`/api/messages/${kind}/${resourceId}`, { method: 'PATCH' });
    if (response.ok) {
      const result = await response.json() as { readMessages?: number; readNotifications?: number };
      notifyUnreadCountsChanged({ messages: result.readMessages || 0, notifications: result.readNotifications || 0 });
    }
  }, [kind, resourceId]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages]);
  useEffect(() => {
    void markRead();
    // Realtime delivers new messages. This interval is only a fallback for a
    // dropped subscription, so it does no work while the tab is hidden.
    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void markRead().then(() => router.refresh());
    }, 60000);
    return () => window.clearInterval(poll);
  }, [markRead, router]);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const table = kind === 'task' ? 'task_messages' : 'project_messages';
    const field = kind === 'task' ? 'task_id' : 'project_id';
    const channel = supabase.channel(`${kind}-conversation-${resourceId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `${field}=eq.${resourceId}` }, (payload: { new: Record<string, unknown> }) => {
      // A message this viewer just sent is already rendered optimistically, so
      // refetching the whole route for it only adds latency.
      if (payload.new.message_type === 'user' && payload.new.sender_id !== viewerId) void markRead().then(() => router.refresh());
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [kind, markRead, resourceId, router, viewerId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true); setError('');
    const response = await fetch(`/api/messages/${kind}/${resourceId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, attachmentUrl: null }) });
    const result = await response.json() as { error?: string; message?: ConversationMessage };
    if (!response.ok) setError(result.error || 'Message could not be sent.');
    else if (result.message) { setPendingMessages((items) => [...items, result.message!]); setBody(''); }
    setSending(false);
  }

  return <section className={`conversation ${compact ? 'min-h-[360px]' : ''}`}><div ref={listRef} className="message-list">{messages.length ? messages.map((message) => { const mine = message.senderId === viewerId; return <div key={message.id} className={`message-row ${mine ? 'mine' : ''}`}><span className={`avatar h-8 w-8 ${mine ? 'bg-[#dff2ee] text-teal' : 'bg-[#e9edeb] text-[#53645f]'}`}>{initials(message.senderName)}</span><div><p className={`mb-1 text-[10px] text-muted ${mine ? 'text-right' : ''}`}>{mine ? 'You' : message.senderName} <span aria-hidden>•</span> {formatTime(message.createdAt)}</p><div className="message-bubble">{message.body}</div></div></div>; }) : <div className="m-auto px-5 text-center"><ChatCircleDots className="mx-auto text-[#9eaaa6]" size={28} aria-hidden /><p className="mt-3 text-sm font-semibold">No messages yet</p><p className="mt-1 text-sm leading-6 text-muted">Start the conversation with a clear update or question.</p></div>}</div><form className="message-composer" onSubmit={send}><input className="field-input min-w-0 flex-1" aria-label="Message" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message" maxLength={5000} /><button className="button-primary px-3 sm:px-4" aria-label={sending ? 'Sending message' : 'Send message'} disabled={sending || !body.trim()}><PaperPlaneTilt size={16} weight="fill" aria-hidden /><span className="hidden sm:inline">{sending ? 'Sending...' : 'Send'}</span></button></form>{error && <p role="alert" className="bg-[#faeeee] px-4 py-2 text-xs text-[#8f3030]">{error}</p>}</section>;
}
