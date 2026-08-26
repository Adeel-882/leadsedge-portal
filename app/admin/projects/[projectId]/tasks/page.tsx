import { notFound } from 'next/navigation';
import { TasksClient } from '@/components/admin/tasks-client';
import { getProject, getProjectClients, getProjectTasks, getTemplates, getTemplateTasks } from '@/lib/queries';

export default async function ProjectTasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, tasks, clients, templates] = await Promise.all([getProject(projectId), getProjectTasks(projectId), getProjectClients(projectId), getTemplates()]);
  if (!project) notFound();
  const templateTaskEntries = await Promise.all(templates.map(async (template) => [template.id, await getTemplateTasks(template.id)] as const));
  return <TasksClient projectId={project.id} tasks={tasks} clients={clients} templates={templates} templateTasks={Object.fromEntries(templateTaskEntries)} />;
}
