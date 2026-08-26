'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from '@/components/brand';
import { initials } from '@/lib/format';

const items = [
  { href: '/admin', label: 'Dashboard', icon: '▦' },
  { href: '/admin/templates', label: 'Templates', icon: '▤' },
  { href: '/admin/meetings', label: 'Meetings', icon: '□', soon: true },
  { href: '/admin/messages', label: 'Messages', icon: '◇' },
];

export function AdminShell({ children, displayName, unreadCount }: { children: React.ReactNode; displayName: string; unreadCount: number }) {
  const pathname = usePathname();
  return <div className="min-h-screen bg-canvas text-ink">
    <aside className="admin-sidebar">
      <Brand href="/admin" />
      <p className="nav-eyebrow">Workspace</p>
      <nav className="space-y-1">
        {items.map((item) => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} className={`nav-link ${active ? 'nav-link-active' : ''}`}><span aria-hidden>{item.icon}</span><span>{item.label}</span>{item.soon && <span className="soon-pill">Soon</span>}{item.label === 'Messages' && unreadCount > 0 && <span className="unread-pill">{unreadCount}</span>}</Link>;
        })}
      </nav>
      <div className="mt-auto border-t border-line pt-5">
        <Link href="/admin/settings" className="profile-link"><span className="avatar avatar-navy">{initials(displayName)}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{displayName}</span><span className="block text-xs text-muted">Administrator</span></span><span className="ml-auto">›</span></Link>
      </div>
    </aside>
    <div className="lg:pl-[248px]">
      <header className="topbar"><div className="lg:hidden"><Brand href="/admin" /></div><div className="hidden lg:block"><p className="text-xs text-muted">Admin workspace</p><p className="font-semibold">Leadsedge Portal</p></div><div className="flex items-center gap-2"><Link href="/admin/notifications" aria-label="Notifications" className="notification-button">♧{unreadCount > 0 && <span>{unreadCount}</span>}</Link><Link href="/admin/settings" className="avatar avatar-navy">{initials(displayName)}</Link></div></header>
      {children}
      <nav className="mobile-admin-nav">{items.map((item) => <Link key={item.href} href={item.href} className={(item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)) ? 'active' : ''}><span>{item.icon}</span><small>{item.label}</small></Link>)}</nav>
    </div>
  </div>;
}
