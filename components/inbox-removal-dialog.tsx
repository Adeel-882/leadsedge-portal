'use client';
import { useEffect, useRef } from 'react';

export function InboxRemovalDialog({ count, busy, error, cancel, confirm }: {
  count: number; busy: boolean; error: string; cancel: () => void; confirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="inbox-removal-dialog" aria-labelledby="inbox-removal-title" onCancel={event => { event.preventDefault(); if (!busy) cancel(); }}>
    <h2 id="inbox-removal-title" className="text-xl font-bold">{count === 1 ? 'Delete this conversation from your inbox?' : `Delete ${count} conversations from your inbox?`}</h2>
    <p className="mt-3 text-sm leading-6 text-muted">{count === 1 ? 'This conversation will be removed' : 'These conversations will be removed'} from your inbox. The original messages, project, and task will remain available. New messages will restore the conversation.</p>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-2">
      <button autoFocus type="button" className="button-secondary" disabled={busy} onClick={cancel}>Cancel</button>
      <button type="button" className="button-primary inbox-delete" disabled={busy} onClick={confirm}>{busy ? 'Removing…' : count === 1 ? 'Delete chat' : 'Delete selected'}</button>
    </div>
  </dialog>;
}
