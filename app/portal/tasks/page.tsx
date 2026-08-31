import Link from 'next/link';
import { ArrowRight, ChatCircleDots, ClipboardText, Sparkle } from '@phosphor-icons/react/dist/ssr';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { getClientTaskList } from '@/lib/queries';

export default async function ClientTasksPage() {
  const tasks = await getClientTaskList();

  return <div>
    <div className="page-header"><p className="page-eyebrow">Lead assignments</p><h1 className="page-title">Your leads</h1><p className="page-subtitle">Open a lead to review its details, continue the conversation, complete the assignment, or submit requested feedback.</p></div>
    {tasks.length ? <div className="space-y-3">{tasks.map((task) => <Link key={task.id} href={`/portal/tasks/${task.id}`} className="surface-flat group flex flex-col gap-4 p-5 transition hover:border-[#b8c8c3] hover:bg-[#f9fbfa] sm:flex-row sm:items-center"><span className="grid h-11 w-11 flex-none place-items-center rounded-lg bg-[#e6f1ef] text-teal"><ClipboardText size={21} weight="fill" aria-hidden /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-bold">{task.title}</p>{task.feedbackState === 'requested' && <span className="status-badge bg-[#faf3e3] text-[#875f1b]"><Sparkle size={12} weight="fill" aria-hidden />Feedback requested</span>}</div><p className="mt-1 text-xs text-muted">{task.projectName}{task.feedbackState === 'submitted' ? ` • Feedback submitted ${formatDate(task.feedbackSubmittedAt)}` : ''}</p><p className="mt-2 flex items-center gap-1 text-[11px] text-muted"><ChatCircleDots size={13} aria-hidden />Conversation stays with this lead</p></div><StatusBadge status={task.status} /><ArrowRight className="hidden text-muted transition-transform group-hover:translate-x-0.5 sm:block" size={17} aria-hidden /></Link>)}</div> : <EmptyState title="No active leads" body="Your next lead assignment will appear here when your administrator activates it." />}
  </div>;
}
