import { Conversation } from '@/components/conversation';
import { EmptyState } from '@/components/empty-state';
import { requireRole } from '@/lib/auth';
import { getClientProjects, getProjectMessages } from '@/lib/queries';

export default async function ClientMessagesPage() {
  const [viewer, projects] = await Promise.all([requireRole('client'), getClientProjects()]);
  const project = projects[0];
  if (!project) return <div><div className="mb-7"><p className="page-eyebrow">Project updates</p><h1 className="page-title">Messages</h1></div><EmptyState title="No project chat yet" body="A general conversation will appear after you are added to a project." /></div>;
  const messages = await getProjectMessages(project.id);
  return <div><div className="mb-7"><p className="page-eyebrow">Project updates</p><h1 className="page-title">Messages</h1><p className="page-subtitle">General chat for {project.projectName}. Individual task comments stay on their task.</p></div><Conversation kind="project" resourceId={project.id} viewerId={viewer.id} initialMessages={messages} /></div>;
}
