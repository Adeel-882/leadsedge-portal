import { DemoBanner } from '@/components/demo-banner';
import { PortalShell } from '@/components/portal/portal-shell';
import { requireRole } from '@/lib/auth';
import { getUnreadCounts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const [viewer, unread] = await Promise.all([requireRole('client'), getUnreadCounts()]);
  return <PortalShell clientName={viewer.fullName} viewerId={viewer.id} messageUnreadCount={unread.messages} notificationUnreadCount={unread.notifications}><DemoBanner />{children}</PortalShell>;
}
