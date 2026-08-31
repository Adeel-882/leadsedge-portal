'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaperPlaneTilt, PencilSimple, Play, Prohibit, X } from '@phosphor-icons/react';
import { FeedbackFormEditor } from '@/components/feedback-form-editor';
import { RichTextEditor } from '@/components/rich-text-editor';
import { leadFeedbackForm } from '@/lib/demo-data';
import type { ClientSummary, FeedbackDelayUnit, FormField, TaskRecord, TaskStatus } from '@/lib/types';

export function TaskEditor({ task, clients, allowMinuteDelays = false }: { task: TaskRecord; clients: ClientSummary[]; allowMinuteDelays?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId || '');
  const [clientVisible, setClientVisible] = useState(task.clientVisible);
  const [requiresCompletion, setRequiresCompletion] = useState(task.requiresCompletion);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [feedbackEnabled, setFeedbackEnabled] = useState(task.feedbackEnabled);
  const [delayValue, setDelayValue] = useState(task.feedbackDelayValue || 1);
  const [delayUnit, setDelayUnit] = useState<FeedbackDelayUnit>(task.feedbackDelayUnit || 'days');
  const [formSchema, setFormSchema] = useState<FormField[]>(task.formSchema || leadFeedbackForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(nextStatus = status) {
    setSaving(true); setError('');
    const response = await fetch(`/api/admin/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, assigneeId: assigneeId || null, clientVisible, requiresCompletion, status: nextStatus, feedback: { enabled: feedbackEnabled, delayValue, delayUnit, formSchema } }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Task could not be saved.');
    else { setStatus(nextStatus); setOpen(false); router.refresh(); }
    setSaving(false);
  }

  async function activate() {
    if (!window.confirm('Activate this lead assignment for the client?')) return;
    await save('active');
  }

  async function requestFeedback() {
    if (!window.confirm('Send the feedback form now? This makes it immediately available to the client.')) return;
    setSaving(true); setError('');
    const response = await fetch(`/api/admin/tasks/${task.id}/feedback`, { method: 'POST' });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Feedback could not be requested.'); else router.refresh();
    setSaving(false);
  }

  async function cancelFeedback() {
    if (!window.confirm('Cancel this pending feedback request? The client will no longer be prompted.')) return;
    setSaving(true); setError('');
    const response = await fetch(`/api/admin/tasks/${task.id}/feedback`, { method: 'DELETE' });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Feedback could not be cancelled.'); else router.refresh();
    setSaving(false);
  }

  return <>
    <div className="flex flex-wrap gap-2">
      <button className="button-secondary" onClick={() => setOpen(true)}><PencilSimple size={15} aria-hidden />Edit task</button>
      {task.status === 'draft' && <button className="button-primary" onClick={activate}><Play size={15} weight="fill" aria-hidden />Activate task</button>}
      {task.status === 'completed' && task.feedbackState !== 'submitted' && task.feedbackState !== 'requested' && <button className="button-primary" disabled={saving} onClick={requestFeedback}><PaperPlaneTilt size={15} aria-hidden />Send feedback now</button>}
      {task.status === 'completed' && (task.feedbackState === 'waiting' || task.feedbackState === 'requested') && <button className="button-secondary" disabled={saving} onClick={cancelFeedback}><Prohibit size={15} aria-hidden />Cancel feedback</button>}
    </div>
    {error && !open && <p className="mt-2 text-sm text-[#b33e3e]">{error}</p>}
    {open && <div className="drawer-backdrop"><div className="drawer">
      <div className="flex items-start justify-between"><div><p className="page-eyebrow">Lead workflow</p><h2 className="text-2xl font-bold">Edit task</h2><p className="mt-2 text-sm text-muted">Update lead details, assignment, visibility, and feedback timing.</p></div><button className="icon-button" aria-label="Close editor" onClick={() => setOpen(false)}><X size={19} aria-hidden /></button></div>
      <div className="mt-7 space-y-5">
        <label><span className="field-label">Title</span><input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <div><span className="field-label">Visibility</span><div className="grid gap-2 sm:grid-cols-2"><button type="button" aria-pressed={!clientVisible} onClick={() => setClientVisible(false)} className={`rounded-lg border p-4 text-left transition ${!clientVisible ? 'border-teal bg-[#e6f1ef]' : 'border-line hover:border-[#b8c8c3]'}`}><b className="block text-sm">Private</b><span className="mt-1 block text-xs text-muted">Internal team task</span></button><button type="button" aria-pressed={clientVisible} onClick={() => setClientVisible(true)} className={`rounded-lg border p-4 text-left transition ${clientVisible ? 'border-teal bg-[#e6f1ef]' : 'border-line hover:border-[#b8c8c3]'}`}><b className="block text-sm">Client portal</b><span className="mt-1 block text-xs text-muted">Collaborate with clients</span></button></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><label><span className="field-label">Assignee</span><select className="field-select" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.fullName}</option>)}</select></label><label><span className="field-label">Status</span><select className="field-select" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} disabled={task.status === 'completed'}><option value="draft">Draft</option><option value="active">Active</option>{task.status === 'completed' && <option value="completed">Completed</option>}</select></label></div>
        <label className="flex items-start gap-3 rounded-lg border border-line p-4"><input className="mt-0.5" type="checkbox" checked={requiresCompletion} onChange={(event) => setRequiresCompletion(event.target.checked)} /><span><b className="block text-sm">Client completion required</b><span className="mt-1 block text-xs leading-5 text-muted">The client marks this lead complete before feedback becomes available.</span></span></label>
        <div><span className="field-label">Lead details</span><RichTextEditor value={description} onChange={setDescription} /></div>
        <section className="rounded-[10px] border border-line bg-[#f8faf9] p-4 sm:p-5">
          <label className="flex items-center gap-3"><input type="checkbox" checked={feedbackEnabled} onChange={(event) => setFeedbackEnabled(event.target.checked)} /><span><b className="block text-sm">Enable feedback automation</b><span className="text-xs text-muted">Trigger: when the lead is marked completed.</span></span></label>
          {feedbackEnabled && <div className="mt-5 space-y-5"><div className="grid grid-cols-[1fr_1fr] gap-3"><label><span className="field-label">Wait (1-10)</span><input className="field-input" type="number" min={1} max={10} value={delayValue} onChange={(event) => setDelayValue(Math.min(10, Math.max(1, Number(event.target.value))))} /></label><label><span className="field-label">Unit</span><select className="field-select" value={delayUnit} onChange={(event) => setDelayUnit(event.target.value as FeedbackDelayUnit)}>{allowMinuteDelays && <option value="minutes">Minutes (development)</option>}<option value="hours">Hours</option><option value="days">Days</option></select></label></div><div className="rounded-lg border border-[#cfe0dc] bg-white p-3 text-xs leading-5 text-muted"><b className="text-ink">Then: request feedback.</b> Send the branded email and notification, then activate the embedded form. Repeated scheduler runs stay idempotent.</div><FeedbackFormEditor fields={formSchema} onChange={setFormSchema} /></div>}
        </section>
      </div>
      {error && <p className="mt-4 text-sm text-[#b33e3e]">{error}</p>}
      <div className="mt-8 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button-primary" disabled={saving || title.trim().length < 2 || formSchema.length === 0} onClick={() => save()}>{saving ? 'Saving…' : 'Save task'}</button></div>
    </div></div>}
  </>;
}
