import { DashboardClient } from '@/components/admin/dashboard-client';
import { requireRole } from '@/lib/auth';
import { getAdminClients, getAdminProjects } from '@/lib/queries';
import { getNextMeeting } from '@/lib/meetings';

export default async function AdminDashboardPage() {
  const [viewer, projects, clients, upcomingMeeting] = await Promise.all([requireRole('admin'), getAdminProjects(), getAdminClients(), getNextMeeting()]);
  return <DashboardClient projects={projects} clients={clients} ownerName={viewer.fullName} upcomingMeeting={upcomingMeeting} />;
}
