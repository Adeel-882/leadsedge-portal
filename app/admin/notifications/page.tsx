import { EmptyState } from '@/components/empty-state';
import { NotificationsList } from '@/components/notifications-list';
import { getNotifications } from '@/lib/queries';

export default async function AdminNotificationsPage() {
  const notifications = await getNotifications();
  return <div className="page-wrap"><div className="mb-8"><p className="page-eyebrow">Inbox</p><h1 className="page-title">Notifications</h1><p className="page-subtitle">Task completions, client comments, and project messages.</p></div>{notifications.length ? <NotificationsList notifications={notifications} /> : <EmptyState title="You’re all caught up" body="New client activity will appear here." />}</div>;
}
