import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle, ChatCircleDots, ClipboardText, Clock, Sparkle } from '@phosphor-icons/react/dist/ssr';
import { Conversation } from '@/components/conversation';
import { StatusBadge } from '@/components/status-badge';
import { CompleteTaskButton } from '@/components/portal/complete-task-button';
import { FormTask } from '@/components/portal/form-task';
import { requireRole } from '@/lib/auth';
import { canClientAccessTask, canClientCompleteTask } from '@/lib/authorization';
import { formatDate } from '@/lib/format';
import { getClientProjects, getTask, getTaskMessages } from '@/lib/queries';
import { getAuthorizedClientTask } from '@/lib/client-access';

export default async function ClientTaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const viewer = await requireRole('client');
  const [projects, task, messages, access] = await Promise.all([getClientProjects(), getTask(taskId), getTaskMessages(taskId), getAuthorizedClientTask(viewer.id, taskId)]);
  if (!task || !access) notFound();
  const project = projects.find((item) => item.id === task.projectId);
  if (!project || !canClientAccessTask(task, project.clientId)) notFound();

  return <div>
    <Link href="/portal/tasks" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal"><ArrowLeft size={15} aria-hidden />All leads</Link>
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
      <main className="space-y-4">
        <section className="surface-flat overflow-hidden">
          <header className="border-b border-line p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={task.status} /><span className="status-badge bg-[#edf0ef] text-muted"><ClipboardText size={12} aria-hidden />Lead assignment</span>{task.feedbackState === 'requested' && <span className="status-badge bg-[#faf3e3] text-[#875f1b]"><Sparkle size={12} weight="fill" aria-hidden />Feedback requested</span>}{task.feedbackState === 'submitted' && <span className="status-badge status-active"><CheckCircle size={12} weight="fill" aria-hidden />Feedback submitted</span>}</div>
            <h1 className="mt-4 text-2xl font-bold tracking-[-.03em] sm:text-3xl">{task.title}</h1>
            <p className="mt-2 text-sm text-muted">{project.projectName}{task.activatedAt ? ` • Activated ${formatDate(task.activatedAt)}` : ''}</p>
          </header>
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-muted"><ClipboardText size={17} aria-hidden /><h2 className="section-title">Lead information</h2></div>
            <div className="task-rich-text mt-3" dangerouslySetInnerHTML={{ __html: task.description }} />
          </div>
        </section>

        {canClientCompleteTask(task, project.clientId) && <section className="surface-flat border-[#bdd4ce] bg-[#f5faf8] p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-white text-teal"><CheckCircle size={20} aria-hidden /></span><div><h2 className="section-title">Ready to complete this lead?</h2><p className="section-description max-w-xl">Confirm only when the assignment is finished. Your administrator will be notified, and any configured feedback delay will begin.</p></div></div><div className="mt-5"><CompleteTaskButton taskId={task.id} /></div></section>}

        {task.status === 'completed' && task.feedbackState === 'waiting' && <section className="surface-flat flex gap-3 bg-[#f6f8f8] p-5"><Clock className="mt-0.5 flex-none text-[#586761]" size={19} aria-hidden /><div><h2 className="text-sm font-bold">Lead marked completed</h2><p className="mt-1 text-sm leading-6 text-muted">Feedback will be requested after the configured delay. The form will appear on this page.</p></div></section>}

        {task.feedbackState === 'requested' && task.formSchema && <section className="surface-flat border-[#d9c18c] overflow-hidden"><header className="bg-[#fcf8ee] px-5 py-5 sm:px-6"><div className="flex items-center gap-2 text-[#875f1b]"><Sparkle size={18} weight="fill" aria-hidden /><h2 className="text-lg font-bold">Feedback requested</h2></div><p className="mt-2 text-sm leading-6 text-muted">Share your experience with this lead. Your answers are saved once with the assignment.</p></header><div className="p-5 sm:p-6"><FormTask taskId={task.id} fields={task.formSchema} /></div></section>}

        {task.feedbackState === 'submitted' && <section className="surface-flat flex gap-3 border-[#bdd4ce] bg-[#f2f8f6] p-5"><CheckCircle className="mt-0.5 flex-none text-teal" size={20} weight="fill" aria-hidden /><div><h2 className="text-sm font-bold">Feedback submitted successfully.</h2><p className="mt-1 text-sm text-muted">Received {formatDate(task.feedbackSubmittedAt)}. No further action is needed.</p></div></section>}
      </main>

      <aside id="conversation" className="scroll-mt-6"><div className="mb-3 flex items-start gap-2"><ChatCircleDots className="mt-0.5 text-muted" size={18} aria-hidden /><div><h2 className="section-title">Lead conversation</h2><p className="section-description">Messages and activity stay with this lead.</p></div></div><Conversation kind="task" resourceId={task.id} viewerId={viewer.id} initialMessages={messages} compact /></aside>
    </div>
  </div>;
}
