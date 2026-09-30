'use client';
import { CachedScreen } from '../cached-screen';
import type { ScreenData } from '@/lib/screen-data';
import type { Viewer } from '@/lib/types';
import Link from 'next/link';
import { ArrowRight, CalendarBlank, ChatCircleDots, CheckCircle, ClipboardText, Sparkle } from '@phosphor-icons/react';
import { formatDate, formatTime } from '@/lib/format';

function HomeView({ data, viewer, unread }: { data: ScreenData<'home'>; viewer: Viewer; unread: {messages:number;notifications:number} }) {
  const { projects, notifications, nextMeeting, allTasks } = data;
  const primary = projects[0];
  const tasks = primary ? allTasks.filter((task) => task.projectId === primary.id) : [];
  const active = tasks.filter((task) => task.status === 'active');
  const feedbackTask = tasks.find((task) => task.feedbackState === 'requested');

  return <div>
    <header className="page-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="page-eyebrow">Welcome back, {viewer.fullName}</p><h1 className="page-title">Here is what needs your attention</h1><p className="page-subtitle">Your leads, feedback, messages, and meetings for {primary?.projectName || 'your workspace'}.</p></div>
      {primary && <Link prefetch={false} href="/portal/tasks" className="button-primary">Open tasks<ArrowRight size={15} aria-hidden /></Link>}
    </header>

    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)]" aria-label="Priority actions">
      <div className="surface-flat p-5 sm:p-6">
        <div className="flex items-center gap-2 text-teal"><ClipboardText size={18} weight="fill" aria-hidden /><p className="text-xs font-semibold">Active lead</p></div>
        {active[0] ? <><h2 className="mt-3 text-xl font-bold tracking-[-.025em]">{active[0].title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted">Review the lead details, continue the conversation, or mark the assignment complete when the work is finished.</p><Link prefetch={false} href={`/portal/tasks/${active[0].id}`} className="button-secondary mt-5">View lead<ArrowRight size={14} aria-hidden /></Link></> : <><h2 className="mt-3 text-lg font-bold">No active lead right now</h2><p className="mt-2 text-sm text-muted">Your next assignment will appear here when it is ready.</p></>}
      </div>

      <div className={`surface-flat p-5 ${feedbackTask ? 'border-[#d9c18c] bg-[#fcf8ee]' : ''}`}>
        <div className="flex items-center gap-2 text-muted"><Sparkle size={18} aria-hidden /><p className="text-xs font-semibold">Feedback</p></div>
        {feedbackTask ? <><h2 className="mt-3 text-lg font-bold">Feedback requested</h2><p className="mt-2 text-sm leading-6 text-muted">Your feedback form is ready inside {feedbackTask.title}.</p><Link prefetch={false} href={`/portal/tasks/${feedbackTask.id}`} className="button-primary mt-5">Give feedback</Link></> : <><CheckCircle className="mt-4 text-teal" size={24} weight="fill" aria-hidden /><h2 className="mt-2 text-base font-bold">Nothing pending</h2><p className="mt-1 text-sm text-muted">No feedback is due.</p></>}
      </div>
    </section>

    <section className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Messages and meetings">
      <Link prefetch={false} href="/portal/messages" className="surface-flat flex items-center gap-4 p-5 transition hover:border-[#b7c8c3] hover:bg-[#f9fbfa]"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#e6f1ef] text-teal"><ChatCircleDots size={20} weight="fill" aria-hidden /></span><div><p className="text-sm font-bold">Messages</p><p className="mt-1 text-xs text-muted">{unread.messages ? `${unread.messages} unread ${unread.messages === 1 ? 'message' : 'messages'}` : 'No unread messages'}</p></div><ArrowRight className="ml-auto text-muted" size={16} aria-hidden /></Link>
      <Link prefetch={false} href={nextMeeting ? `/portal/meetings/${nextMeeting.id}` : '/portal/meetings'} className="surface-flat flex items-center gap-4 p-5 transition hover:border-[#b7c8c3] hover:bg-[#f9fbfa]"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#eaf0f4] text-[#3c5f77]"><CalendarBlank size={20} weight="fill" aria-hidden /></span><div><p className="text-sm font-bold">{nextMeeting ? 'Upcoming meeting' : 'Schedule a meeting'}</p><p className="mt-1 text-xs text-muted">{nextMeeting ? formatDate(nextMeeting.startAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: nextMeeting.timezone }) : 'Choose an available time with your project owner'}</p></div><ArrowRight className="ml-auto text-muted" size={16} aria-hidden /></Link>
    </section>

    <section className="surface-flat mt-4 overflow-hidden">
      <div className="border-b border-line px-5 py-4"><h2 className="section-title">Recent activity</h2><p className="section-description">The latest updates from your workspace.</p></div>
      {notifications.length ? <div>{notifications.map((item) => <Link prefetch={false} href={item.targetUrl.startsWith('/') && !item.targetUrl.startsWith('//') ? item.targetUrl : '/portal'} key={item.id} className="flex gap-3 border-b border-line px-5 py-4 last:border-b-0 hover:bg-[#f8faf9]"><span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${item.readAt ? 'bg-[#cbd4d1]' : 'bg-teal'}`} aria-hidden /><div className="min-w-0"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-sm leading-5 text-muted">{item.body}</p><p className="mt-1.5 text-[11px] text-muted">{formatTime(item.createdAt)}</p></div></Link>)}</div> : <p className="px-5 py-7 text-sm text-muted">No recent activity yet.</p>}
    </section>
  </div>;
}

export function CachedHome({ initial, viewer, unread }: { initial?: {data: ScreenData<'home'>;updatedAt:number};viewer:Viewer;unread:{messages:number;notifications:number} }) { return <CachedScreen screen="home" initial={initial}>{data=><HomeView data={data} viewer={viewer} unread={unread}/>}</CachedScreen>; }
