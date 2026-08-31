import { notFound } from 'next/navigation';
import { Conversation } from '@/components/conversation';
import { requireRole } from '@/lib/auth';
import { getProject, getProjectMessages } from '@/lib/queries';

export default async function ProjectChatPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // getProjectMessages only needs projectId, so it joins the same batch rather
  // than waiting a full round trip behind the project read. It stays RLS-scoped
  // to the caller, and a failure still degrades to an empty thread.
  const [viewer, project, messagesResult] = await Promise.all([
    requireRole('admin'),
    getProject(projectId),
    getProjectMessages(projectId).then((value) => ({ value })).catch(() => ({ value: [] })),
  ]);
  if (!project) notFound();
  const messages = messagesResult.value;
  return <div className="page-wrap"><div className="mb-6"><p className="page-eyebrow">General conversation</p><h2 className="page-title">Project chat</h2><p className="page-subtitle">Updates for the whole project. Task comments remain separate.</p></div><Conversation kind="project" resourceId={project.id} viewerId={viewer.id} initialMessages={messages} /></div>;
}
