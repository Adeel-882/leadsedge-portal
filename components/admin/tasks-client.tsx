'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { RichTextEditor } from '@/components/rich-text-editor';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, initials } from '@/lib/format';
import type { ClientSummary, TaskRecord, TemplateSummary } from '@/lib/types';

type TemplateTaskOption = { id: string; title: string; taskType: string; clientVisible: boolean };

export function TasksClient({ projectId, tasks, clients, templates, templateTasks }: { projectId: string; tasks: TaskRecord[]; clients: ClientSummary[]; templates: TemplateSummary[]; templateTasks: Record<string, TemplateTaskOption[]> }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'draft' | 'active' | 'completed'>('all');
  const [showImport, setShowImport] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.id || '');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(templateTasks[templates[0]?.id]?.map((task) => task.id) || []);
  const [initialStatus, setInitialStatus] = useState<'draft' | 'active'>('draft');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('<h2>Lead details</h2><p>Add the lead information here.</p>');
  const [taskType, setTaskType] = useState<'standard' | 'form'>('standard');
  const [assigneeId, setAssigneeId] = useState(clients[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const visible = useMemo(() => tasks.filter((task) => task.title.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || task.status === status)), [tasks, query, status]);
  const progress = tasks.length ? Math.round(tasks.filter((task) => task.status === 'completed').length / tasks.length * 100) : 0;

  function selectTemplate(id: string) { setSelectedTemplate(id); setSelectedTaskIds((templateTasks[id] || []).map((task) => task.id)); }
  function toggleTask(id: string) { setSelectedTaskIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); }

  async function importTasks() {
    setSaving(true); setError('');
    const response = await fetch('/api/admin/tasks/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, templateId: selectedTemplate, templateTaskIds: selectedTaskIds, initialStatus }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Unable to import tasks.'); else { setShowImport(false); router.refresh(); }
    setSaving(false);
  }

  async function createTask() {
    setSaving(true); setError('');
    const response = await fetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, title, description, taskType, assigneeId: assigneeId || null, clientVisible: true, requiresCompletion: true, status: 'draft' }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Unable to create task.'); else { setShowAdd(false); setTitle(''); router.refresh(); }
    setSaving(false);
  }

  return <div className="page-wrap">
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="page-eyebrow">Delivery workflow</p><h2 className="page-title">Tasks</h2><p className="page-subtitle">Draft privately, activate when ready, and keep every conversation isolated.</p></div><div className="flex gap-2"><button className="button-secondary" onClick={() => setShowImport(true)}>↓ Import template</button><button className="button-primary" onClick={() => setShowAdd(true)}>＋ Add task</button></div></div>
    <div className="card mb-5 p-5"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold text-muted">Overall progress</p><p className="mt-1 text-2xl font-bold">{progress}%</p></div><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e5eaf0]"><span className="block h-full rounded-full bg-teal" style={{ width: `${progress}%` }} /></div><p className="text-sm text-muted">{tasks.filter((task) => task.status === 'completed').length} of {tasks.length}</p></div></div>
    <section className="card overflow-hidden"><div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:justify-between"><label className="flex h-11 items-center gap-3 rounded-xl border border-[#dbe2ea] px-4 sm:w-80"><span>⌕</span><input className="w-full outline-none" placeholder="Search tasks…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select className="field-select sm:w-44" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option></select></div>
      {visible.length ? <div className="divide-y divide-line">{visible.map((task) => <Link href={`/admin/projects/${projectId}/tasks/${task.id}`} key={task.id} className="grid gap-3 p-4 hover:bg-[#fbfcfd] sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:px-5"><div><div className="flex items-center gap-2"><span className="font-semibold">{task.title}</span>{task.taskType === 'form' && <span className="rounded-full bg-[#eef1f6] px-2 py-1 text-[10px] text-muted">Form</span>}</div><p className="mt-1 text-xs text-muted">{task.clientVisible ? 'Client portal' : 'Private'} · Created {formatDate(task.createdAt)}</p></div><StatusBadge status={task.status} /><span className="flex items-center gap-2 text-sm text-muted"><span className="avatar h-8 w-8 bg-[#e8f5f2] text-teal">{task.assigneeName ? initials(task.assigneeName) : '—'}</span>{task.assigneeName || 'Unassigned'}</span><span className="text-xl text-muted">›</span></Link>)}</div> : <div className="p-5"><EmptyState title="No tasks in this view" body="Add a task or import a reusable template to get started." /></div>}
    </section>

    {showImport && <div className="modal-backdrop"><div className="modal-card"><div className="flex justify-between"><div><p className="page-eyebrow">Project-specific copies</p><h3 className="text-2xl font-bold">Import tasks from template</h3></div><button onClick={() => setShowImport(false)} className="text-2xl text-muted">×</button></div><div className="mt-6 space-y-5"><label><span className="field-label">Template</span><select className="field-select" value={selectedTemplate} onChange={(event) => selectTemplate(event.target.value)}><option value="">Select a template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><div><p className="field-label">Select tasks to import</p><div className="rounded-xl border border-line p-2">{(templateTasks[selectedTemplate] || []).map((task) => <label className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-[#f7f9fb]" key={task.id}><input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => toggleTask(task.id)} /><span><b className="block text-sm">{task.title}</b><small className="text-muted">{task.taskType === 'form' ? 'Form task' : 'Standard client task'}</small></span></label>)}</div></div><label><span className="field-label">Imported status</span><select className="field-select" value={initialStatus} onChange={(event) => setInitialStatus(event.target.value as 'draft' | 'active')}><option value="draft">Draft — review before the client sees it</option><option value="active">Active — visible immediately</option></select></label></div>{error && <p className="mt-4 text-sm text-[#b33e3e]">{error}</p>}<div className="mt-7 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setShowImport(false)}>Cancel</button><button className="button-primary" disabled={saving || !selectedTaskIds.length} onClick={importTasks}>{saving ? 'Importing…' : 'Import tasks'}</button></div></div></div>}

    {showAdd && <div className="drawer-backdrop"><div className="drawer"><div className="flex justify-between"><div><p className="page-eyebrow">Project task</p><h3 className="text-2xl font-bold">Add task</h3></div><button onClick={() => setShowAdd(false)} className="text-2xl text-muted">×</button></div><div className="mt-7 space-y-5"><label><span className="field-label">Title</span><input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} /></label><div><span className="field-label">Visibility</span><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border-2 border-teal bg-[#f2fbf9] p-4"><b className="block">Client portal</b><span className="text-xs text-muted">Collaborate with clients</span></div><div className="rounded-xl border border-line p-4 opacity-70"><b className="block">Private</b><span className="text-xs text-muted">Internal only</span></div></div></div><div className="grid gap-4 sm:grid-cols-2"><label><span className="field-label">Type</span><select className="field-select" value={taskType} onChange={(event) => setTaskType(event.target.value as 'standard' | 'form')}><option value="standard">Standard client task</option><option value="form">Form task</option></select></label><label><span className="field-label">Assignee</span><select className="field-select" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.fullName}</option>)}</select></label></div><div><span className="field-label">Details</span><RichTextEditor value={description} onChange={setDescription} /></div></div>{error && <p className="mt-4 text-sm text-[#b33e3e]">{error}</p>}<div className="mt-8 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="button-primary" disabled={saving || title.trim().length < 2} onClick={createTask}>{saving ? 'Saving…' : 'Save draft'}</button></div></div></div>}
  </div>;
}
