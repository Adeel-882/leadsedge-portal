'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, X } from '@phosphor-icons/react';
import { administratorInvitationSchema, type AdministratorsResponse, type AdministratorEntry } from '@/lib/administrator-invitations';

export function Administrators() {
  const [data, setData] = useState<AdministratorsResponse | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [revoke, setRevoke] = useState<AdministratorEntry | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/admin/administrators', { cache: 'no-store', signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load administrators.');
      setData(result);
    } catch (failure) { if (!signal?.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load administrators.'); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return reload(controller.signal); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => { if (open || revoke) dialog.current?.showModal(); else dialog.current?.close(); }, [open, revoke]);
  async function mutate(url: string, payload: unknown) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The invitation could not be updated.');
      setNotice(result.message); setOpen(false); setRevoke(null); setName(''); setEmail('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The invitation could not be updated.'); }
    finally { await reload(); setBusy(false); }
  }
  function invite(event: FormEvent) {
    event.preventDefault();
    const parsed = administratorInvitationSchema.safeParse({ fullName: name, email });
    if (!parsed.success) { setError('Enter a name of 2–120 characters and a valid email address.'); return; }
    void mutate('/api/admin/administrators', parsed.data);
  }
  function close() { if (!busy) { setOpen(false); setRevoke(null); setError(''); } }
  const rows = [...(data?.administrators || []), ...(data?.invitations || [])];
  return <div className="page-wrap">
    <Link href="/admin/settings" className="text-sm text-muted">← Settings</Link>
    <div className="page-header mt-4 flex flex-wrap items-end justify-between gap-4"><div><p className="page-eyebrow">Your team</p><h1 className="page-title">Administrators</h1><p className="page-subtitle">Manage the people who have administrative access to LeadsEdge Portal.</p></div><button className="button-primary" disabled={!data?.available || busy} onClick={() => { setError(''); setOpen(true); }}><Plus size={18} aria-hidden />Add Administrator</button></div>
    <p className="mb-5 text-sm text-muted">Every administrator has full access and can invite other administrators.</p>
    {data?.error && <p role="status" className="mb-4 rounded-lg border border-line bg-surface-subtle p-4 text-sm">{data.error}</p>}
    {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}
    {error && !open && !revoke && <p role="alert" className="mb-4 text-sm text-danger">{error} <button className="button-ghost" onClick={() => void reload()}>Retry</button></p>}
    <section className="surface-flat overflow-x-auto" aria-label="Administrator list"><table className="data-table w-full"><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Date added</th><th>Invited by</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}><td className="font-semibold">{row.fullName}</td><td>{row.email}</td><td><span className="status-pill">{row.status}</span>{row.deliveryFailed && <span className="mt-1 block text-xs text-danger">Email not delivered</span>}</td><td><time dateTime={row.addedAt}>{row.addedAt.slice(0, 10)}</time></td><td>{row.invitedBy || '—'}</td><td>{row.status !== 'Active' && <div className="flex gap-2"><button className="button-secondary" disabled={busy} onClick={() => void mutate(`/api/admin/administrators/${row.id}`, { action: 'resend' })}>Resend</button><button className="button-ghost text-danger" disabled={busy} onClick={() => { setError(''); setRevoke(row); }}>Revoke</button></div>}</td></tr>)}
      {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-muted">{data ? 'No administrators to display.' : 'Loading administrators…'}</td></tr>}
    </tbody></table></section>
    <dialog ref={dialog} className="modal-card m-auto border border-line bg-surface text-ink" style={{ width: 'calc(100% - 32px)', maxWidth: '32rem' }} aria-labelledby="administrator-dialog-title" onCancel={event => { if (busy) event.preventDefault(); else close(); }}>
      <div className="flex items-start justify-between gap-4"><h2 id="administrator-dialog-title" className="text-2xl font-bold">{revoke ? 'Revoke invitation?' : 'Add Administrator'}</h2><button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={close}><X size={18} aria-hidden /></button></div>
      {revoke ? <><p className="mt-5 text-sm leading-6">The invitation for {revoke.email} will no longer grant administrator access. Existing administrators are unaffected.</p>{error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}<div className="mt-7 flex justify-end gap-3"><button className="button-secondary" disabled={busy} onClick={close}>Cancel</button><button className="button-primary" disabled={busy} onClick={() => void mutate(`/api/admin/administrators/${revoke.id}`, { action: 'revoke' })}>{busy ? 'Revoking…' : 'Revoke Invitation'}</button></div></> : <form onSubmit={invite}><p className="mt-3 text-sm leading-6 text-muted">Invite someone you trust. They will have the same full access as every other administrator.</p><div className="mt-6 space-y-5"><label className="block"><span className="field-label">Full Name</span><input autoComplete="name" className="field-input" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={120} required disabled={busy} /></label><label className="block"><span className="field-label">Email Address</span><input type="email" autoComplete="email" className="field-input" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy} /></label></div>{error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}<div className="mt-7 flex justify-end gap-3 border-t border-line pt-5"><button type="button" className="button-secondary" disabled={busy} onClick={close}>Cancel</button><button className="button-primary" disabled={busy}>{busy ? 'Sending…' : 'Send Invitation'}</button></div></form>}
    </dialog>
  </div>;
}
