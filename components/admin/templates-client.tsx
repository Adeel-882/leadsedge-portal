'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
    <div className="mb-8 flex items-end justify-between gap-4"><div><p className="page-eyebrow">Reusable workflows</p><h1 className="page-title">Templates</h1><p className="page-subtitle">Build task sets once, then import independent copies into projects.</p></div><button className="button-primary" onClick={() => setShowModal(true)}>＋ Create template</button></div>
      {templates.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <article className="card p-5" key={template.id}><div className="mb-5 flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f5f2] font-bold text-teal">▤</span><span className="rounded-full bg-[#f0f3f6] px-3 py-1 text-xs text-muted">{template.taskCount} tasks</span></div><h2 className="text-lg font-bold">{template.name}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-muted">{template.description || 'No description yet.'}</p><p className="mt-4 text-xs text-muted">Updated {formatDate(template.updatedAt)}</p><div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4"><Link className="button-secondary" href={`/admin/templates/${template.id}`}>Edit</Link><button className="button-secondary" onClick={() => mutateTemplate(template.id, 'duplicate')}>Duplicate</button><button className="ml-auto text-xs font-semibold text-[#a04c4c]" onClick={() => mutateTemplate(template.id, 'archive')}>Archive</button></div></article>)}</div> : <EmptyState title="No templates yet" body="Create a focused task workflow to reuse across client projects." action={<button className="button-primary" onClick={() => setShowModal(true)}>Create template</button>} />}
    {showModal && <div className="modal-backdrop"><div className="modal-card"><div className="flex items-start justify-between"><div><p className="page-eyebrow">New workflow</p><h2 className="text-2xl font-bold">Create template</h2><p className="mt-2 text-sm text-muted">Start with a name and add tasks after saving.</p></div><button onClick={() => setShowModal(false)} aria-label="Close" className="text-2xl text-muted">×</button></div><div className="mt-7 space-y-5"><label><span className="field-label">Template name</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Lead Assignment" /></label><label><span className="field-label">Description</span><textarea className="field-textarea" value={description} onChange={(event) => setDescription(event.target.value)} /></label></div>{error && <p className="mt-4 text-sm text-[#b33e3e]">{error}</p>}<div className="mt-7 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="button-primary" disabled={saving || name.trim().length < 2} onClick={createTemplate}>{saving ? 'Creating…' : 'Create template'}</button></div></div></div>}
  </div>;
}
