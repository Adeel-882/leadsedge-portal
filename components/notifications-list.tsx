'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CalendarBlank, ChatCircleDots, CheckCircle, PaperPlaneTilt, Sparkle } from '@phosphor-icons/react';
import { notifyUnreadCountsChanged } from '@/components/unread-counts';
import { formatTime } from '@/lib/format';
import type { NotificationRecord } from '@/lib/types';

export function NotificationsList({ notifications }: { notifications: NotificationRecord[] }) {
  const router = useRouter();
  const [locallyReadIds, setLocallyReadIds] = useState<Set<string>>(() => new Set());
  const [updatingAll, setUpdatingAll] = useState(false);
  const items = useMemo(() => notifications.map((item) => locallyReadIds.has(item.id) ? { ...item, readAt: item.readAt || new Date().toISOString() } : item), [locallyReadIds, notifications]);

  async function read(item: NotificationRecord) {
    const target = item.targetUrl.startsWith('/') && !item.targetUrl.startsWith('//') ? item.targetUrl : '/';
    if (!item.readAt) {
      const response = await fetch(`/api/notifications/${item.id}`, { method: 'PATCH' });
      if (!response.ok) return;
      setLocallyReadIds((current) => new Set(current).add(item.id));
      notifyUnreadCountsChanged({ notifications: 1 });
    }
    router.push(target);
  }

  async function markAllRead() {
    setUpdatingAll(true);
    const response = await fetch('/api/notifications', { method: 'PATCH' });
    if (response.ok) {
      const unreadTotal = items.filter((item) => !item.readAt).length;
      setLocallyReadIds(new Set(items.map((item) => item.id)));
      notifyUnreadCountsChanged({ notifications: unreadTotal });
    }
    setUpdatingAll(false);
  }

  const hasUnread = items.some((item) => !item.readAt);
  return <div><div className="mb-3 flex justify-end"><button className="button-secondary" disabled={!hasUnread || updatingAll} onClick={markAllRead}><CheckCircle size={16} aria-hidden />{updatingAll ? 'Marking...' : 'Mark all as read'}</button></div><div className="surface-flat overflow-hidden">{items.map((item) => { const Icon = notificationIcon(item.type); return <button key={item.id} onClick={() => read(item)} className={`group flex w-full gap-3 border-b border-line p-4 text-left last:border-b-0 hover:bg-brand-soft sm:gap-4 sm:p-5 ${item.readAt ? '' : 'bg-brand-soft'}`}><span className={`grid h-9 w-9 flex-none place-items-center rounded-lg ${item.readAt ? 'bg-surface-strong text-muted' : 'bg-brand-soft text-brand-text'}`}><Icon size={18} weight={item.readAt ? 'regular' : 'fill'} aria-hidden /></span><span className="min-w-0"><span className={`block text-sm ${item.readAt ? 'font-medium' : 'font-bold'}`}>{item.title}</span><span className="mt-1 block text-sm leading-5 text-muted">{item.body}</span><small className="mt-2 block text-muted">{formatTime(item.createdAt)}</small></span>{!item.readAt && <span className="ml-auto mt-2 h-2 w-2 flex-none rounded-full bg-brand" aria-label="Unread" />}</button>; })}</div></div>;
}

function notificationIcon(type: string) {
  const value = type.toLowerCase();
  if (value.includes('message')) return ChatCircleDots;
  if (value.includes('meeting')) return CalendarBlank;
  if (value.includes('feedback')) return Sparkle;
  if (value.includes('complete')) return CheckCircle;
  return PaperPlaneTilt;
}
