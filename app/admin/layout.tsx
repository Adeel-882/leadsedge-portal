import { QueryProvider } from '@/components/query-provider';
import { AdminShell } from '@/components/admin/admin-shell';
import { DemoBanner, EmailConfigurationBanner } from '@/components/demo-banner';
import { requireBootstrapRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { viewer, unread } = await requireBootstrapRole('admin');
  return <QueryProvider identity={{ id: viewer.id, role: 'admin' }}><AdminShell displayName={viewer.fullName} viewerId={viewer.id} messageUnreadCount={unread.messages} notificationUnreadCount={unread.notifications}><DemoBanner /><EmailConfigurationBanner />{children}</AdminShell></QueryProvider>;
}
