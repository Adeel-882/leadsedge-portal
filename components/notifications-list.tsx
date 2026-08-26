'use client';

import { useRouter } from 'next/navigation';
import { formatTime } from '@/lib/format';
import type { NotificationRecord } from '@/lib/types';

export function NotificationsList({ notifications }: { notifications: NotificationRecord[] }) {
  const router = useRouter();
  async function read(id: string) { await fetch(`/api/notifications/${id}`, { method: 'PATCH' }); router.refresh(); }
  return <div className="card divide-y divide-line overflow-hidden">{notifications.map((item) => <button key={item.id} onClick={() => read(item.id)} className={`flex w-full gap-4 p-5 text-left hover:bg-[#fbfcfd] ${item.readAt ? '' : 'bg-[#f1faf8]'}`}><span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.readAt ? 'bg-[#cbd3dd]' : 'bg-teal'}`} /><span><b className="block text-sm">{item.title}</b><span className="mt-1 block text-sm text-muted">{item.body}</span><small className="mt-2 block text-muted">{formatTime(item.createdAt)}</small></span></button>)}</div>;
}
