import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { getClientProjects, getProjectTasks } from '@/lib/queries';

export default async function ClientTasksPage() {
  const projects = await getClientProjects();
  const taskGroups = await Promise.all(projects.map(async (project) => ({ project, tasks: await getProjectTasks(project.id, true) })));
  const tasks = taskGroups.flatMap((group) => group.tasks.map((task) => ({ ...task, projectName: group.project.projectName })));
  return <div><div className="mb-7"><p className="page-eyebrow">Your work</p><h1 className="page-title">Tasks</h1><p className="page-subtitle">Only tasks assigned to you and ready for action appear here.</p></div>{tasks.length ? <div className="space-y-4">{tasks.map((task) => <Link key={task.id} href={`/portal/tasks/${task.id}`} className="card flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center"><span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-[#e8f5f2] font-bold text-teal">{task.taskType === 'form' ? '▤' : '✓'}</span><div className="min-w-0 flex-1"><p className="truncate font-bold">{task.title}</p><p className="mt-1 text-xs text-muted">{task.projectName} · {task.dueAt ? `Due ${formatDate(task.dueAt)}` : 'No due date'}</p></div><StatusBadge status={task.status} /><span className="hidden text-xl text-muted sm:block">›</span></Link>)}</div> : <EmptyState title="No active tasks" body="When your administrator activates a task, it will appear here." />}</div>;
}
