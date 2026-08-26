'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
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
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages]);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const table = kind === 'task' ? 'task_messages' : 'project_messages';
    const field = kind === 'task' ? 'task_id' : 'project_id';
    const channel = supabase.channel(`${kind}-conversation-${resourceId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `${field}=eq.${resourceId}` }, () => router.refresh()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [kind, resourceId, router]);

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

  return <section className={`conversation ${compact ? 'min-h-[360px]' : ''}`}><div ref={listRef} className="message-list">{messages.length ? messages.map((message) => { const mine = message.senderId === viewerId; return <div key={message.id} className={`message-row ${mine ? 'mine' : ''}`}><span className={`avatar h-8 w-8 ${mine ? 'bg-[#dff2ee] text-teal' : 'bg-[#e9edf3] text-[#536279]'}`}>{initials(message.senderName)}</span><div><p className={`mb-1 text-[11px] text-muted ${mine ? 'text-right' : ''}`}>{message.senderName} · {formatTime(message.createdAt)}</p><div className="message-bubble">{message.body}</div></div></div>; }) : <div className="m-auto text-center"><p className="font-semibold">No messages yet</p><p className="mt-1 text-sm text-muted">Start a focused conversation here.</p></div>}</div><form className="message-composer" onSubmit={send}><input className="field-input flex-1" aria-label="Message" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message…" maxLength={5000} /><button className="button-primary" disabled={sending || !body.trim()}>{sending ? 'Sending…' : 'Send'}</button></form>{error && <p className="px-4 pb-3 text-xs text-[#b33e3e]">{error}</p>}</section>;
}
