import Link from 'next/link';
import { ArrowRight, CalendarBlank, ClockCounterClockwise, XCircle } from '@phosphor-icons/react/dist/ssr';
import { requireRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { getMeetings } from '@/lib/meetings';
import { currentTimestamp } from '@/lib/clock';

export default async function MeetingsPage() {
  await requireRole('admin');
  const meetings = await getMeetings();
  const now = currentTimestamp();
  const upcoming = meetings.filter((item) => item.status === 'scheduled' && Date.parse(item.startAt) >= now);
  const past = meetings.filter((item) => item.status !== 'cancelled' && Date.parse(item.startAt) < now);
  const cancelled = meetings.filter((item) => item.status === 'cancelled');

  return <div className="page-wrap">
    <div className="page-header"><p className="page-eyebrow">Scheduling</p><h1 className="page-title">Meetings</h1><p className="page-subtitle">Review scheduled client calls, past meetings, and cancellations.</p></div>
    <div className="metric-strip metric-strip-3"><Metric icon={<CalendarBlank size={17} weight="fill" aria-hidden />} label="Upcoming" value={upcoming.length} /><Metric icon={<ClockCounterClockwise size={17} aria-hidden />} label="Past" value={past.length} /><Metric icon={<XCircle size={17} aria-hidden />} label="Cancelled" value={cancelled.length} /></div>
    <MeetingSection title="Upcoming" description="Scheduled calls that still need attention." meetings={upcoming} empty="No upcoming meetings." />
    <MeetingSection title="Past" description="Completed meeting history." meetings={past} empty="No past meetings." />
    <MeetingSection title="Cancelled" description="Meetings cancelled by either participant." meetings={cancelled} empty="No cancelled meetings." />
  </div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="metric-item"><div className="flex items-center gap-2 text-muted">{icon}<p className="metric-label">{label}</p></div><p className="metric-value">{value}</p></div>;
}

function MeetingSection({ title, description, meetings, empty }: { title: string; description: string; meetings: Awaited<ReturnType<typeof getMeetings>>; empty: string }) {
  return <section className="surface-flat mt-4 overflow-hidden"><header className="border-b border-line px-5 py-4"><h2 className="section-title">{title}</h2><p className="section-description">{description}</p></header><div>{meetings.map((meeting) => <Link key={meeting.id} href={`/admin/meetings/${meeting.id}`} className="group grid gap-3 border-b border-line p-4 last:border-b-0 hover:bg-[#f8faf9] sm:grid-cols-[minmax(0,1fr)_minmax(180px,.6fr)_auto] sm:items-center sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{meeting.title}</p><p className="mt-1 text-xs text-muted">{meeting.clientName} <span aria-hidden>•</span> {meeting.projectName}</p></div><div><p className="text-sm font-semibold">{formatDate(meeting.startAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: meeting.timezone })}</p><p className="mt-1 text-xs text-muted">{meeting.timezone}</p></div><ArrowRight className="hidden text-muted transition-transform group-hover:translate-x-0.5 sm:block" size={16} aria-hidden /></Link>)}{!meetings.length && <p className="p-6 text-sm text-muted">{empty}</p>}</div></section>;
}
