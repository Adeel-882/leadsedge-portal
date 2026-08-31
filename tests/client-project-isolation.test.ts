import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const queries = read('../lib/queries.ts');
const clientAccess = read('../lib/client-access.ts');
const meetingBooking = read('../app/api/portal/meetings/route.ts');
const meetingSlots = read('../app/api/portal/meetings/slots/route.ts');
const taskCompletion = read('../app/api/portal/tasks/[taskId]/complete/route.ts');
const taskSubmission = read('../app/api/portal/tasks/[taskId]/submit/route.ts');
const messages = read('../app/api/messages/[kind]/[resourceId]/route.ts');
const notification = read('../app/api/notifications/[notificationId]/route.ts');
const scheduler = read('../components/meetings/meeting-scheduler.tsx');
const migration = read('../supabase/migrations/202608290001_harden_client_project_isolation.sql');

describe('client project isolation', () => {
  it('scopes client project, task, meeting, and notification reads to the authenticated identity', () => {
    expect(queries).toContain(".eq('project_clients.client.auth_user_id', viewer.id)");
    expect(queries).toContain(".eq('assignee.auth_user_id', viewer.id)");
    expect(queries).toContain(".eq('user_id', viewer.id)");
    expect(clientAccess).toContain(".eq('client.auth_user_id', viewerId)");
  });

  it('checks project or task authorization before client mutations', () => {
    expect(meetingBooking).toContain('getAuthorizedClientProject(viewer.id, parsed.data.projectId, true)');
    expect(meetingSlots).toContain('getAuthorizedClientProject(viewer.id, projectId, true)');
    expect(taskCompletion).toContain('getAuthorizedClientTask(viewer.id, taskId)');
    expect(taskSubmission).toContain('getAuthorizedClientTask(viewer.id, taskId)');
    expect(messages).toContain("viewer.role === 'client' && !await clientCanAccess");
  });

  it('does not report another user notification as successfully updated', () => {
    expect(notification).toContain(".eq('user_id', viewer.id).select('id').maybeSingle()");
    expect(notification).toContain("Notification not found.");
  });

  it('renders a fixed project identity when only one authorized project exists', () => {
    expect(scheduler).toContain('projects.length === 1 && project');
    expect(scheduler).toContain('Project owner: {project.ownerName}');
  });

  it('hardens task and meeting RLS with same-project membership', () => {
    expect(migration).toContain('join public.project_clients membership');
    expect(migration).toContain('membership.project_id = task.project_id');
    expect(migration).toContain('membership.project_id = meetings.project_id');
    expect(migration).toContain('client_id = current_client');
    expect(migration).toContain('revoke all on function public.process_due_feedback_requests() from public, anon, authenticated');
  });
});
