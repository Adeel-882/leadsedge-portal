import { EmptyState } from '@/components/empty-state';
import { NotificationsList } from '@/components/notifications-list';
import { getNotifications } from '@/lib/queries';

export default async function ClientNotificationsPage() {
  const notifications = await getNotifications();
  return <div><div className="mb-7"><p className="page-eyebrow">What’s new</p><h1 className="page-title">Notifications</h1><p className="page-subtitle">Task assignments, replies, and project updates.</p></div>{notifications.length ? <NotificationsList notifications={notifications} /> : <EmptyState title="You’re all caught up" body="New task and message activity will appear here." />}</div>;
}
