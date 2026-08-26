import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProgressBar } from '@/components/progress-bar';
import { StatusBadge } from '@/components/status-badge';
import { InviteButton } from '@/components/admin/invite-button';
import { formatDate } from '@/lib/format';
import { getProject, getProjectClients, getProjectTasks } from '@/lib/queries';

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, tasks, clients] = await Promise.all([getProject(projectId), getProjectTasks(projectId), getProjectClients(projectId)]);
  if (!project) notFound();
  return <div className="page-wrap"><div className="mb-7"><p className="page-eyebrow">Project overview</p><h2 className="page-title">A clear view of the work</h2><p className="page-subtitle">Status, progress, and the next task for {project.clientName}.</p></div><div className="grid gap-4 md:grid-cols-3"><div className="card p-5"><p className="text-xs font-semibold text-muted">Project status</p><div className="mt-4"><StatusBadge status={`${project.status}-project`} /></div><p className="mt-5 text-xs text-muted">Created {formatDate(project.createdAt)}</p></div><div className="card p-5"><p className="text-xs font-semibold text-muted">Task progress</p><div className="mt-5"><ProgressBar completed={project.completedTasks} total={project.totalTasks} /></div></div><div className="card p-5"><p className="text-xs font-semibold text-muted">Primary client</p><p className="mt-3 text-lg font-bold">{clients[0]?.fullName || project.clientName}</p><p className="mt-1 text-sm text-muted">{clients[0]?.email}</p>{clients[0]?.status === 'invited' && <InviteButton projectId={project.id} />}</div></div><div className="card mt-5 p-5"><div className="flex items-center justify-between"><div><h3 className="font-bold">Next tasks</h3><p className="mt-1 text-sm text-muted">Keep this project moving forward.</p></div><Link href={`/admin/projects/${project.id}/tasks`} className="button-secondary">View all tasks</Link></div><div className="mt-5 divide-y divide-line">{tasks.slice(0, 3).map((task) => <Link className="flex items-center justify-between gap-4 py-4" key={task.id} href={`/admin/projects/${project.id}/tasks/${task.id}`}><div><p className="font-semibold">{task.title}</p><p className="mt-1 text-xs text-muted">{task.assigneeName || 'Unassigned'}</p></div><StatusBadge status={task.status} /></Link>)}</div></div></div>;
}
