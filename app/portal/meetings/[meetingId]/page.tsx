import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowSquareOut, CalendarBlank, Clock, User } from '@phosphor-icons/react/dist/ssr';
import { CancelMeetingButton } from '@/components/meetings/cancel-meeting-button';
import { requireRole } from '@/lib/auth';
import { currentTimestamp } from '@/lib/clock';
import { formatDate } from '@/lib/format';
import { getMeeting } from '@/lib/meetings';
import { getAuthorizedClientMeeting } from '@/lib/client-access';

export default async function PortalMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const viewer = await requireRole('client');
  const { meetingId } = await params;
  const [meeting, access] = await Promise.all([getMeeting(meetingId), getAuthorizedClientMeeting(viewer.id, meetingId)]);
  if (!meeting || !access) notFound();
  return <div>
    <Link prefetch={false} href="/portal/meetings" className="button-ghost mb-4 w-fit"><ArrowLeft size={15} aria-hidden />Meetings</Link>
    <section className="surface-flat overflow-hidden"><div className="border-b border-line p-5 sm:p-6"><span className={`status-badge ${meeting.status === 'scheduled' ? 'status-active' : 'status-archived'}`}>{meeting.status}</span><h1 className="mt-4 text-2xl font-bold tracking-[-0.025em]">{meeting.title}</h1><p className="mt-2 text-sm text-muted">{meeting.projectName}</p></div>
      <dl className="grid sm:grid-cols-3"><Detail icon={<CalendarBlank size={17} aria-hidden />} label="Date" value={formatDate(meeting.startAt, { dateStyle: 'full', timeZone: meeting.timezone })} /><Detail icon={<Clock size={17} aria-hidden />} label="Time" value={formatDate(meeting.startAt, { hour: 'numeric', minute: '2-digit', timeZone: meeting.timezone })} /><Detail icon={<User size={17} aria-hidden />} label="With" value={meeting.ownerName} /></dl>
      <div className="space-y-4 border-t border-line p-5 sm:p-6"><p className="text-xs text-muted">Timezone: {meeting.timezone}</p>{meeting.description && <p className="max-w-2xl text-sm leading-6 text-muted">{meeting.description}</p>}<div className="flex flex-wrap gap-2">{meeting.googleEventHtmlLink && <a className="button-secondary" href={meeting.googleEventHtmlLink} target="_blank" rel="noreferrer">Open calendar<ArrowSquareOut size={15} aria-hidden /></a>}{meeting.status === 'scheduled' && Date.parse(meeting.startAt) > currentTimestamp() && <CancelMeetingButton meetingId={meeting.id} />}</div></div>
    </section>
  </div>;
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="border-b border-line p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><dt className="flex items-center gap-2 text-xs font-semibold text-muted">{icon}{label}</dt><dd className="mt-2 text-sm font-semibold">{value}</dd></div>;
}
