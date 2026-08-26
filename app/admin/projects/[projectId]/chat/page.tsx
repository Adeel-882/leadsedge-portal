import { notFound } from 'next/navigation';
import { Conversation } from '@/components/conversation';
import { requireRole } from '@/lib/auth';
import { getProject, getProjectMessages } from '@/lib/queries';

export default async function ProjectChatPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [viewer, project, messages] = await Promise.all([requireRole('admin'), getProject(projectId), getProjectMessages(projectId)]);
  if (!project) notFound();
  return <div className="page-wrap"><div className="mb-6"><p className="page-eyebrow">General conversation</p><h2 className="page-title">Project chat</h2><p className="page-subtitle">Updates for the whole project. Task comments remain separate.</p></div><Conversation kind="project" resourceId={project.id} viewerId={viewer.id} initialMessages={messages} /></div>;
}
