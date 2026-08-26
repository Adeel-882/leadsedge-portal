import { DashboardClient } from '@/components/admin/dashboard-client';
import { requireRole } from '@/lib/auth';
import { getAdminProjects, getProjectClients } from '@/lib/queries';

export default async function AdminDashboardPage() {
  const [viewer, projects] = await Promise.all([requireRole('admin'), getAdminProjects()]);
  const clientGroups = await Promise.all(projects.map((project) => getProjectClients(project.id)));
  const clients = Array.from(new Map(clientGroups.flat().map((client) => [client.id, client])).values());
  return <DashboardClient projects={projects} clients={clients} ownerName={viewer.fullName} />;
}
