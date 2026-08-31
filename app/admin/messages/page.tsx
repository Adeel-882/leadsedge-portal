import { AdminMessagesClient } from '@/components/admin/messages-client';
import { requireRole } from '@/lib/auth';
import { getAdminMessageInbox, getAdminProjects } from '@/lib/queries';

export default async function AdminMessagesPage() {
  const [viewer, projects, conversations] = await Promise.all([requireRole('admin'), getAdminProjects(), getAdminMessageInbox()]);
  return <AdminMessagesClient viewerId={viewer.id} projects={projects.filter((project) => project.status === 'active')} conversations={conversations} />;
}
