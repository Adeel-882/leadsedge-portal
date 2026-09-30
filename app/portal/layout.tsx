import { QueryProvider } from '@/components/query-provider';
import { DemoBanner } from '@/components/demo-banner';
import { PortalShell } from '@/components/portal/portal-shell';
import { requireBootstrapRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const { viewer, unread } = await requireBootstrapRole('client');
  return <QueryProvider identity={{ id: viewer.id, role: 'client' }}><PortalShell clientName={viewer.fullName} viewerId={viewer.id} messageUnreadCount={unread.messages} notificationUnreadCount={unread.notifications}><DemoBanner />{children}</PortalShell></QueryProvider>;
}
