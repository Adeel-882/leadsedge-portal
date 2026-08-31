import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ChatCircleDots, CheckCircle, Clock, Lightning, User } from '@phosphor-icons/react/dist/ssr';
import { Conversation } from '@/components/conversation';
import { StatusBadge } from '@/components/status-badge';
import { TaskEditor } from '@/components/admin/task-editor';
import { requireRole } from '@/lib/auth';
import { allowMinuteFeedbackDelays } from '@/lib/env';
import { formatDate, formatTime } from '@/lib/format';
import { getProject, getProjectClients, getTask, getTaskActivity, getTaskMessages, getTaskSubmission } from '@/lib/queries';

export default async function AdminTaskDetailPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  const [viewer, project, task, clientsResult, messagesResult, activityResult, submissionResult] = await Promise.all([
    requireRole('admin'),
    getProject(projectId),
    getTask(taskId),
    getProjectClients(projectId).then((value) => ({ value })).catch(() => ({ value: [] })),
    getTaskMessages(taskId).then((value) => ({ value })).catch(() => ({ value: [] })),
    getTaskActivity(taskId).then((value) => ({ value })).catch(() => ({ value: [] })),
    getTaskSubmission(taskId).then((value) => ({ value })).catch(() => ({ value: null })),
  ]);
  if (!project || !task || task.projectId !== projectId) notFound();
  const clients = clientsResult.value;
  const messages = messagesResult.value;
  const activity = activityResult.value;
  const submission = submissionResult.value;

  return <div className="page-wrap">
    <Link href={`/admin/projects/${projectId}/tasks`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal"><ArrowLeft size={15} aria-hidden />Back to tasks</Link>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
      <main className="space-y-4">
        <section className="surface-flat overflow-hidden">
          <header className="border-b border-line p-5 md:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="min-w-0"><div className="mb-3 flex flex-wrap items-center gap-2"><StatusBadge status={task.status} /><span className="status-badge bg-[#edf0ef] text-muted">Lead assignment</span><span className="status-badge bg-[#e6f1ef] text-teal">Feedback: {task.feedbackState.replace('_', ' ')}</span></div><h1 className="text-2xl font-bold tracking-[-.03em] md:text-3xl">{task.title}</h1><p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"><span className="inline-flex items-center gap-1"><User size={14} aria-hidden />{task.assigneeName || 'Unassigned'}</span>{task.feedbackScheduledFor && <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden />Feedback scheduled {formatDate(task.feedbackScheduledFor, { dateStyle: 'medium', timeStyle: 'short' })}</span>}</p></div><TaskEditor task={task} clients={clients} allowMinuteDelays={allowMinuteFeedbackDelays()} /></div>
          </header>
          <div className="p-5 md:p-6"><h2 className="section-title">Lead information</h2><div className="task-rich-text mt-3" dangerouslySetInnerHTML={{ __html: task.description }} /></div>
        </section>

        {task.feedbackEnabled && <section className="surface-flat overflow-hidden">
          <header className="flex items-center gap-2 border-b border-line px-5 py-4"><Lightning size={18} className="text-teal" weight="fill" aria-hidden /><div><h2 className="section-title">Feedback automation</h2><p className="section-description">A simple post-completion workflow for this lead.</p></div></header>
          <div className="grid gap-2 p-5 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
            <AutomationStep label="When" title="Lead completed" detail="Client confirms the assignment" />
            <ArrowRight className="hidden self-center text-[#9ba8a3] md:block" size={18} aria-hidden />
            <AutomationStep label="Wait" title={`${task.feedbackDelayValue} ${task.feedbackDelayUnit}`} detail="Uses the configured delay" />
            <ArrowRight className="hidden self-center text-[#9ba8a3] md:block" size={18} aria-hidden />
            <AutomationStep label="Then" title="Request feedback" detail="Email, notification, and form" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line bg-[#f8faf9] px-5 py-3 text-xs text-muted"><span>State: <b className="text-ink">{task.feedbackState.replace('_', ' ')}</b></span>{task.feedbackRequestedAt && <span>Requested {formatTime(task.feedbackRequestedAt)}</span>}{task.feedbackSubmittedAt && <span>Submitted {formatTime(task.feedbackSubmittedAt)}</span>}</div>
        </section>}

        {submission && <section className="surface-flat overflow-hidden"><header className="border-b border-line px-5 py-4"><div className="flex items-center gap-2"><CheckCircle size={18} className="text-teal" weight="fill" aria-hidden /><h2 className="section-title">Submitted feedback</h2></div><p className="section-description">Submitted by {submission.submittedByName} <span aria-hidden>•</span> {formatTime(submission.submittedAt)}</p></header><dl className="grid sm:grid-cols-2">{task.formSchema?.map((field) => <div key={field.id} className="border-b border-line p-4 last:border-b-0 sm:border-r sm:[&:nth-child(even)]:border-r-0"><dt className="text-xs font-semibold text-muted">{field.label}</dt><dd className="mt-1.5 text-sm leading-6">{Array.isArray(submission.answers[field.id]) ? (submission.answers[field.id] as string[]).join(', ') : submission.answers[field.id] || 'Not provided'}</dd></div>)}</dl></section>}

        <section className="surface-flat p-5"><h2 className="section-title">Activity</h2><div className="mt-4 space-y-4">{activity.length ? activity.map((event) => <div key={event.id} className="border-l-2 border-[#cfe0dc] pl-3"><p className="text-sm"><b>{event.actorName}</b> {event.body}</p><p className="mt-1 text-xs text-muted">{formatTime(event.createdAt)}</p></div>) : <p className="text-sm text-muted">No activity recorded yet.</p>}</div></section>
      </main>

      <aside id="conversation" className="scroll-mt-6"><div className="mb-3 flex items-start gap-2"><ChatCircleDots className="mt-0.5 text-muted" size={18} aria-hidden /><div><h2 className="section-title">Task conversation</h2><p className="section-description">This thread follows the lead through completion and feedback.</p></div></div><Conversation kind="task" resourceId={task.id} viewerId={viewer.id} initialMessages={messages} compact /></aside>
    </div>
  </div>;
}

function AutomationStep({ label, title, detail }: { label: string; title: string; detail: string }) {
  return <div className="rounded-lg border border-line bg-[#f8faf9] p-4"><p className="text-[10px] font-bold text-teal">{label}</p><p className="mt-2 text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-muted">{detail}</p></div>;
}
