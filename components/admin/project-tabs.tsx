'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChatCircleDots, CheckSquare, FolderOpen } from '@phosphor-icons/react';

export function ProjectTabs({ projectId, projectName, clientName, ownerName, status }: { projectId: string; projectName: string; clientName: string; ownerName: string; status: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/admin/projects/${projectId}`, label: 'Overview', Icon: FolderOpen },
    { href: `/admin/projects/${projectId}/tasks`, label: 'Tasks', Icon: CheckSquare },
    { href: `/admin/projects/${projectId}/chat`, label: 'Chat', Icon: ChatCircleDots },
  ];
  return <div className="border-b border-line bg-white px-4 pt-4 md:px-7"><div className="mx-auto max-w-[1320px]"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="avatar h-10 w-10 bg-[#e6f1ef] text-sm text-teal">{projectName[0]}</span><div className="min-w-0"><h1 className="truncate text-lg font-bold tracking-[-.025em]">{projectName}</h1><p className="truncate text-xs text-muted">{clientName} <span aria-hidden>•</span> Owner: {ownerName}</p></div></div><span className={`status-badge ${status === 'active' ? 'status-active' : status === 'completed' ? 'status-completed' : 'status-archived'} self-start sm:self-auto`}>{status}</span></div><nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="Project navigation">{items.map((item) => { const active = item.href === `/admin/projects/${projectId}` ? pathname === item.href : pathname.startsWith(item.href); return <Link prefetch={false} key={item.href} aria-current={active ? 'page' : undefined} className={`flex min-h-10 items-center gap-2 border-b-2 px-3 text-[13px] font-semibold ${active ? 'border-teal text-teal' : 'border-transparent text-muted hover:text-ink'}`} href={item.href}><item.Icon size={16} weight={active ? 'fill' : 'regular'} aria-hidden />{item.label}</Link>; })}</nav></div></div>;
}
