import { notFound } from 'next/navigation';
import { TasksClient } from '@/components/admin/tasks-client';
import { getProject, getProjectClients, getProjectTasks, getTemplatesWithTasks } from '@/lib/queries';

export default async function ProjectTasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, tasksResult, clientsResult, templatesResult] = await Promise.all([
    getProject(projectId),
    getProjectTasks(projectId).then((value) => ({ value })).catch(() => ({ value: [] })),
    getProjectClients(projectId).then((value) => ({ value })).catch(() => ({ value: [] })),
    getTemplatesWithTasks().then((value) => ({ value })).catch(() => ({ value: { templates: [], templateTasks: {} } })),
  ]);
  if (!project) notFound();
  return <TasksClient projectId={project.id} tasks={tasksResult.value} clients={clientsResult.value} templates={templatesResult.value.templates} templateTasks={templatesResult.value.templateTasks} />;
}
