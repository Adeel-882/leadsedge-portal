'use client';
import { CachedScreen } from '../cached-screen';
import type { ScreenData } from '@/lib/screen-data';
import Link from 'next/link';
import { ArrowRight, CalendarBlank } from '@phosphor-icons/react';
import { EmptyState } from '@/components/empty-state';
import { MeetingScheduler } from '@/components/meetings/meeting-scheduler';
import { currentTimestamp } from '@/lib/clock';
import { formatDate } from '@/lib/format';

function MeetingsView({data}: {data:ScreenData<'meetings'>}) {
  const { meetings, projects } = data;
  const upcoming = meetings.filter((item) => item.status === 'scheduled' && Date.parse(item.startAt) >= currentTimestamp());
  return <div>
    <div className="page-header"><p className="page-eyebrow">Scheduling</p><h1 className="page-title">Meetings</h1><p className="page-subtitle">Choose a genuine open time with your project owner.</p></div>
    <div className="space-y-5"><MeetingScheduler projects={projects} /><section className="surface-flat overflow-hidden"><div className="flex items-center gap-3 border-b border-line p-5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand-text"><CalendarBlank size={18} weight="fill" aria-hidden /></span><div><h2 className="section-title">Your upcoming meetings</h2><p className="mt-0.5 text-xs text-muted">Confirmed times in your scheduling timezone</p></div></div>{upcoming.length ? <div>{upcoming.map((meeting) => <Link prefetch={false} key={meeting.id} href={`/portal/meetings/${meeting.id}`} className="group grid gap-3 border-b border-line p-4 last:border-b-0 hover:bg-brand-soft sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div><p className="text-sm font-semibold">{meeting.title}</p><p className="mt-1 text-xs text-muted">{formatDate(meeting.startAt, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: meeting.timezone })} <span aria-hidden>•</span> {meeting.timezone}</p></div><ArrowRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5" aria-hidden /></Link>)}</div> : <div className="p-5"><EmptyState title="No upcoming meetings" body="Choose a project above when you are ready to schedule time." /></div>}</section></div>
  </div>;
}

export function CachedMeetings({initial}: {initial?:{data:ScreenData<'meetings'>;updatedAt:number}}) {return <CachedScreen screen="meetings" initial={initial}>{data=><MeetingsView data={data}/>}</CachedScreen>;}