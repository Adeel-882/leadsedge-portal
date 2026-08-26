'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RichTextEditor } from '@/components/rich-text-editor';
import type { ClientSummary, TaskRecord, TaskStatus } from '@/lib/types';

export function TaskEditor({ task, clients }: { task: TaskRecord; clients: ClientSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId || '');
  const [clientVisible, setClientVisible] = useState(task.clientVisible);
  const [requiresCompletion, setRequiresCompletion] = useState(task.requiresCompletion);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [dueAt, setDueAt] = useState(task.dueAt ? task.dueAt.slice(0, 16) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(nextStatus = status) {
    setSaving(true); setError('');
    const response = await fetch(`/api/admin/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, assigneeId: assigneeId || null, clientVisible, requiresCompletion, status: nextStatus, dueAt: dueAt ? new Date(dueAt).toISOString() : null }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Task could not be saved.'); else { setStatus(nextStatus); setOpen(false); router.refresh(); }
    setSaving(false);
  }

  async function activate() {
    if (!window.confirm('Activate this task and make it actionable for the assigned client?')) return;
    await save('active');
  }

  return <><div className="flex flex-wrap gap-2"><button className="button-secondary" onClick={() => setOpen(true)}>Edit task</button>{task.status === 'draft' && <button className="button-primary" onClick={activate}>Activate task</button>}</div>{open && <div className="drawer-backdrop"><div className="drawer"><div className="flex items-start justify-between"><div><p className="page-eyebrow">Task settings</p><h2 className="text-2xl font-bold">Edit task</h2></div><button className="text-2xl text-muted" onClick={() => setOpen(false)}>×</button></div><div className="mt-7 space-y-5"><label><span className="field-label">Title</span><input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} /></label><div><span className="field-label">Visibility</span><div className="grid grid-cols-2 gap-3"><button onClick={() => setClientVisible(false)} className={`rounded-xl border p-4 text-left ${!clientVisible ? 'border-2 border-teal bg-[#f1faf8]' : 'border-line'}`}><b className="block">Private</b><span className="text-xs text-muted">Internal team task</span></button><button onClick={() => setClientVisible(true)} className={`rounded-xl border p-4 text-left ${clientVisible ? 'border-2 border-teal bg-[#f1faf8]' : 'border-line'}`}><b className="block">Client portal</b><span className="text-xs text-muted">Collaborate with clients</span></button></div></div><div className="grid gap-4 sm:grid-cols-2"><label><span className="field-label">Assignee</span><select className="field-select" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.fullName}</option>)}</select></label><label><span className="field-label">Status</span><select className="field-select" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option></select></label></div><label><span className="field-label">Due date</span><input className="field-input" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label><label className="flex items-center gap-3 rounded-xl border border-line p-4"><input type="checkbox" checked={requiresCompletion} onChange={(event) => setRequiresCompletion(event.target.checked)} /><span><b className="block text-sm">Client completion required</b><span className="text-xs text-muted">Allows the assigned client to mark this active task complete.</span></span></label><div><span className="field-label">Details</span><RichTextEditor value={description} onChange={setDescription} /></div></div>{error && <p className="mt-4 text-sm text-[#b33e3e]">{error}</p>}<div className="mt-8 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button-primary" disabled={saving || title.trim().length < 2} onClick={() => save()}>{saving ? 'Saving…' : 'Save task'}</button></div></div></div>}</>;
}
