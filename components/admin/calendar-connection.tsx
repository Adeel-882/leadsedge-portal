'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, GoogleLogo, WarningCircle } from '@phosphor-icons/react';

export function CalendarConnection({ configured, connected, email, statusMessage }: { configured: boolean; connected: boolean; email: string | null; statusMessage?: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  async function disconnect() { if (!window.confirm('Disconnect Google Calendar? Existing Leadsedge meetings will remain.')) return; setBusy(true); await fetch('/api/admin/calendar/google/disconnect', { method: 'POST' }); router.refresh(); setBusy(false); }
  return <section className="surface-flat p-5 md:p-6"><p className="page-eyebrow">Calendar</p><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div className="flex gap-3"><span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-[#f0f3f2] text-[#4a5a55]"><GoogleLogo size={20} weight="bold" aria-hidden /></span><div><h2 className="section-title">Google Calendar</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted">Hide busy time from clients and add confirmed bookings to your primary calendar.</p>{connected && <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal"><CheckCircle size={16} weight="fill" aria-hidden />Connected{email ? ` as ${email}` : ''}</p>}{!configured && <p className="mt-3 inline-flex items-start gap-1.5 text-sm leading-5 text-[#875f1b]"><WarningCircle className="mt-0.5 flex-none" size={16} aria-hidden />Add the Google OAuth server variables to enable this connection.</p>}{statusMessage && <p className="mt-3 text-sm text-muted">{statusMessage}</p>}</div></div>{connected ? <button className="button-secondary" disabled={busy} onClick={disconnect}>{busy ? 'Disconnecting...' : 'Disconnect'}</button> : <a className={`button-primary ${!configured ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={!configured} href="/api/admin/calendar/google/connect">Connect</a>}</div></section>;
}
