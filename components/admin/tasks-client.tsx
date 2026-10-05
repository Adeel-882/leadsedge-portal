'use client';
import { useCacheMutation } from '@/components/cached-screen';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckSquare, DownloadSimple, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { EmptyState } from '@/components/empty-state';
import { RichTextEditor } from '@/components/rich-text-editor';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, initials } from '@/lib/format';
import type { ClientSummary, TaskRecord, TemplateSummary } from '@/lib/types';

type TemplateTaskOption = { id: string; title: string; taskType: string; clientVisible: boolean };

export function TasksClient({ projectId, tasks, clients, templates, templateTasks }: { projectId: string; tasks: TaskRecord[]; clients: ClientSummary[]; templates: TemplateSummary[]; templateTasks: Record<string, TemplateTaskOption[]> }) {
  const router = useRouter();
  const invalidate = useCacheMutation();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'draft' | 'active' | 'completed'>('all');
  const [showImport, setShowImport] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.id || '');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(templateTasks[templates[0]?.id]?.map((task) => task.id) || []);
  const [initialStatus, setInitialStatus] = useState<'draft' | 'active'>('draft');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('<h2>Lead details</h2><p>Add the lead information here.</p>');
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
    if (!response.ok) setError(result.error || 'Unable to import tasks.'); else { setShowImport(false); await invalidate('task'); router.refresh(); }
    setSaving(false);
  }

  async function createTask() {
    setSaving(true); setError('');
    const response = await fetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, title, description, assigneeId: assigneeId || null, clientVisible: true, requiresCompletion: true, status: 'draft' }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Unable to create task.'); else { setShowAdd(false); setTitle(''); await invalidate('task'); router.refresh(); }
    setSaving(false);
  }

  return <div className="page-wrap">
    <div className="page-header page-header-row"><div><p className="page-eyebrow">Delivery workflow</p><h2 className="page-title">Tasks</h2><p className="page-subtitle">Draft privately, activate when ready, and keep each lead conversation isolated.</p></div><div className="flex flex-wrap gap-2"><button className="button-secondary" onClick={() => setShowImport(true)}><DownloadSimple size={16} aria-hidden />Import template</button><button className="button-primary" onClick={() => setShowAdd(true)}><Plus size={16} weight="bold" aria-hidden />Add task</button></div></div>
    <div className="surface-flat mb-4 flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand-text"><CheckSquare size={19} weight="fill" aria-hidden /></span><div><p className="text-xs font-semibold text-muted">Overall progress</p><p className="text-lg font-bold tabular-nums">{progress}%</p></div></div><div className="flex-1"><div className="h-1.5 overflow-hidden rounded-full bg-track"><span className="block h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-muted">{tasks.filter((task) => task.status === 'completed').length} of {tasks.length} completed</p></div></div>
    <section className="surface-flat overflow-hidden"><div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:justify-between"><label className="flex h-10 items-center gap-2 rounded-lg border border-line px-3 sm:w-80"><MagnifyingGlass size={16} className="text-muted" aria-hidden /><span className="sr-only">Search tasks</span><input className="w-full bg-transparent text-[13px] outline-none" placeholder="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select className="field-select sm:w-44" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option></select></div>
      {visible.length ? <div>{visible.map((task) => <Link prefetch={false} href={`/admin/projects/${projectId}/tasks/${task.id}`} key={task.id} className="group grid gap-3 border-b border-line p-4 last:border-b-0 hover:bg-brand-soft sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{task.title}</span>{task.feedbackState === 'requested' && <span className="status-badge bg-warning-soft text-warning">Feedback requested</span>}{task.feedbackState === 'submitted' && <span className="status-badge status-active">Feedback submitted</span>}</div><p className="mt-1 text-xs text-muted">{task.clientVisible ? 'Client portal' : 'Private'} <span aria-hidden>•</span> Created {formatDate(task.createdAt)}</p></div><StatusBadge status={task.status} /><span className="flex items-center gap-2 text-sm text-muted"><span className="avatar h-8 w-8 bg-brand-soft text-brand-text">{task.assigneeName ? initials(task.assigneeName) : '?'}</span>{task.assigneeName || 'Unassigned'}</span><ArrowRight className="text-muted transition-transform group-hover:translate-x-0.5" size={16} aria-hidden /></Link>)}</div> : <div className="p-5"><EmptyState title="No tasks in this view" body="Add a Lead Assignment or import the reusable template to get started." /></div>}
    </section>

    {showImport && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-workflow-title"><div className="modal-card"><div className="flex justify-between"><div><p className="page-eyebrow">Project-specific copy</p><h3 id="import-workflow-title" className="text-2xl font-bold">Import Lead Assignment</h3></div><button aria-label="Close import dialog" onClick={() => setShowImport(false)} className="button-ghost h-9 w-9 p-0"><X size={18} aria-hidden /></button></div><div className="mt-6 space-y-5"><label><span className="field-label">Template</span><select className="field-select" value={selectedTemplate} onChange={(event) => selectTemplate(event.target.value)}><option value="">Select a template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><div><p className="field-label">Workflow to import</p><div className="rounded-lg border border-line p-2">{(templateTasks[selectedTemplate] || []).map((task) => <label className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-brand-soft" key={task.id}><input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => toggleTask(task.id)} /><span><b className="block text-sm">{task.title}</b><small className="text-muted">Lead details + completion + feedback + conversation</small></span></label>)}</div></div><label><span className="field-label">Imported status</span><select className="field-select" value={initialStatus} onChange={(event) => setInitialStatus(event.target.value as 'draft' | 'active')}><option value="draft">Draft - review before the client sees it</option><option value="active">Active - visible immediately</option></select></label></div>{error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}<div className="mt-7 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setShowImport(false)}>Cancel</button><button className="button-primary" disabled={saving || !selectedTaskIds.length} onClick={importTasks}>{saving ? 'Importing...' : 'Import workflow'}</button></div></div></div>}

    {showAdd && <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-task-title"><div className="drawer"><div className="flex justify-between"><div><p className="page-eyebrow">Single-task workflow</p><h3 id="add-task-title" className="text-2xl font-bold">Add Lead Assignment</h3></div><button aria-label="Close task editor" onClick={() => setShowAdd(false)} className="button-ghost h-9 w-9 p-0"><X size={18} aria-hidden /></button></div><div className="mt-7 space-y-5"><label><span className="field-label">Title</span><input className="field-input" placeholder="Lead Assignment - Client Name" value={title} onChange={(event) => setTitle(event.target.value)} /></label><div><span className="field-label">Visibility</span><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border-2 border-brand bg-brand-soft p-4"><b className="block">Client portal</b><span className="text-xs text-muted">Collaborate with clients</span></div><div className="rounded-lg border border-line p-4 opacity-70"><b className="block">Private</b><span className="text-xs text-muted">Internal only</span></div></div></div><label><span className="field-label">Assignee</span><select className="field-select" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.fullName}</option>)}</select></label><div><span className="field-label">Lead details</span><RichTextEditor value={description} onChange={setDescription} /></div><p className="rounded-lg bg-info-soft p-4 text-sm text-info">The default feedback form and one-day post-completion automation are included in this same task.</p></div>{error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}<div className="mt-8 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="button-primary" disabled={saving || title.trim().length < 2} onClick={createTask}>{saving ? 'Saving...' : 'Save draft'}</button></div></div></div>}
  </div>;
}
