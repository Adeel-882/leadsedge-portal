import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowSquareOut, CalendarBlank, Clock, User } from '@phosphor-icons/react/dist/ssr';
import { CancelMeetingButton } from '@/components/meetings/cancel-meeting-button';
import { requireRole } from '@/lib/auth';
import { currentTimestamp } from '@/lib/clock';
import { formatDate } from '@/lib/format';
import { getMeeting } from '@/lib/meetings';

export default async function AdminMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  await requireRole('admin');
  const { meetingId } = await params;
  const meeting = await getMeeting(meetingId);
  if (!meeting) notFound();
  return <div className="page-wrap">
    <Link prefetch={false} href="/admin/meetings" className="button-ghost mb-4 w-fit"><ArrowLeft size={15} aria-hidden />All meetings</Link>
    <section className="surface-flat overflow-hidden"><div className="flex flex-col justify-between gap-5 border-b border-line p-5 sm:flex-row sm:items-start md:p-6"><div><span className={`status-badge ${meeting.status === 'scheduled' ? 'status-active' : meeting.status === 'cancelled' ? 'status-archived' : 'status-completed'}`}>{meeting.status}</span><h1 className="mt-4 text-2xl font-bold tracking-[-0.025em]">{meeting.title}</h1><p className="mt-2 text-sm text-muted">{meeting.clientName} <span aria-hidden>•</span> {meeting.projectName}</p></div>{meeting.status === 'scheduled' && Date.parse(meeting.startAt) > currentTimestamp() && <CancelMeetingButton meetingId={meeting.id} />}</div>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-4"><Detail icon={<CalendarBlank size={17} aria-hidden />} label="Date" value={formatDate(meeting.startAt, { dateStyle: 'medium', timeZone: meeting.timezone })} /><Detail icon={<Clock size={17} aria-hidden />} label="Time" value={formatDate(meeting.startAt, { hour: 'numeric', minute: '2-digit', timeZone: meeting.timezone })} /><Detail icon={<User size={17} aria-hidden />} label="Project owner" value={meeting.ownerName} /><Detail icon={<User size={17} aria-hidden />} label="Client" value={meeting.clientName} /></dl>
      <div className="space-y-4 border-t border-line p-5 md:p-6"><p className="text-xs text-muted">Timezone: {meeting.timezone}</p>{meeting.description && <p className="max-w-3xl text-sm leading-6">{meeting.description}</p>}{meeting.googleEventHtmlLink && <a className="button-secondary w-fit" href={meeting.googleEventHtmlLink} target="_blank" rel="noreferrer">Open Google Calendar<ArrowSquareOut size={15} aria-hidden /></a>}{meeting.cancellationReason && <p className="rounded-lg bg-[#fff1f1] p-4 text-sm text-[#8b3636]">Cancellation reason: {meeting.cancellationReason}</p>}</div>
    </section>
  </div>;
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="border-b border-line p-5 last:border-b-0 sm:border-r sm:[&:nth-child(even)]:border-r-0 lg:border-b-0 lg:[&:nth-child(even)]:border-r lg:last:border-r-0"><dt className="flex items-center gap-2 text-xs font-semibold text-muted">{icon}{label}</dt><dd className="mt-2 text-sm font-semibold">{value}</dd></div>;
}
