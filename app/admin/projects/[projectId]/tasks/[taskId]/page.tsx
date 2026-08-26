import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Conversation } from '@/components/conversation';
import { StatusBadge } from '@/components/status-badge';
import { TaskEditor } from '@/components/admin/task-editor';
import { requireRole } from '@/lib/auth';
import { formatDate, formatTime } from '@/lib/format';
import { getProject, getProjectClients, getTask, getTaskActivity, getTaskMessages } from '@/lib/queries';

export default async function AdminTaskDetailPage({ params }: { params: Promise<{ projectId: string; taskId: string }> }) {
  const { projectId, taskId } = await params;
  const [viewer, project, task, clients, messages, activity] = await Promise.all([requireRole('admin'), getProject(projectId), getTask(taskId), getProjectClients(projectId), getTaskMessages(taskId), getTaskActivity(taskId)]);
  if (!project || !task || task.projectId !== projectId) notFound();
  return <div className="page-wrap"><Link href={`/admin/projects/${projectId}/tasks`} className="text-sm font-semibold text-teal">← Back to tasks</Link><div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]"><div className="space-y-5"><section className="card p-5 md:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="mb-3 flex items-center gap-2"><StatusBadge status={task.status} /><span className="rounded-full bg-[#f0f3f6] px-3 py-1 text-xs text-muted">{task.taskType === 'form' ? 'Form task' : 'Standard task'}</span></div><h1 className="text-2xl font-bold md:text-3xl">{task.title}</h1><p className="mt-2 text-sm text-muted">Assigned to {task.assigneeName || 'nobody'} · Due {formatDate(task.dueAt)}</p></div><TaskEditor task={task} clients={clients} /></div><div className="task-rich-text mt-7 border-t border-line pt-5" dangerouslySetInnerHTML={{ __html: task.description }} /></section><section className="card p-5"><h2 className="font-bold">Activity</h2><div className="mt-4 space-y-4">{activity.map((event) => <div key={event.id} className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-teal" /><div><p className="text-sm"><b>{event.actorName}</b> {event.body}</p><p className="mt-1 text-xs text-muted">{formatTime(event.createdAt)}</p></div></div>)}</div></section></div><div><div className="mb-3"><h2 className="text-lg font-bold">Task conversation</h2><p className="text-sm text-muted">Messages here stay with this task only.</p></div><Conversation kind="task" resourceId={task.id} viewerId={viewer.id} initialMessages={messages} compact /></div></div></div>;
}
