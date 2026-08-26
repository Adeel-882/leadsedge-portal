import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Conversation } from '@/components/conversation';
import { StatusBadge } from '@/components/status-badge';
import { CompleteTaskButton } from '@/components/portal/complete-task-button';
import { FormTask } from '@/components/portal/form-task';
import { requireRole } from '@/lib/auth';
import { canClientAccessTask, canClientCompleteTask } from '@/lib/authorization';
import { formatDate } from '@/lib/format';
import { getClientProjects, getTask, getTaskMessages } from '@/lib/queries';

export default async function ClientTaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const [viewer, projects, task, messages] = await Promise.all([requireRole('client'), getClientProjects(), getTask(taskId), getTaskMessages(taskId)]);
  if (!task) notFound();
  const project = projects.find((item) => item.id === task.projectId);
  if (!project || !canClientAccessTask(task, project.clientId)) notFound();
  return <div><Link href="/portal/tasks" className="text-sm font-semibold text-teal">← All tasks</Link><div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,.8fr)]"><section className="card p-5 sm:p-7"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={task.status} /><span className="rounded-full bg-[#f0f3f6] px-3 py-1 text-xs text-muted">{task.taskType === 'form' ? 'Feedback form' : 'Lead assignment'}</span></div><h1 className="mt-4 text-2xl font-bold tracking-[-.025em] sm:text-3xl">{task.title}</h1><p className="mt-2 text-sm text-muted">Activated {formatDate(task.activatedAt)}{task.dueAt ? ` · Due ${formatDate(task.dueAt)}` : ''}</p><div className="task-rich-text mt-7 border-t border-line pt-5" dangerouslySetInnerHTML={{ __html: task.description }} />{task.taskType === 'form' && task.status === 'active' && task.formSchema && <FormTask taskId={task.id} fields={task.formSchema} />}{task.taskType !== 'form' && canClientCompleteTask(task, project.clientId) && <div className="mt-8 border-t border-line pt-5"><h2 className="mb-2 font-bold">Finished with this lead?</h2><p className="mb-4 text-sm text-muted">Marking this complete updates the project and notifies your administrator.</p><CompleteTaskButton taskId={task.id} /></div>}{task.status === 'completed' && <div className="mt-8 rounded-xl bg-[#e8f5f2] p-4 text-sm font-semibold text-teal">✓ Completed {formatDate(task.completedAt)}</div>}</section><aside><div className="mb-3"><h2 className="text-lg font-bold">Activity & conversation</h2><p className="text-sm text-muted">This thread belongs only to this task.</p></div><Conversation kind="task" resourceId={task.id} viewerId={viewer.id} initialMessages={messages} compact /></aside></div></div>;
}
