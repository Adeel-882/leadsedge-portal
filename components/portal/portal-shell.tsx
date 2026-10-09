'use client';

import { ThemeToggle } from '@/components/theme-toggle';

import { CacheLink as Link } from '@/components/cache-link';
import { usePathname } from 'next/navigation';
import { Bell, ChatCircleDots, CheckSquare, House } from '@phosphor-icons/react';
import { Brand } from '@/components/brand';
import { useUnreadCounts } from '@/components/unread-counts';
import { useTaskAttentionCount } from '@/components/task-attention-count';
import { initials } from '@/lib/format';

const items = [
  { href: '/portal', label: 'Home', Icon: House },
  { href: '/portal/tasks', label: 'Tasks', Icon: CheckSquare },
  { href: '/portal/messages', label: 'Messages', Icon: ChatCircleDots },
];

export function PortalShell({ children, clientName, viewerId, messageUnreadCount, notificationUnreadCount }: { children: React.ReactNode; clientName: string; viewerId: string; messageUnreadCount: number; notificationUnreadCount: number }) {
  const pathname = usePathname();
  const taskCount = useTaskAttentionCount();
  const unread = useUnreadCounts(viewerId, messageUnreadCount, notificationUnreadCount);
  return <div className="min-h-screen bg-canvas text-ink">
    <header className="portal-header"><Brand href="/portal" /><nav className="portal-desktop-nav" aria-label="Client navigation">{items.map((item) => { const active = item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href); return <Link prefetch={false} key={item.href} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''} href={item.href}><item.Icon size={17} weight={active ? 'fill' : 'regular'} aria-hidden />{item.label}{item.label === 'Tasks' && taskCount > 0 && <span className="unread-pill" aria-label={`${taskCount} tasks requiring action`}>{taskCount > 99 ? '99+' : taskCount}</span>}{item.label === 'Messages' && unread.messages > 0 && <span className="unread-pill">{unread.messages}</span>}</Link>; })}</nav><div className="topbar-actions"><ThemeToggle /><Link prefetch={false} href="/portal/notifications" className="notification-button" aria-label={`Notifications${unread.notifications ? ` (${unread.notifications} unread)` : ''}`}><Bell size={19} aria-hidden />{unread.notifications > 0 && <span>{unread.notifications}</span>}</Link><Link prefetch={false} href="/portal/account" aria-label="Account" className="avatar avatar-navy">{initials(clientName)}</Link></div></header>
    <main className="portal-main">{children}</main>
    <nav className="portal-mobile-nav" aria-label="Client navigation">{items.map((item) => { const active = item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href); return <Link prefetch={false} key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''}><item.Icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden />{item.label === 'Tasks' && taskCount > 0 && <span className="mobile-nav-badge" aria-label={`${taskCount} tasks requiring action`}>{taskCount > 99 ? '99+' : taskCount}</span>}{item.label === 'Messages' && unread.messages > 0 && <span className="mobile-nav-badge">{unread.messages}</span>}<small>{item.label}</small></Link>; })}</nav>
  </div>;
}
