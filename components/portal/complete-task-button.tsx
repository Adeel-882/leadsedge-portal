'use client';
import { useCacheMutation } from '@/components/cached-screen';

import { useState } from 'react';
import { CheckCircle, X } from '@phosphor-icons/react';

export function CompleteTaskButton({ taskId }: { taskId: string }) {
  const invalidate = useCacheMutation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function complete() {
    setSaving(true);
    setError('');
    const response = await fetch(`/api/portal/tasks/${taskId}/complete`, { method: 'POST' });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Task could not be completed.');
    else {
      setOpen(false);
      await invalidate('task', taskId);
    }
    setSaving(false);
  }

  return <>
    <button className="button-primary w-full sm:w-auto" disabled={saving} onClick={() => setOpen(true)}><CheckCircle size={17} weight="bold" aria-hidden />Mark as completed</button>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="complete-lead-title"><div className="modal-card max-w-lg"><div className="flex items-start justify-between gap-5"><div><p className="page-eyebrow">Confirm completion</p><h2 id="complete-lead-title" className="text-xl font-bold">Mark this lead as completed?</h2></div><button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} aria-hidden /></button></div><p className="mt-3 text-sm leading-6 text-muted">Your administrator will be notified. If feedback is scheduled, its delay starts immediately after confirmation.</p>{error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}<div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><button className="button-secondary" disabled={saving} onClick={() => setOpen(false)}>Keep active</button><button className="button-primary" disabled={saving} onClick={complete}>{saving ? 'Completing...' : 'Confirm completion'}</button></div></div></div>}
  </>;
}
