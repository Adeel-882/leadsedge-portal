import { DemoBanner } from '@/components/demo-banner';
import { PortalShell } from '@/components/portal/portal-shell';
import { requireRole } from '@/lib/auth';
import { getNotifications } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const [viewer, notifications] = await Promise.all([requireRole('client'), getNotifications()]);
  return <PortalShell clientName={viewer.fullName} unreadCount={notifications.filter((item) => !item.readAt).length}><DemoBanner />{children}</PortalShell>;
}
