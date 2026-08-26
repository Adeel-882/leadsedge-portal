'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProgressBar } from '@/components/progress-bar';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, initials } from '@/lib/format';
import type { ClientSummary, ProjectSummary } from '@/lib/types';

export function DashboardClient({ projects, clients, ownerName }: { projects: ProjectSummary[]; clients: ClientSummary[]; ownerName: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'completed'>('active');
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [clientMode, setClientMode] = useState<'new' | 'existing'>('new');
  const [projectName, setProjectName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const visible = useMemo(() => projects.filter((project) => {
    const matchesQuery = `${project.projectName} ${project.clientName}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === 'all' || project.status === status);
  }), [projects, query, status]);

  function closeModal() {
    setShowModal(false); setStep(1); setMessage(''); setProjectName(''); setFullName(''); setEmail(''); setCompany('');
  }

  async function submitProject() {
    setSaving(true); setMessage('');
    const client = clientMode === 'new' ? { mode: 'new', fullName, email, company } : { mode: 'existing', clientId };
    try {
      const response = await fetch('/api/admin/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName, client }) });
      const result = await response.json() as { error?: string; warning?: string; projectId?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to create the project.');
      if (result.warning) setMessage(result.warning);
      else closeModal();
      router.refresh();
      if (result.projectId && !result.warning) router.push(`/admin/projects/${result.projectId}/tasks`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create the project.'); }
    finally { setSaving(false); }
  }

  return <div className="page-wrap">
    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div><p className="page-eyebrow">Overview</p><h1 className="page-title">Projects</h1><p className="page-subtitle">Manage client work and keep every lead moving.</p></div>
      <button className="button-primary" onClick={() => setShowModal(true)}>＋ New project</button>
    </div>

    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Metric label="Active projects" value={projects.filter((project) => project.status === 'active').length} />
      <Metric label="Completed" value={projects.filter((project) => project.status === 'completed').length} />
      <Metric label="Open tasks" value={projects.reduce((sum, project) => sum + project.totalTasks - project.completedTasks, 0)} />
      <Metric label="Clients" value={new Set(projects.map((project) => project.clientId)).size} />
    </div>

    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <label className="flex h-11 w-full items-center gap-3 rounded-xl border border-[#dbe2ea] bg-[#fbfcfd] px-4 sm:max-w-md"><span className="text-muted">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search projects or clients…" /></label>
        <div className="flex rounded-xl bg-[#f1f4f7] p-1">{(['active', 'completed', 'all'] as const).map((item) => <button key={item} onClick={() => setStatus(item)} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${status === item ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>{item}</button>)}</div>
      </div>
      <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Project</th><th>Client</th><th>Owner</th><th>Progress</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>{visible.map((project) => <tr key={project.id}><td><Link href={`/admin/projects/${project.id}`} className="flex items-center gap-3 font-semibold"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f5f2] text-teal">{project.projectName[0]}</span>{project.projectName}</Link></td><td><span className="flex items-center gap-2"><span className="avatar h-8 w-8 bg-[#eaf0fb] text-[#45618d]">{initials(project.clientName)}</span>{project.clientName}</span></td><td>{project.ownerName}</td><td><ProgressBar completed={project.completedTasks} total={project.totalTasks} /></td><td><StatusBadge status={`${project.status}-project`} /></td><td className="text-muted">{formatDate(project.createdAt)}</td><td><Link href={`/admin/projects/${project.id}`} aria-label={`Open ${project.projectName}`} className="text-xl text-muted">›</Link></td></tr>)}</tbody></table></div>
      {visible.length === 0 && <div className="p-12 text-center text-sm text-muted">No projects match this view.</div>}
    </section>

    {showModal && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create project"><div className="modal-card">
      <div className="flex items-start justify-between"><div><p className="page-eyebrow">Step {step} of 2</p><h2 className="text-2xl font-bold">{step === 1 ? 'Create a new project' : 'Client information'}</h2><p className="mt-2 text-sm text-muted">{step === 1 ? 'Name the engagement and confirm its owner.' : 'Invite a new client or choose someone already in the portal.'}</p></div><button onClick={closeModal} className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#f1f4f7]" aria-label="Close">×</button></div>
      <div className="my-7 flex gap-2"><span className="h-1.5 flex-1 rounded-full bg-teal"/><span className={`h-1.5 flex-1 rounded-full ${step === 2 ? 'bg-teal' : 'bg-[#e6eaef]'}`}/></div>
      {step === 1 ? <div className="space-y-5"><Field label="Project name" value={projectName} onChange={setProjectName} placeholder="e.g. Adeel Ahmed" /><label><span className="field-label">Project owner</span><select className="field-select"><option>{ownerName} (you)</option></select></label></div> : <div>
        {clients.length > 0 && <div className="mb-5 flex rounded-xl bg-[#eef2f5] p-1"><button onClick={() => setClientMode('new')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${clientMode === 'new' ? 'bg-white shadow-sm' : 'text-muted'}`}>New client</button><button onClick={() => setClientMode('existing')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${clientMode === 'existing' ? 'bg-white shadow-sm' : 'text-muted'}`}>Existing client</button></div>}
        {clientMode === 'new' ? <div className="space-y-5"><Field label="Full name" value={fullName} onChange={setFullName} placeholder="Client’s full name" /><Field label="Email" type="email" value={email} onChange={setEmail} placeholder="client@example.com" /><Field label="Company (optional)" value={company} onChange={setCompany} placeholder="Company name" /></div> : <label><span className="field-label">Client</span><select className="field-select" value={clientId} onChange={(event) => setClientId(event.target.value)}>{clients.map((client) => <option key={client.id} value={client.id}>{client.fullName} — {client.email}</option>)}</select></label>}
      </div>}
      {message && <p className="mt-5 rounded-xl bg-[#fff4dd] p-3 text-sm text-[#815d14]">{message}</p>}
      <div className="mt-8 flex justify-end gap-3 border-t border-line pt-5">{step === 2 && <button className="button-secondary" onClick={() => setStep(1)}>Back</button>}<button className="button-primary" disabled={saving} onClick={() => step === 1 ? projectName.trim().length >= 2 && setStep(2) : submitProject()}>{saving ? 'Creating…' : step === 1 ? 'Continue' : 'Create project'}</button></div>
    </div></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="card p-4 md:p-5"><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>; }
function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) { return <label><span className="field-label">{label}</span><input className="field-input" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
