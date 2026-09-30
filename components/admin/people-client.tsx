'use client';
import { useCacheMutation } from '@/components/cached-screen';

import Link from 'next/link';
import { useState } from 'react';
import { DotsThreeVertical, EnvelopeSimple, FolderOpen, MagnifyingGlass, PaperPlaneTilt, Plus, UserCircle, X } from '@phosphor-icons/react';
import { InvitationToast, resendProjectInvitation, type InvitationToastState } from './invite-button';
import { formatDate, initials } from '@/lib/format';
import type { PersonListRow } from '@/lib/people';

export function PeopleClient({ people, search, page, total }: { people: PersonListRow[]; search: string; page: number; total: number }) {
  const invalidate = useCacheMutation();
  const [showNew, setShowNew] = useState(false);
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [company, setCompany] = useState('');
  const [title, setTitle] = useState(''); const [phone, setPhone] = useState(''); const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null); const [sendingId, setSendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<InvitationToastState | null>(null);
  const pages = Math.max(1, Math.ceil(total / 25));

  function close() { setShowNew(false); setStep(1); setMessage(''); setFullName(''); setEmail(''); setCompany(''); setTitle(''); setPhone(''); setProjectName(''); }
  async function createPerson() {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/admin/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName, client: { mode: 'new', fullName, email, company, title, phone } }) });
      const result = await response.json() as { error?: string; warning?: string; projectId?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to create this person.');
      close(); await invalidate('project');
      if (result.warning) setToast({ tone: 'error', message: result.warning }); else setToast({ tone: 'success', message: 'Person, project, and portal invitation created.' });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create this person.'); }
    finally { setSaving(false); }
  }
  async function resend(person: PersonListRow) {
    if (!person.firstProjectId) return;
    setSendingId(person.id); setToast(null);
    try { const result = await resendProjectInvitation(person.firstProjectId); setToast({ tone: 'success', message: result.message }); setMenuId(null); }
    catch (error) { setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Invitation could not be sent.' }); }
    finally { setSendingId(null); }
  }

  return <div className="page-wrap">
    <div className="page-header page-header-row"><div><p className="page-eyebrow">Client CRM</p><h1 className="page-title">All People</h1><p className="page-subtitle">Clients, their projects, portal access, and relationship history.</p></div><button className="button-primary" onClick={() => setShowNew(true)}><Plus size={16} weight="bold" />New person</button></div>
    <section className="surface-flat overflow-hidden">
      <div className="border-b border-line p-4 sm:p-5"><form action="/admin/people" className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-white px-3"><MagnifyingGlass size={17} className="text-muted" /><label className="sr-only" htmlFor="people-search">Search people</label><input id="people-search" name="q" defaultValue={search} className="w-full bg-transparent text-[13px] outline-none" placeholder="Search name, email, company, or project" /></form></div>
      <div className="overflow-x-auto"><table className="data-table min-w-[980px]"><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Projects</th><th>Added</th><th>Last login</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td><Link prefetch={false} href={`/admin/people/${person.id}`} className="flex items-center gap-3 font-semibold"><span className="avatar h-9 w-9 bg-[#e6f1ef] text-teal">{initials(person.fullName)}</span>{person.fullName}</Link></td><td><a href={`mailto:${person.email}`} className="inline-flex items-center gap-2 text-muted hover:text-ink"><EnvelopeSimple size={16} />{person.email}</a></td><td>{person.company || '—'}</td><td>{person.projectCount === 1 ? person.projectNames[0] : `${person.projectCount} projects`}</td><td className="text-muted">{formatDate(person.createdAt)}</td><td className="text-muted">{person.lastLoginAt ? formatDate(person.lastLoginAt) : 'Never'}</td><td className="relative"><button className="icon-button" aria-label={`Actions for ${person.fullName}`} onClick={() => setMenuId(menuId === person.id ? null : person.id)}><DotsThreeVertical size={19} weight="bold" /></button>{menuId === person.id && <div className="absolute right-3 z-40 w-56 rounded-lg border border-line bg-white p-1.5 shadow-[0_14px_40px_rgba(19,42,35,.13)]"><Link prefetch={false} href={`/admin/people/${person.id}`} className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-semibold hover:bg-[#f0f3f2]"><UserCircle size={16} />Open person</Link>{person.firstProjectId && <><Link prefetch={false} href={`/admin/projects/${person.firstProjectId}`} className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] hover:bg-[#f0f3f2]"><FolderOpen size={16} />Open project</Link><button disabled={sendingId !== null} onClick={() => resend(person)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] hover:bg-[#f0f3f2] disabled:opacity-60"><PaperPlaneTilt size={16} />{sendingId === person.id ? 'Sending...' : 'Resend invitation'}</button></>}</div>}</td></tr>)}</tbody></table></div>
      {!people.length && <div className="p-12 text-center text-sm text-muted">No people match this search.</div>}
      {total > 25 && <div className="flex items-center justify-between border-t border-line px-5 py-4 text-xs text-muted"><span>{total} people</span><div className="flex gap-2">{page > 1 && <Link prefetch={false} className="button-secondary" href={`/admin/people?page=${page - 1}${search ? `&q=${encodeURIComponent(search)}` : ''}`}>Previous</Link>}{page < pages && <Link prefetch={false} className="button-secondary" href={`/admin/people?page=${page + 1}${search ? `&q=${encodeURIComponent(search)}` : ''}`}>Next</Link>}</div></div>}
    </section>
    <InvitationToast toast={toast} />
    {showNew && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="New person"><div className="modal-card"><div className="flex items-start justify-between"><div><p className="page-eyebrow">New person <span className="text-muted">({step}/3)</span></p><h2 className="text-2xl font-bold">{step === 1 ? 'Client details' : step === 2 ? 'Project details' : 'Review and invite'}</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={19} /></button></div>
      <div className="my-6 grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-[#f8faf9] text-xs font-semibold">{['Client','Project','Review'].map((label,index) => <span key={label} className={`border-r border-line px-3 py-2.5 last:border-r-0 ${step === index + 1 ? 'bg-[#e6f1ef] text-teal' : 'text-muted'}`}>{label}</span>)}</div>
      {step === 1 && <div className="grid gap-5 sm:grid-cols-2"><Field label="Full name *" value={fullName} onChange={setFullName} /><Field label="Email *" type="email" value={email} onChange={setEmail} /><Field label="Company" value={company} onChange={setCompany} /><Field label="Title" value={title} onChange={setTitle} /><Field label="Phone" value={phone} onChange={setPhone} /></div>}
      {step === 2 && <Field label="Project name *" value={projectName} onChange={setProjectName} />}
      {step === 3 && <div className="rounded-lg border border-line bg-[#f8faf9] p-5 text-sm"><p className="font-bold">{fullName}</p><p className="mt-1 text-muted">{email}{company ? ` • ${company}` : ''}</p><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Project</p><p className="mt-1 font-semibold">{projectName}</p><p className="mt-4 text-xs leading-5 text-muted">This reuses the existing client/project creation and secure portal invitation flow.</p></div>}
      {message && <p role="alert" className="mt-5 rounded-lg bg-[#fff4dd] p-3 text-sm text-[#815d14]">{message}</p>}
      <div className="mt-8 flex justify-end gap-2 border-t border-line pt-5">{step > 1 && <button className="button-secondary" onClick={() => setStep(step - 1)}>Back</button>}<button className="button-primary" disabled={saving || (step === 1 && (fullName.trim().length < 2 || !email.includes('@'))) || (step === 2 && projectName.trim().length < 2)} onClick={() => step < 3 ? setStep(step + 1) : createPerson()}>{saving ? 'Creating...' : step < 3 ? 'Continue' : 'Create and invite'}</button></div>
    </div></div>}
  </div>;
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label><span className="field-label">{label}</span><input className="field-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
