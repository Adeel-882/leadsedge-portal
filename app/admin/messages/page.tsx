import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { getAdminProjects } from '@/lib/queries';

export default async function AdminMessagesPage() {
  const projects = (await getAdminProjects()).filter((project) => project.status === 'active');
  return <div className="page-wrap"><div className="mb-8"><p className="page-eyebrow">Project communication</p><h1 className="page-title">Messages</h1><p className="page-subtitle">Choose an active project to open its general chat.</p></div>{projects.length ? <div className="card overflow-hidden"><div className="border-b border-line p-5"><h2 className="font-bold">Active project chats</h2><p className="mt-1 text-sm text-muted">Task-specific comments are intentionally excluded.</p></div><div className="divide-y divide-line">{projects.map((project) => <Link key={project.id} href={`/admin/projects/${project.id}/chat`} className="flex items-center gap-4 p-5 hover:bg-[#fbfcfd]"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#e8f5f2] font-bold text-teal">{project.clientName[0]}</span><div><p className="font-semibold">{project.projectName}</p><p className="mt-1 text-sm text-muted">Project chat with {project.clientName}</p></div><span className="ml-auto text-xl text-muted">›</span></Link>)}</div></div> : <EmptyState title="No active project chats" body="Create a project to start a general conversation with its client." />}</div>;
}
