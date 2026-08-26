'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from '@/components/brand';
import { initials } from '@/lib/format';

const items = [
  { href: '/portal', label: 'Home', icon: '⌂' },
  { href: '/portal/tasks', label: 'Tasks', icon: '✓' },
  { href: '/portal/messages', label: 'Messages', icon: '◇' },
  { href: '/portal/meetings', label: 'Meetings', icon: '□' },
];

export function PortalShell({ children, clientName, unreadCount }: { children: React.ReactNode; clientName: string; unreadCount: number }) {
  const pathname = usePathname();
  return <div className="min-h-screen bg-[#f7f9fc] text-ink">
    <header className="portal-header"><Brand href="/portal" /><nav className="portal-desktop-nav">{items.map((item) => <Link key={item.href} className={(item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href)) ? 'active' : ''} href={item.href}>{item.label}{item.label === 'Messages' && unreadCount > 0 && <span className="ml-1 text-teal">({unreadCount})</span>}</Link>)}</nav><div className="flex items-center gap-3"><Link href="/portal/notifications" className="notification-button" aria-label="Notifications">♧{unreadCount > 0 && <span>{unreadCount}</span>}</Link><Link href="/portal/account" className="avatar bg-[#daf0ec] text-[#0b7168]">{initials(clientName)}</Link></div></header>
    <main className="portal-main">{children}</main>
    <nav className="portal-mobile-nav">{items.map((item) => <Link key={item.href} href={item.href} className={(item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href)) ? 'active' : ''}><span>{item.icon}</span><small>{item.label}</small></Link>)}</nav>
  </div>;
}
