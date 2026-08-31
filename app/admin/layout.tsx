import { AdminShell } from '@/components/admin/admin-shell';
import { DemoBanner, EmailConfigurationBanner } from '@/components/demo-banner';
import { requireRole } from '@/lib/auth';
import { getUnreadCounts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [viewer, unread] = await Promise.all([requireRole('admin'), getUnreadCounts()]);
  return <AdminShell displayName={viewer.fullName} viewerId={viewer.id} messageUnreadCount={unread.messages} notificationUnreadCount={unread.notifications}><DemoBanner /><EmailConfigurationBanner />{children}</AdminShell>;
}
