'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Archive as ArchiveBox, ArrowRight, Copy, Plus, Stack, X } from '@phosphor-icons/react';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/format';
import type { TemplateSummary } from '@/lib/types';

export function TemplatesClient({ templates }: { templates: TemplateSummary[] }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function createTemplate() {
    setSaving(true); setError('');
    const response = await fetch('/api/admin/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Unable to create template.');
    else { setShowModal(false); setName(''); setDescription(''); router.refresh(); }
    setSaving(false);
  }

  async function mutateTemplate(id: string, action: 'duplicate' | 'archive') {
    if (action === 'archive' && !window.confirm('Archive this template? Existing project tasks will not be changed.')) return;
    await fetch(`/api/admin/templates/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    router.refresh();
  }

  return <div className="page-wrap">
    <div className="page-header page-header-row"><div><p className="page-eyebrow">Reusable workflows</p><h1 className="page-title">Templates</h1><p className="page-subtitle">Maintain the single Lead Assignment workflow, then import an independent copy into each project.</p></div><button className="button-primary" onClick={() => setShowModal(true)}><Plus size={16} weight="bold" aria-hidden />Create template</button></div>
      {templates.length ? <section className="surface-flat overflow-hidden"><div className="hidden grid-cols-[minmax(0,1fr)_110px_150px_250px] border-b border-line bg-[#f8faf9] px-5 py-3 text-[10px] font-bold text-muted md:grid"><span>Template</span><span>Tasks</span><span>Last updated</span><span className="text-right">Actions</span></div>{templates.map((template) => <article className="grid gap-4 border-b border-line p-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_110px_150px_250px] md:items-center" key={template.id}><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-[#e6f1ef] text-teal"><Stack size={19} weight="fill" aria-hidden /></span><div className="min-w-0"><h2 className="truncate text-sm font-bold">{template.name}</h2><p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">{template.description || 'No description yet.'}</p></div></div><span className="text-sm text-muted">{template.taskCount} {template.taskCount === 1 ? 'task' : 'tasks'}</span><span className="text-sm text-muted">{formatDate(template.updatedAt)}</span><div className="flex flex-wrap gap-2 md:justify-end"><Link className="button-secondary" href={`/admin/templates/${template.id}`}>Edit<ArrowRight size={14} aria-hidden /></Link><button className="button-ghost" onClick={() => mutateTemplate(template.id, 'duplicate')}><Copy size={15} aria-hidden />Duplicate</button><button className="button-ghost text-[#963d3d]" onClick={() => mutateTemplate(template.id, 'archive')}><ArchiveBox size={15} aria-hidden />Archive</button></div></article>)}</section> : <EmptyState title="No templates yet" body="Create a focused task workflow to reuse across client projects." action={<button className="button-primary" onClick={() => setShowModal(true)}>Create template</button>} />}
    {showModal && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-template-title"><div className="modal-card"><div className="flex items-start justify-between"><div><p className="page-eyebrow">New workflow</p><h2 id="create-template-title" className="text-2xl font-bold">Create template</h2><p className="mt-2 text-sm text-muted">Start with a name and add the Lead Assignment after saving.</p></div><button onClick={() => setShowModal(false)} aria-label="Close" className="icon-button"><X size={19} aria-hidden /></button></div><div className="mt-7 space-y-5"><label><span className="field-label">Template name</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Lead Assignment" /></label><label><span className="field-label">Description</span><textarea className="field-textarea" value={description} onChange={(event) => setDescription(event.target.value)} /></label></div>{error && <p role="alert" className="mt-4 rounded-lg bg-[#faeeee] p-3 text-sm text-[#8f3030]">{error}</p>}<div className="mt-7 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="button-primary" disabled={saving || name.trim().length < 2} onClick={createTemplate}>{saving ? 'Creating...' : 'Create template'}</button></div></div></div>}
  </div>;
}
