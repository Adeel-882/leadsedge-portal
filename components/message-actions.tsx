'use client';
import { useEffect, useRef, useState } from 'react';
import { DotsThree, PencilSimple, Trash } from '@phosphor-icons/react';
import { MessageBody } from './message-body';
import { MessageInput } from './message-input';
import { canMutateMessage, DELETED_MESSAGE } from '@/lib/message-edit';
import type { ConversationMessage } from '@/lib/types';

export function MessageActions({ message, viewerId, kind, resourceId, saved, conflicted }: {
  message: ConversationMessage; viewerId: string; kind: 'task' | 'project'; resourceId: string;
  saved: (message: ConversationMessage) => void; conflicted: () => void;
}) {
  const [edit, setEdit] = useState<{body: string; version: number} | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!confirm) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [confirm]);
  async function persist(operation: 'edit' | 'delete') {
    if (busy || (operation === 'edit' && !edit?.body.trim())) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/messages/${kind}/${resourceId}/${message.id}`, {
        method: 'PATCH', headers: {'Content-Type': 'application/json', 'x-cache-viewer': viewerId},
        body: JSON.stringify(operation === 'edit' ? {operation, version: edit!.version, body: edit!.body} : {operation, version: message.version}),
      });
      const result = await response.json();
      if (!response.ok || !result.message) {
        if (response.status === 409) conflicted();
        throw new Error(result.error || 'Message could not be changed.');
      }
      saved(result.message);
      if (mounted.current) { setEdit(null); setConfirm(false); }
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Message could not be changed.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  const allowed = canMutateMessage(message, viewerId);
  return <div className="message-content">
    {edit && allowed ? <div className="message-inline-editor">
      <MessageInput autoFocus aria-label="Edit message" value={edit.body} maxLength={5000} onChange={e => setEdit({...edit, body:e.target.value})} onKeyDown={e => { if (e.key === 'Escape' && !busy) { setEdit(null); setError(''); } }} />
      <div className="message-edit-buttons"><button type="button" className="button-secondary" disabled={busy} onClick={() => { setEdit(null); setError(''); }}>Cancel</button><button type="button" className="button-primary" disabled={busy || !edit.body.trim()} onClick={() => void persist('edit')}>{busy ? 'Saving…' : 'Save'}</button></div>
    </div> : <div className={`message-bubble ${message.deletedAt ? 'message-deleted' : ''}`}>{message.deletedAt ? DELETED_MESSAGE : <MessageBody body={message.body} />}</div>}
    {allowed && !edit && <details className="message-actions-menu">
      <summary aria-label="Message actions"><DotsThree size={20} weight="bold" aria-hidden /></summary>
      <div className="message-actions-popover">
        <button type="button" onClick={e => { const menu=e.currentTarget.closest('details'); menu?.removeAttribute('open'); menu?.querySelector('summary')?.focus(); setError(''); setEdit({body:message.body,version:message.version!}); }}><PencilSimple size={16} aria-hidden />Edit message</button>
        <button type="button" className="text-danger" onClick={e => { const menu=e.currentTarget.closest('details'); menu?.removeAttribute('open'); menu?.querySelector('summary')?.focus(); setError(''); setConfirm(true); }}><Trash size={16} aria-hidden />Delete message</button>
      </div>
    </details>}
    {error && !confirm && <p role="alert" className="message-action-error">{error}</p>}
    {confirm && <dialog ref={dialog} className="message-delete-dialog" aria-labelledby={`delete-message-${message.id}`} aria-describedby={`delete-message-description-${message.id}`} onCancel={e => { e.preventDefault(); if (!busy) setConfirm(false); }}>
      <div className="message-delete-icon"><Trash size={24} aria-hidden /></div>
      <h2 id={`delete-message-${message.id}`} className="text-xl font-bold">Delete this message?</h2>
      <p id={`delete-message-description-${message.id}`} className="mt-3 text-sm leading-6 text-muted">This message will no longer be visible in the conversation for you or the recipient.</p>
      {error && <p role="alert" className="message-action-error">{error}</p>}
      <div className="message-edit-buttons"><button autoFocus type="button" className="button-secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="button-danger" disabled={busy} onClick={() => void persist('delete')}>{busy ? 'Deleting…' : 'Delete message'}</button></div>
    </dialog>}
  </div>;
}
