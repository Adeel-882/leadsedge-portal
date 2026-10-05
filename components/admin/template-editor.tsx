'use client';
import { useCacheMutation } from '@/components/cached-screen';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import { FeedbackFormEditor } from '@/components/feedback-form-editor';
import { RichTextEditor } from '@/components/rich-text-editor';
import { leadFeedbackForm } from '@/lib/demo-data';
import { FEEDBACK_DELAY_MAX, FEEDBACK_DELAY_MIN, clampFeedbackDelay, describeFeedbackDelay } from '@/lib/scheduling';
import type { FeedbackDelayUnit, FormField, TemplateSummary, TemplateTaskRecord } from '@/lib/types';

export function TemplateEditor({ template, tasks }: { template: TemplateSummary; tasks: TemplateTaskRecord[] }) {
  const invalidate = useCacheMutation();
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TemplateTaskRecord | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('<p>Add task instructions here.</p>');
  const [clientVisible, setClientVisible] = useState(true);
  const [requiresCompletion, setRequiresCompletion] = useState(true);
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [feedbackDelayValue, setFeedbackDelayValue] = useState(1);
  const [feedbackDelayUnit, setFeedbackDelayUnit] = useState<FeedbackDelayUnit>('days');
  const [formSchema, setFormSchema] = useState<FormField[]>(leadFeedbackForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function openNewTask() {
    setEditingTask(null); setTaskTitle('Lead Assignment'); setTaskDescription('<h2>Lead details</h2><p>Add the lead information here.</p>');
    setClientVisible(true); setRequiresCompletion(true); setFeedbackEnabled(true); setFeedbackDelayValue(1); setFeedbackDelayUnit('days'); setFormSchema(leadFeedbackForm); setTaskModal(true);
  }

  function openEditTask(task: TemplateTaskRecord) {
    setEditingTask(task); setTaskTitle(task.title); setTaskDescription(task.description); setClientVisible(task.clientVisible); setRequiresCompletion(task.requiresCompletion);
    setFeedbackEnabled(task.feedbackEnabled); setFeedbackDelayValue(task.feedbackDelayValue || 1); setFeedbackDelayUnit(task.feedbackDelayUnit || 'days'); setFormSchema(task.formSchema || leadFeedbackForm); setTaskModal(true);
  }

  async function saveTemplate() {
    setSaving(true); setMessage('');
    const response = await fetch(`/api/admin/templates/${template.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? 'Template details saved.' : result.error || 'Template could not be saved.');
    await invalidate('template'); router.refresh(); setSaving(false);
  }

  async function saveTask() {
    setSaving(true); setMessage('');
    const endpoint = editingTask ? `/api/admin/templates/${template.id}/tasks/${editingTask.id}` : `/api/admin/templates/${template.id}/tasks`;
    const response = await fetch(endpoint, { method: editingTask ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: taskTitle, description: taskDescription, clientVisible, requiresCompletion, formSchema, feedbackEnabled, feedbackDelayValue, feedbackDelayUnit }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setMessage(result.error || 'Template task could not be saved.'); else { setTaskModal(false); await invalidate('template'); router.refresh(); }
    setSaving(false);
  }

  async function taskAction(task: TemplateTaskRecord, action: 'up' | 'down' | 'delete') {
    if (action === 'delete' && !window.confirm(`Delete "${task.title}" from this template? Existing project tasks will not be changed.`)) return;
    await fetch(`/api/admin/templates/${template.id}/tasks/${task.id}`, { method: action === 'delete' ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: action === 'delete' ? undefined : JSON.stringify({ action }) });
    await invalidate('template'); router.refresh();
  }

  const lockedSingleTask = template.name === 'Lead Assignment';
  return <div className="page-wrap">
    <div className="page-header"><p className="page-eyebrow">Template editor</p><h1 className="page-title">{template.name}</h1><p className="page-subtitle">Changes affect future imports only. Existing project tasks remain independent.</p></div>
    <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
      <section className="surface-flat h-fit p-5"><h2 className="section-title">Template details</h2><div className="mt-5 space-y-4"><label><span className="field-label">Name</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span className="field-label">Description</span><textarea className="field-textarea" value={description} onChange={(event) => setDescription(event.target.value)} /></label></div><button className="button-primary mt-5 w-full" disabled={saving || name.trim().length < 2} onClick={saveTemplate}>Save details</button>{message && <p role="status" className="mt-3 text-xs text-muted">{message}</p>}</section>
      <section className="surface-flat overflow-hidden"><div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="section-title">Template workflow</h2><p className="mt-1 text-sm text-muted">One task owns lead details, completion, feedback, and conversation.</p></div>{(!lockedSingleTask || tasks.length === 0) && <button className="button-primary" onClick={openNewTask}><Plus size={15} weight="bold" aria-hidden />Add task</button>}</div>
        {tasks.length ? <div>{tasks.map((task, index) => <article key={task.id} className="flex items-center gap-3 border-b border-line p-4 last:border-b-0 sm:p-5"><span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-subtle text-xs font-bold text-muted">{index + 1}</span><button className="group min-w-0 flex-1 text-left" onClick={() => openEditTask(task)}><span className="flex items-center gap-2"><b className="truncate text-sm">{task.title}</b><PencilSimple size={14} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /></span><span className="mt-1 block text-xs text-muted">{task.clientVisible ? 'Client visible' : 'Private'} <span aria-hidden>•</span> {task.feedbackEnabled ? `Follow-up ${describeFeedbackDelay(task.feedbackDelayValue, task.feedbackDelayUnit)}` : 'No follow-up step'}</span></button>{!lockedSingleTask && <div className="flex gap-1"><button aria-label="Move task up" className="button-ghost h-9 w-9 p-0" disabled={index === 0} onClick={() => taskAction(task, 'up')}><ArrowUp size={15} aria-hidden /></button><button aria-label="Move task down" className="button-ghost h-9 w-9 p-0" disabled={index === tasks.length - 1} onClick={() => taskAction(task, 'down')}><ArrowDown size={15} aria-hidden /></button><button aria-label="Delete task" className="button-ghost h-9 w-9 p-0 text-danger" onClick={() => taskAction(task, 'delete')}><Trash size={15} aria-hidden /></button></div>}</article>)}</div> : <p className="p-10 text-center text-sm text-muted">No tasks yet. Add the Lead Assignment workflow.</p>}
      </section>
    </div>
    {taskModal && <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="template-task-title"><div className="drawer"><div className="flex justify-between"><div><p className="page-eyebrow">Single-task workflow</p><h2 id="template-task-title" className="text-2xl font-bold">{editingTask ? 'Edit Lead Assignment' : 'Add Lead Assignment'}</h2></div><button aria-label="Close task editor" className="button-ghost h-9 w-9 p-0" onClick={() => setTaskModal(false)}><X size={18} aria-hidden /></button></div><div className="mt-7 space-y-5"><label><span className="field-label">Title</span><input className="field-input" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /></label><div><span className="field-label">Lead details</span><RichTextEditor value={taskDescription} onChange={setTaskDescription} /></div><div className="grid gap-3 sm:grid-cols-2"><label className="flex items-start gap-3 rounded-lg border border-line p-4"><input className="mt-0.5" type="checkbox" checked={clientVisible} onChange={(event) => setClientVisible(event.target.checked)} /><span><b className="block text-sm">Client visible</b><span className="text-xs text-muted">Appears when active</span></span></label><label className="flex items-start gap-3 rounded-lg border border-line p-4"><input className="mt-0.5" type="checkbox" checked={requiresCompletion} onChange={(event) => setRequiresCompletion(event.target.checked)} /><span><b className="block text-sm">Client completion</b><span className="text-xs text-muted">Requires a confirmation</span></span></label></div><section className="rounded-lg border border-line bg-surface-subtle p-4"><label className="flex items-start gap-3"><input className="mt-0.5" type="checkbox" checked={feedbackEnabled} onChange={(event) => setFeedbackEnabled(event.target.checked)} /><span><b className="block text-sm">Follow-up step</b><span className="text-xs text-muted">After this lead is completed, wait the timing below, then make the feedback step available to the client.</span></span></label>{feedbackEnabled && <div className="mt-4 space-y-4"><fieldset><legend className="field-label">Timing</legend><div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3"><label><span className="sr-only">Amount</span><input aria-label="Delay amount" className="field-input" type="number" min={FEEDBACK_DELAY_MIN} max={FEEDBACK_DELAY_MAX} value={feedbackDelayValue} onChange={(event) => setFeedbackDelayValue(clampFeedbackDelay(Number(event.target.value)))} /></label><label><span className="sr-only">Unit</span><select aria-label="Delay unit" className="field-select" value={feedbackDelayUnit} onChange={(event) => setFeedbackDelayUnit(event.target.value as FeedbackDelayUnit)}><option value="hours">Hours</option><option value="days">Days</option></select></label></div><select aria-label="Timing reference" className="field-select mt-3" value="after_completion" onChange={() => undefined}><option value="after_completion">After the previous task is completed</option></select><p className="mt-2 text-xs text-muted">Counted from the moment the client marks the lead complete, not from the import or project date. Amounts from {FEEDBACK_DELAY_MIN} to {FEEDBACK_DELAY_MAX} are supported.</p></fieldset><FeedbackFormEditor fields={formSchema} onChange={setFormSchema} /></div>}</section></div><div className="mt-7 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setTaskModal(false)}>Cancel</button><button className="button-primary" disabled={saving || taskTitle.trim().length < 2 || formSchema.length === 0} onClick={saveTask}>{saving ? 'Saving...' : 'Save task'}</button></div></div></div>}
  </div>;
}
