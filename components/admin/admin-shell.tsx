'use client';

import { ThemeToggle } from '@/components/theme-toggle';

import { CacheLink as Link } from '@/components/cache-link';
import { usePathname } from 'next/navigation';
import { Bell, CalendarDots, CaretRight, ChatsCircle, GearSix, SquaresFour, Stack, UsersThree } from '@phosphor-icons/react';
import { Brand } from '@/components/brand';
import { useUnreadCounts } from '@/components/unread-counts';
import { initials } from '@/lib/format';

const items = [
  { href: '/admin', label: 'Dashboard', Icon: SquaresFour },
  { href: '/admin/people', label: 'People', Icon: UsersThree },
  { href: '/admin/templates', label: 'Templates', Icon: Stack },
  { href: '/admin/meetings', label: 'Meetings', Icon: CalendarDots },
  { href: '/admin/messages', label: 'Messages', Icon: ChatsCircle },
  { href: '/admin/settings', label: 'Settings', Icon: GearSix },
];

export function AdminShell({ children, displayName, viewerId, messageUnreadCount, notificationUnreadCount }: { children: React.ReactNode; displayName: string; viewerId: string; messageUnreadCount: number; notificationUnreadCount: number }) {
  const pathname = usePathname();
  const unread = useUnreadCounts(viewerId, messageUnreadCount, notificationUnreadCount);
  return <div className="min-h-screen bg-canvas text-ink">
    <aside className="admin-sidebar">
      <div className="sidebar-brand"><Brand href="/admin" /></div>
      <p className="nav-eyebrow">Workspace</p>
      <nav className="space-y-1">
        {items.map((item) => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
          return <Link prefetch={false} key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`nav-link ${active ? 'nav-link-active' : ''}`}><item.Icon size={18} weight={active ? 'fill' : 'regular'} aria-hidden /><span>{item.label}</span>{item.label === 'Messages' && unread.messages > 0 && <span className="unread-pill">{unread.messages}</span>}</Link>;
        })}
      </nav>
      <div className="sidebar-profile mt-auto">
        <Link prefetch={false} href="/admin/settings" className="profile-link"><span className="avatar avatar-navy">{initials(displayName)}</span><span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{displayName}</span><span className="block text-[11px] text-muted">Administrator</span></span><CaretRight className="ml-auto text-muted" size={15} aria-hidden /></Link>
      </div>
    </aside>
    <div className="admin-content">
      <header className="topbar"><div className="lg:hidden"><Brand href="/admin" /></div><div className="topbar-context"><p className="text-[11px] text-muted">Admin workspace</p><p className="text-[13px] font-semibold">Leadsedge Portal</p></div><div className="topbar-actions"><ThemeToggle /><Link prefetch={false} href="/admin/notifications" aria-label={`Notifications${unread.notifications ? ` (${unread.notifications} unread)` : ''}`} className="notification-button"><Bell size={19} weight="regular" aria-hidden />{unread.notifications > 0 && <span>{unread.notifications}</span>}</Link><Link prefetch={false} href="/admin/settings" aria-label="Administrator settings" className="avatar avatar-navy">{initials(displayName)}</Link></div></header>
      {children}
      <nav className="mobile-admin-nav" aria-label="Admin navigation">{items.map((item) => { const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href); return <Link prefetch={false} key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''}><item.Icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden />{item.label === 'Messages' && unread.messages > 0 && <span className="mobile-nav-badge">{unread.messages}</span>}<small>{item.label}</small></Link>; })}</nav>
    </div>
  </div>;
}
