'use client';
import { useCacheMutation } from '@/components/cached-screen';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarBlank, DotsThreeVertical, FolderOpen, MagnifyingGlass, PaperPlaneTilt, Plus, Trash, UserMinus, X } from '@phosphor-icons/react';
import { InvitationToast, resendProjectInvitation, type InvitationToastState } from '@/components/admin/invite-button';
import { ProgressBar } from '@/components/progress-bar';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, initials } from '@/lib/format';
import type { ClientSummary, MeetingRecord, ProjectSummary } from '@/lib/types';

export function DashboardClient({ projects, clients, ownerName, upcomingMeeting }: { projects: ProjectSummary[]; clients: ClientSummary[]; ownerName: string; upcomingMeeting: MeetingRecord | null }) {
  const invalidate = useCacheMutation();
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
  const [actionProjectId, setActionProjectId] = useState<string | null>(null);
  const [invitationProjectId, setInvitationProjectId] = useState<string | null>(null);
  const [invitationToast, setInvitationToast] = useState<InvitationToastState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleteClient, setDeleteClient] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

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
      await invalidate('project');
      if (result.projectId && !result.warning) router.push(`/admin/projects/${result.projectId}/tasks`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create the project.'); }
    finally { setSaving(false); }
  }

  async function deleteProject() {
    if (!deleteTarget) return;
    setSaving(true); setMessage('');
    const response = await fetch(`/api/admin/projects/${deleteTarget.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName: deleteConfirmation, deleteClient }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setMessage(result.error || 'Project could not be deleted.');
    else { setDeleteTarget(null); setDeleteConfirmation(''); setActionProjectId(null); await invalidate('project'); }
    setSaving(false);
  }

  function confirmDelete(project: ProjectSummary, withClient: boolean) {
    setActionProjectId(null); setDeleteTarget(project); setDeleteClient(withClient); setDeleteConfirmation(''); setMessage('');
  }

  async function resendInvitation(projectId: string) {
    if (invitationProjectId) return;
    setInvitationProjectId(projectId);
    setInvitationToast(null);
    try {
      const result = await resendProjectInvitation(projectId);
      setInvitationToast({ message: result.message, tone: 'success' });
      setActionProjectId(null);
      await invalidate('project');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invitation could not be sent. Please try again.';
      setInvitationToast({ message: errorMessage, tone: 'error' });
    } finally {
      setInvitationProjectId(null);
    }
  }

  return <div className="page-wrap">
    <div className="page-header page-header-row">
      <div><p className="page-eyebrow">Operations</p><h1 className="page-title">Projects</h1><p className="page-subtitle">Track client work, lead progress, and the next action from one focused workspace.</p></div>
      <button className="button-primary" onClick={() => setShowModal(true)}><Plus size={16} weight="bold" aria-hidden />New project</button>
    </div>

    {upcomingMeeting && <Link prefetch={false} href={`/admin/meetings/${upcomingMeeting.id}`} className="mb-4 flex flex-col gap-3 rounded-[10px] border border-line bg-brand-soft p-4 transition hover:border-brand sm:flex-row sm:items-center"><span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface text-brand-text"><CalendarBlank size={18} weight="regular" aria-hidden /></span><div><p className="text-[11px] font-semibold text-brand-text">Upcoming meeting</p><p className="mt-0.5 text-sm font-bold">{upcomingMeeting.clientName} <span aria-hidden>•</span> {upcomingMeeting.projectName}</p></div><div className="sm:ml-auto sm:text-right"><p className="text-sm font-semibold">{formatDate(upcomingMeeting.startAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: upcomingMeeting.timezone })}</p><p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">View meeting <ArrowRight size={12} aria-hidden /></p></div></Link>}

    <div className="metric-strip mb-4">
      <Metric label="Active projects" value={projects.filter((project) => project.status === 'active').length} />
      <Metric label="Completed" value={projects.filter((project) => project.status === 'completed').length} />
      <Metric label="Open tasks" value={projects.reduce((sum, project) => sum + project.totalTasks - project.completedTasks, 0)} />
      <Metric label="Clients" value={new Set(projects.map((project) => project.clientId)).size} />
    </div>

    <section className="surface-flat overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <label className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 sm:max-w-md"><MagnifyingGlass size={17} className="text-muted" aria-hidden /><span className="sr-only">Search projects or clients</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-[13px] outline-none" placeholder="Search projects or clients" /></label>
        <div className="flex rounded-lg bg-surface-subtle p-1" role="group" aria-label="Project status filter">{(['active', 'completed', 'all'] as const).map((item) => <button key={item} aria-pressed={status === item} onClick={() => setStatus(item)} className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${status === item ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{item}</button>)}</div>
      </div>
      <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Project</th><th>Client</th><th>Owner</th><th>Progress</th><th>Status</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((project) => <tr key={project.id}><td><Link prefetch={false} href={`/admin/projects/${project.id}`} className="flex items-center gap-3 font-semibold"><span className="avatar h-9 w-9 bg-brand-soft text-brand-text"><FolderOpen size={17} weight="fill" aria-hidden /></span><span>{project.projectName}</span></Link></td><td><span className="flex items-center gap-2"><span className="avatar h-8 w-8 bg-brand-soft text-brand-text">{initials(project.clientName)}</span>{project.clientName}</span></td><td className="text-muted">{project.ownerName}</td><td><ProgressBar completed={project.completedTasks} total={project.totalTasks} /></td><td><StatusBadge status={`${project.status}-project`} /></td><td className="text-muted">{formatDate(project.createdAt)}</td><td className="relative"><button aria-label={`Actions for ${project.projectName}`} aria-expanded={actionProjectId === project.id} className="icon-button" onClick={() => setActionProjectId(actionProjectId === project.id ? null : project.id)}><DotsThreeVertical size={19} weight="bold" aria-hidden /></button>{actionProjectId === project.id && <div className="absolute right-3 z-40 w-60 rounded-lg border border-line bg-surface p-1.5 text-left shadow-menu"><Link prefetch={false} href={`/admin/projects/${project.id}`} className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-semibold hover:bg-brand-soft"><FolderOpen size={16} aria-hidden />Open project</Link><button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-60" disabled={invitationProjectId !== null} onClick={() => resendInvitation(project.id)}><PaperPlaneTilt size={16} aria-hidden />{invitationProjectId === project.id ? 'Sending...' : 'Resend client invitation'}</button><div className="my-1 border-t border-line" /><button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] hover:bg-brand-soft" onClick={() => confirmDelete(project, false)}><Trash size={16} aria-hidden />Delete project</button><button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] text-danger hover:bg-danger-soft" onClick={() => confirmDelete(project, true)}><UserMinus size={16} aria-hidden />Delete project & client</button></div>}</td></tr>)}</tbody></table></div>
      {visible.length === 0 && <div className="p-12 text-center text-sm text-muted">No projects match this view.</div>}
    </section>

    <InvitationToast toast={invitationToast} />

    {showModal && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create project"><div className="modal-card">
      <div className="flex items-start justify-between gap-5"><div><p className="page-eyebrow">{step === 1 ? 'Project details' : 'Client details'} <span className="text-muted">({step}/2)</span></p><h2 className="text-2xl font-bold">{step === 1 ? 'Create a new project' : 'Choose the primary client'}</h2><p className="mt-2 text-sm leading-6 text-muted">{step === 1 ? 'Name the engagement and confirm its owner.' : 'Invite a new client or choose someone already in the portal.'}</p></div><button onClick={closeModal} className="icon-button" aria-label="Close"><X size={19} aria-hidden /></button></div>
      <div className="my-6 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface-subtle text-xs font-semibold"><span className={`px-3 py-2.5 ${step === 1 ? 'bg-brand-soft text-brand-text' : 'text-muted'}`}>Project</span><span className={`border-l border-line px-3 py-2.5 ${step === 2 ? 'bg-brand-soft text-brand-text' : 'text-muted'}`}>Client</span></div>
      {step === 1 ? <div className="space-y-5"><Field label="Project name" value={projectName} onChange={setProjectName} placeholder="e.g. Adeel Ahmed" /><label><span className="field-label">Project owner</span><select className="field-select"><option>{ownerName} (you)</option></select></label></div> : <div>
        {clients.length > 0 && <div className="mb-5 flex rounded-xl bg-info-soft p-1"><button onClick={() => setClientMode('new')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${clientMode === 'new' ? 'bg-surface shadow-sm' : 'text-muted'}`}>New client</button><button onClick={() => setClientMode('existing')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${clientMode === 'existing' ? 'bg-surface shadow-sm' : 'text-muted'}`}>Existing client</button></div>}
        {clientMode === 'new' ? <div className="space-y-5"><Field label="Full name" value={fullName} onChange={setFullName} placeholder="Client’s full name" /><Field label="Email" type="email" value={email} onChange={setEmail} placeholder="client@example.com" /><Field label="Company (optional)" value={company} onChange={setCompany} placeholder="Company name" /></div> : <label><span className="field-label">Client</span><select className="field-select" value={clientId} onChange={(event) => setClientId(event.target.value)}>{clients.map((client) => <option key={client.id} value={client.id}>{client.fullName} - {client.email}</option>)}</select></label>}
      </div>}
      {message && <p className="mt-5 rounded-xl bg-warning-soft p-3 text-sm text-warning">{message}</p>}
      <div className="mt-8 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">{step === 2 && <button className="button-secondary" onClick={() => setStep(1)}>Back</button>}<button className="button-primary" disabled={saving || (step === 1 && projectName.trim().length < 2)} onClick={() => step === 1 ? setStep(2) : submitProject()}>{saving ? 'Creating...' : step === 1 ? 'Continue' : 'Create project'}</button></div>
    </div></div>}
    {deleteTarget && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm deletion"><div className="modal-card"><div className="flex items-start justify-between"><div><p className="page-eyebrow">Permanent action</p><h2 className="text-2xl font-bold">{deleteClient ? 'Delete project & client' : 'Delete project'}</h2></div><button aria-label="Close deletion dialog" className="button-ghost h-9 w-9 p-0" onClick={() => setDeleteTarget(null)}><X size={18} aria-hidden /></button></div><div className="mt-6 rounded-lg bg-danger-soft p-4 text-sm text-danger">{deleteClient ? 'This removes the project, its tasks, conversations, submissions, notifications, client record, and the client authentication account. It is allowed only when the client has no other projects.' : 'This removes the project and all project-owned tasks, messages, submissions, and notifications. The client account is retained.'}</div><label className="mt-5 block"><span className="field-label">Type “{deleteTarget.projectName}” to confirm</span><input className="field-input" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label>{message && <p role="alert" className="mt-4 text-sm text-danger">{message}</p>}<div className="mt-7 flex justify-end gap-3 border-t border-line pt-5"><button className="button-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button><button className="button-danger" disabled={saving || deleteConfirmation !== deleteTarget.projectName} onClick={deleteProject}>{saving ? 'Deleting...' : deleteClient ? 'Delete project & client' : 'Delete project'}</button></div></div></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="metric-item"><p className="metric-label">{label}</p><p className="metric-value">{value}</p></div>; }
function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) { return <label><span className="field-label">{label}</span><input className="field-input" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
