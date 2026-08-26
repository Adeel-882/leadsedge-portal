import { notFound } from 'next/navigation';
import { ProjectTabs } from '@/components/admin/project-tabs';
import { getProject } from '@/lib/queries';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  return <><ProjectTabs projectId={project.id} projectName={project.projectName} clientName={project.clientName} />{children}</>;
}
