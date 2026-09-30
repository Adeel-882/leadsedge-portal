'use client';
import { useCacheMutation } from '@/components/cached-screen';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Buildings, EnvelopeSimple, IdentificationCard, NotePencil, Phone, X } from '@phosphor-icons/react';
import { initials } from '@/lib/format';
import type { PersonBase } from '@/lib/people';

const tabs = ['overview', 'projects', 'forms', 'emails', 'activity'] as const;

export function PersonProfileHeader({ person, activeTab }: { person: PersonBase; activeTab: string }) {
  const invalidate = useCacheMutation();
  const router = useRouter(); const [editing, setEditing] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [fullName, setFullName] = useState(person.fullName); const [company, setCompany] = useState(person.company || ''); const [title, setTitle] = useState(person.title || ''); const [phone, setPhone] = useState(person.phone || '');
  async function save() { setSaving(true); setError(''); const response = await fetch(`/api/admin/people/${person.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, company, title, phone }) }); const body = await response.json() as { error?: string }; if (!response.ok) setError(body.error || 'Unable to update this person.'); else { setEditing(false); await invalidate('person'); router.refresh(); } setSaving(false); }
  return <><div className="page-header"><div className="flex flex-col gap-5 sm:flex-row sm:items-start"><span className="avatar h-16 w-16 bg-[#163b34] text-xl text-white">{initials(person.fullName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="page-title">{person.fullName}</h1><button className="icon-button" aria-label="Edit person" onClick={() => setEditing(true)}><NotePencil size={19} /></button></div><div className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-2 lg:max-w-2xl"><span className="flex items-center gap-2"><Buildings size={17} />{person.company || 'No company'}</span><span className="flex items-center gap-2"><EnvelopeSimple size={17} />{person.email}</span><span className="flex items-center gap-2"><IdentificationCard size={17} />{person.title || 'No title'}</span><span className="flex items-center gap-2"><Phone size={17} />{person.phone || 'No phone'}</span></div></div><Link prefetch={false} className="button-secondary" href={`/admin/people/${person.id}/preview`}>Preview portal</Link></div></div>
    <nav className="person-tabs" aria-label="Person sections">{tabs.map((tab) => <Link prefetch={false} key={tab} href={`/admin/people/${person.id}?tab=${tab}`} aria-current={activeTab === tab ? 'page' : undefined} className={activeTab === tab ? 'active' : ''}>{tab[0].toUpperCase() + tab.slice(1)}</Link>)}</nav>
    {editing && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit person"><div className="modal-card"><div className="flex items-start justify-between"><div><p className="page-eyebrow">Client profile</p><h2 className="text-2xl font-bold">Edit person</h2><p className="mt-2 text-sm text-muted">Email remains read-only because it is the linked Supabase Auth identity.</p></div><button className="icon-button" onClick={() => setEditing(false)} aria-label="Close"><X size={19} /></button></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="Full name" value={fullName} set={setFullName} /><label><span className="field-label">Email</span><input className="field-input bg-[#f2f4f3]" disabled value={person.email} /></label><Field label="Company" value={company} set={setCompany} /><Field label="Title" value={title} set={setTitle} /><Field label="Phone" value={phone} set={setPhone} /></div>{error && <p role="alert" className="mt-4 text-sm text-[#a34343]">{error}</p>}<div className="mt-7 flex justify-end gap-2 border-t border-line pt-5"><button className="button-secondary" onClick={() => setEditing(false)}>Cancel</button><button className="button-primary" disabled={saving || fullName.trim().length < 2} onClick={save}>{saving ? 'Saving...' : 'Save changes'}</button></div></div></div>}
  </>;
}
function Field({ label, value, set }: { label: string; value: string; set: (value: string) => void }) { return <label><span className="field-label">{label}</span><input className="field-input" value={value} onChange={(event) => set(event.target.value)} /></label>; }
