'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ProjectTabs({ projectId, projectName, clientName }: { projectId: string; projectName: string; clientName: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/admin/projects/${projectId}`, label: 'Overview' },
    { href: `/admin/projects/${projectId}/tasks`, label: 'Tasks' },
    { href: `/admin/projects/${projectId}/chat`, label: 'Chat' },
  ];
  return <div className="border-b border-line bg-white px-5 pt-6 md:px-10"><div className="mx-auto max-w-[1320px]"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f5f2] font-bold text-teal">{projectName[0]}</span><div><h1 className="text-xl font-bold">{projectName}</h1><p className="text-xs text-muted">Client: {clientName}</p></div></div><nav className="mt-5 flex gap-7 overflow-x-auto">{items.map((item) => { const active = item.href === `/admin/projects/${projectId}` ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${active ? 'border-teal text-teal' : 'border-transparent text-muted'}`} href={item.href}>{item.label}</Link>; })}</nav></div></div>;
}
