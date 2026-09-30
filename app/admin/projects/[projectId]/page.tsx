import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CalendarBlank, CheckSquare, ClockCounterClockwise, User } from '@phosphor-icons/react/dist/ssr';
import { InviteButton } from '@/components/admin/invite-button';
import { ProgressBar } from '@/components/progress-bar';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { getUpcomingProjectMeetings } from '@/lib/meetings';
import { getProject, getProjectClients, getProjectTasks } from '@/lib/queries';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const [projectResult, tasksResult, clientsResult, meetingsResult, activityResult, invitationsResult] = await Promise.allSettled([
    getProject(projectId),
    getProjectTasks(projectId),
    getProjectClients(projectId),
    getUpcomingProjectMeetings(projectId),
    supabase ? supabase.from('project_activity').select('id,body,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    supabase ? supabase.from('email_deliveries').select('client_id,status,created_at').eq('project_id', projectId).eq('email_type', 'client_invitation').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const project = projectResult.status === 'fulfilled' ? projectResult.value : null;
  if (!project) notFound();
  const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
  const clients = clientsResult.status === 'fulfilled' ? clientsResult.value : [];

  const primaryClient = clients[0];
  const meetings = meetingsResult.status === 'fulfilled' ? meetingsResult.value : [];
  const activity = activityResult.status === 'fulfilled' ? activityResult.value.data || [] : [];
  const invitationRows = invitationsResult.status === 'fulfilled' ? invitationsResult.value.data || [] : [];
  const invitation = invitationRows.find((item) => item.client_id === (primaryClient?.id || project.clientId)) || null;

  return <div className="page-wrap">
    <div className="page-header">
      <p className="page-eyebrow">Project overview</p>
      <h2 className="page-title">Current work and next actions</h2>
      <p className="page-subtitle">A compact view of progress, client access, meetings, and activity for {project.clientName}.</p>
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="surface-flat overflow-hidden" aria-label="Project summary">
        <div className="grid sm:grid-cols-3">
          <div className="border-b border-line p-5 sm:border-b-0 sm:border-r">
            <div className="flex items-center gap-2 text-muted"><CheckSquare size={16} aria-hidden /><p className="text-xs font-semibold">Project status</p></div>
            <div className="mt-4"><StatusBadge status={`${project.status}-project`} /></div>
            <p className="mt-4 text-xs text-muted">Created {formatDate(project.createdAt)}</p>
          </div>
          <div className="border-b border-line p-5 sm:border-b-0 sm:border-r">
            <p className="text-xs font-semibold text-muted">Task progress</p>
            <div className="mt-4"><ProgressBar completed={project.completedTasks} total={project.totalTasks} /></div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 text-muted"><CalendarBlank size={16} aria-hidden /><p className="text-xs font-semibold">Upcoming meetings</p></div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{meetings.length}</p>
            {meetings[0] ? <Link prefetch={false} href={`/admin/meetings/${meetings[0].id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-teal">{formatDate(meetings[0].startAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: meetings[0].timezone })}<ArrowRight size={12} aria-hidden /></Link> : <p className="mt-2 text-xs text-muted">No meetings scheduled</p>}
          </div>
        </div>
      </section>

      <aside className="surface-flat p-5" aria-labelledby="primary-client-title">
        <div className="flex items-center gap-2 text-muted"><User size={16} aria-hidden /><h3 id="primary-client-title" className="text-xs font-semibold">Primary client</h3></div>
        <p className="mt-3 text-base font-bold">{primaryClient?.fullName || project.clientName}</p>
        <p className="mt-1 break-all text-sm text-muted">{primaryClient?.email || 'No email available'}</p>
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[11px] font-semibold text-muted">Invitation status:</p>
          {invitation ? <p className={`mt-1 text-xs font-semibold ${invitation.status === 'sent' ? 'text-teal' : 'text-[#963d3d]'}`}>{invitation.status === 'sent' ? 'Sent' : 'Failed'} <span className="font-normal text-muted">on {formatDate(invitation.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></p> : <p className="mt-1 text-xs text-muted">No delivery status available</p>}
          {primaryClient && <InviteButton projectId={project.id} />}
        </div>
      </aside>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
      <section className="surface-flat overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-line p-5">
          <div><h3 className="section-title">Next tasks</h3><p className="section-description">The next work items in this project.</p></div>
          <Link prefetch={false} href={`/admin/projects/${project.id}/tasks`} className="button-secondary">View tasks<ArrowRight size={14} aria-hidden /></Link>
        </div>
        {tasks.length ? <div>{tasks.slice(0, 4).map((task) => <Link prefetch={false} className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-b-0 hover:bg-[#f8faf9]" key={task.id} href={`/admin/projects/${project.id}/tasks/${task.id}`}><div className="min-w-0"><p className="truncate text-sm font-semibold">{task.title}</p><p className="mt-1 text-xs text-muted">{task.assigneeName || 'Unassigned'}</p></div><StatusBadge status={task.status} /></Link>)}</div> : <p className="p-7 text-sm text-muted">No tasks have been added to this project.</p>}
      </section>

      <section className="surface-flat p-5">
        <div className="flex items-center gap-2"><ClockCounterClockwise size={17} className="text-muted" aria-hidden /><h3 className="section-title">Project activity</h3></div>
        <div className="mt-4 space-y-4">{activity.map((item) => <div key={item.id} className="border-l-2 border-[#cfe0dc] pl-3"><p className="text-sm leading-5">{item.body}</p><p className="mt-1 text-xs text-muted">{formatDate(item.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div>)}{!activity.length && <p className="text-sm leading-6 text-muted">Project and meeting activity will appear here.</p>}</div>
      </section>
    </div>
  </div>;
}
