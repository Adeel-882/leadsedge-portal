'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Clock } from '@phosphor-icons/react';
import type { MeetingSlot, ProjectSummary } from '@/lib/types';

function today() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function MeetingScheduler({ projects }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<MeetingSlot[]>([]);
  const [timezone, setTimezone] = useState('UTC');
  const [ownerName, setOwnerName] = useState(projects[0]?.ownerName || 'Administrator');
  const [duration, setDuration] = useState(30);
  const [selected, setSelected] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projectId, projects]);

  useEffect(() => {
    if (!projectId || !date) return;
    let active = true;
    fetch(`/api/portal/meetings/slots?projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(date)}`)
      .then(async (response) => ({ response, result: await response.json() as { slots?: MeetingSlot[]; settings?: { timezone?: string; meetingDurationMinutes?: number }; ownerName?: string; error?: string } }))
      .then(({ response, result }) => {
        if (!active) return;
        if (!response.ok) setError(result.error || 'Availability could not be loaded.');
        else {
          setSlots(result.slots || []);
          setTimezone(result.settings?.timezone || 'UTC');
          setOwnerName(result.ownerName || 'Administrator');
          setDuration(result.settings?.meetingDurationMinutes || 30);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, date]);

  // Loading is raised by the deliberate choice, not by mounting, so an untouched
  // scheduler never shows a spinner and never requests availability.
  function changeProject(next: string) { setProjectId(next); setLoading(Boolean(date)); setError(''); setSelected(''); setSlots([]); }
  function changeDate(next: string) { setDate(next); setLoading(Boolean(next)); setError(''); setSelected(''); setSlots([]); }

  async function book() {
    if (!selected || !project) return;
    setBooking(true);
    setError('');
    const response = await fetch('/api/portal/meetings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, startAt: selected, timezone, title: `${project.projectName} meeting`, description: `Meeting with ${ownerName}` }) });
    const result = await response.json() as { error?: string; meetingId?: string };
    if (!response.ok) {
      setError(result.error || 'Meeting could not be booked.');
      setBooking(false);
      return;
    }
    router.push(`/portal/meetings/${result.meetingId}`);
    router.refresh();
  }

  if (!projects.length) return <div className="surface-flat p-6 text-sm text-muted">A project is required before you can schedule a meeting.</div>;

  return <>
    <section className="surface-flat p-5 md:p-6">
      <div><p className="page-eyebrow">Book a time</p><h2 className="text-xl font-bold tracking-[-.02em]">Schedule a project meeting</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Only genuinely available times are shown. Times use your project owner’s scheduling timezone.</p></div>
      <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-[#f8faf9] text-center text-[11px] font-semibold text-muted"><span className="border-r border-line px-2 py-2.5 text-teal">1. Select date</span><span className="border-r border-line px-2 py-2.5">2. Select time</span><span className="px-2 py-2.5">3. Confirm</span></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {projects.length === 1 && project
          ? <div><span className="field-label">Project</span><div className="field-input flex h-auto min-h-11 flex-col justify-center py-2"><span className="font-semibold text-ink">{project.projectName}</span><span className="mt-0.5 text-xs text-muted">Project owner: {project.ownerName}</span></div></div>
          : <label><span className="field-label">Project</span><select className="field-select" value={projectId} onChange={(event) => changeProject(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.projectName}</option>)}</select></label>}
        <label><span className="field-label">Date</span><input className="field-input" type="date" min={today()} value={date} onChange={(event) => changeDate(event.target.value)} /></label>
      </div>
      <div className="mt-5"><div className="flex items-center justify-between"><span className="field-label inline-flex items-center gap-1.5"><Clock size={15} aria-hidden />Available times</span><span className="text-xs text-muted">{date ? timezone : ''}</span></div>{loading ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[1, 2, 3, 4].map((item) => <span key={item} className="skeleton h-11" />)}</div> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{slots.map((slot) => <button key={slot.startAt} aria-pressed={selected === slot.startAt} className={`min-h-11 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${selected === slot.startAt ? 'border-teal bg-[#e6f1ef] text-teal' : 'border-line bg-white hover:border-[#b7c8c3]'}`} onClick={() => setSelected(slot.startAt)}>{slot.label}</button>)}</div>}{!loading && !date && !error && <p className="rounded-lg bg-[#f2f4f3] p-5 text-sm text-muted">Choose a date to see available times.</p>}{!loading && date && !slots.length && !error && <p className="rounded-lg bg-[#f2f4f3] p-5 text-sm text-muted">No available times on this date.</p>}</div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-[#faeeee] p-3 text-sm text-[#8f3030]">{error}</p>}
      <div className="mt-6 flex justify-end"><button className="button-primary w-full sm:w-auto" disabled={!selected} onClick={() => setShowConfirm(true)}><CheckCircle size={16} aria-hidden />Review meeting</button></div>
    </section>

    {showConfirm && selected && project && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-meeting-title"><div className="modal-card max-w-lg"><p className="page-eyebrow">Final step</p><h2 id="confirm-meeting-title" className="text-2xl font-bold">Confirm meeting</h2><dl className="mt-6 grid gap-4 rounded-lg border border-line bg-[#f8faf9] p-5 sm:grid-cols-2"><ConfirmDetail label="Project owner" value={project.ownerName} /><ConfirmDetail label="Date" value={new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium' }).format(new Date(selected))} /><ConfirmDetail label="Time" value={new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeStyle: 'short' }).format(new Date(selected))} /><ConfirmDetail label="Duration" value={`${duration} minutes`} /><ConfirmDetail label="Timezone" value={timezone} /></dl>{error && <p role="alert" className="mt-4 rounded-lg bg-[#faeeee] p-3 text-sm text-[#8f3030]">{error}</p>}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button autoFocus className="button-secondary" disabled={booking} onClick={() => setShowConfirm(false)}>Cancel</button><button className="button-primary" disabled={booking} onClick={book}>{booking ? 'Booking...' : 'Confirm meeting'}</button></div></div></div>}
  </>;
}

function ConfirmDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold text-muted">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>;
}
