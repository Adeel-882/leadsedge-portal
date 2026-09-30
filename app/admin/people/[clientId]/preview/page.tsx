import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { getPersonBase, getPersonPreview } from '@/lib/people';

export default async function PersonPreviewPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const [, person, projects] = await Promise.all([requireRole('admin'), getPersonBase(clientId), getPersonPreview(clientId)]);
  if (!person) notFound();
  return <div className="page-wrap"><div className="page-header page-header-row"><div><p className="page-eyebrow">Read-only administrative preview</p><h1 className="page-title">{person.fullName}&apos;s portal view</h1><p className="page-subtitle">This applies client-visible task rules without impersonating or creating a client session.</p></div><Link prefetch={false} className="button-secondary" href={`/admin/people/${clientId}`}>Back to person</Link></div><div className="space-y-4">{projects.map((project) => <section key={project.id} className="surface-flat p-5"><h2 className="font-bold">{project.project_name}</h2><p className="mt-1 text-xs capitalize text-muted">{project.status}</p><div className="mt-5 space-y-2">{project.project_tasks.map((task) => <div key={task.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm"><span className="font-semibold">{task.title}</span><span className="capitalize text-muted">{task.status}</span></div>)}{!project.project_tasks.length && <p className="text-sm text-muted">No client-visible active tasks.</p>}</div></section>)}{!projects.length && <div className="surface-flat p-12 text-center text-sm text-muted">No portal projects are attached to this person.</div>}</div></div>;
}
