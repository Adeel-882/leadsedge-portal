'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RichTextEditor } from '@/components/rich-text-editor';
import { leadFeedbackForm } from '@/lib/demo-data';
import type { TaskType, TemplateSummary, TemplateTaskRecord } from '@/lib/types';

export function TemplateEditor({ template, tasks }: { template: TemplateSummary; tasks: TemplateTaskRecord[] }) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TemplateTaskRecord | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('<p>Add task instructions here.</p>');
  const [taskType, setTaskType] = useState<TaskType>('standard');
  const [clientVisible, setClientVisible] = useState(true);
  const [requiresCompletion, setRequiresCompletion] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function openNewTask() { setEditingTask(null); setTaskTitle(''); setTaskDescription('<p>Add task instructions here.</p>'); setTaskType('standard'); setClientVisible(true); setRequiresCompletion(true); setTaskModal(true); }
  function openEditTask(task: TemplateTaskRecord) { setEditingTask(task); setTaskTitle(task.title); setTaskDescription(task.description); setTaskType(task.taskType); setClientVisible(task.clientVisible); setRequiresCompletion(task.requiresCompletion); setTaskModal(true); }

  async function saveTemplate() {
    setSaving(true); setMessage('');
    const response = await fetch(`/api/admin/templates/${template.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? 'Template details saved.' : result.error || 'Template could not be saved.');
    router.refresh(); setSaving(false);
  }

  async function saveTask() {
    setSaving(true); setMessage('');
    const endpoint = editingTask ? `/api/admin/templates/${template.id}/tasks/${editingTask.id}` : `/api/admin/templates/${template.id}/tasks`;
    const response = await fetch(endpoint, { method: editingTask ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: taskTitle, description: taskDescription, taskType, clientVisible, requiresCompletion, formSchema: taskType === 'form' ? editingTask?.formSchema || leadFeedbackForm : null }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setMessage(result.error || 'Template task could not be saved.'); else { setTaskModal(false); router.refresh(); }
    setSaving(false);
  }

  async function taskAction(task: TemplateTaskRecord, action: 'up' | 'down' | 'delete') {
    if (action === 'delete' && !window.confirm(`Delete “${task.title}” from this template? Existing project tasks will not be changed.`)) return;
    await fetch(`/api/admin/templates/${template.id}/tasks/${task.id}`, { method: action === 'delete' ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: action === 'delete' ? undefined : JSON.stringify({ action }) });
    router.refresh();
  }

  return <div className="page-wrap"><div className="mb-7"><p className="page-eyebrow">Template editor</p><h1 className="page-title">{template.name}</h1><p className="page-subtitle">Changes affect future imports only. Existing project tasks remain independent.</p></div><div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><section className="card h-fit p-5"><h2 className="font-bold">Template details</h2><div className="mt-5 space-y-4"><label><span className="field-label">Name</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span className="field-label">Description</span><textarea className="field-textarea" value={description} onChange={(event) => setDescription(event.target.value)} /></label></div><button className="button-primary mt-5 w-full" disabled={saving || name.trim().length < 2} onClick={saveTemplate}>Save details</button>{message && <p className="mt-3 text-xs text-muted">{message}</p>}</section><section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-line p-5"><div><h2 className="font-bold">Template tasks</h2><p className="mt-1 text-sm text-muted">Reorder tasks to set their import sequence.</p></div><button className="button-primary" onClick={openNewTask}>＋ Add task</button></div>{tasks.length ? <div className="divide-y divide-line">{tasks.map((task, index) => <div key={task.id} className="flex items-center gap-4 p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef2f6] text-xs font-bold text-muted">{index + 1}</span><button className="min-w-0 flex-1 text-left" onClick={() => openEditTask(task)}><b className="block truncate text-sm">{task.title}</b><span className="mt-1 block text-xs text-muted">{task.taskType === 'form' ? 'Form task' : 'Standard client task'} · {task.clientVisible ? 'Client visible' : 'Private'}</span></button><div className="flex gap-1"><button className="rounded-lg border border-line px-2 py-1.5 text-xs disabled:opacity-30" disabled={index === 0} onClick={() => taskAction(task, 'up')}>↑</button><button className="rounded-lg border border-line px-2 py-1.5 text-xs disabled:opacity-30" disabled={index === tasks.length - 1} onClick={() => taskAction(task, 'down')}>↓</button><button className="rounded-lg px-2 py-1.5 text-xs text-[#a34343]" onClick={() => taskAction(task, 'delete')}>Delete</button></div></div>)}</div> : <p className="p-10 text-center text-sm text-muted">No tasks yet. Add the first task to this template.</p>}</section></div>
    {taskModal && <div className="drawer-backdrop"><div className="drawer"><div className="flex justify-between"><div><p className="page-eyebrow">Template task</p><h2 className="text-2xl font-bold">{editingTask ? 'Edit task' : 'Add task'}</h2></div><button className="text-2xl text-muted" onClick={() => setTaskModal(false)}>×</button></div><div className="mt-7 space-y-5"><label><span className="field-label">Title</span><input className="field-input" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /></label><label><span className="field-label">Type</span><select className="field-select" value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)}><option value="standard">Standard client task</option><option value="form">Form task</option></select></label><div><span className="field-label">Details</span><RichTextEditor value={taskDescription} onChange={setTaskDescription} /></div><label className="flex items-center gap-3 rounded-xl border border-line p-4"><input type="checkbox" checked={clientVisible} onChange={(event) => setClientVisible(event.target.checked)} /><span className="text-sm font-semibold">Visible in client portal when active</span></label><label className="flex items-center gap-3 rounded-xl border border-line p-4"><input type="checkbox" checked={requiresCompletion} onChange={(event) => setRequiresCompletion(event.target.checked)} /><span className="text-sm font-semibold">Requires client completion</span></label>{taskType === 'form' && <div className="rounded-xl bg-[#eef7f5] p-4 text-sm text-[#0d6b63]">The Phase 1 Lead Feedback fields—Lead Name, Feedback, Rating, Connection, and Score—will be attached. Their schema remains editable in the database and API.</div>}</div><div className="mt-7 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setTaskModal(false)}>Cancel</button><button className="button-primary" disabled={saving || taskTitle.trim().length < 2} onClick={saveTask}>{saving ? 'Saving…' : 'Save task'}</button></div></div></div>}
  </div>;
}
