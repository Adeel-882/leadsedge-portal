import { AdminShell } from '@/components/admin/admin-shell';
import { DemoBanner } from '@/components/demo-banner';
import { requireRole } from '@/lib/auth';
import { getNotifications } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [viewer, notifications] = await Promise.all([requireRole('admin'), getNotifications()]);
  return <AdminShell displayName={viewer.fullName} unreadCount={notifications.filter((item) => !item.readAt).length}><DemoBanner />{children}</AdminShell>;
}
