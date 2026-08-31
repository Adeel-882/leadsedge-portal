import { cache } from 'react';
import { demoProjects, demoTasks } from './demo-data';
import { isDemoMode } from './env';
import { createSupabaseServerClient } from './supabase/server';

export type AuthorizedClientProject = {
  id: string;
  projectName: string;
  ownerId: string;
  status: 'active' | 'completed' | 'archived';
};

export const getAuthorizedClientProject = cache(async (viewerId: string, projectId: string, activeOnly = false): Promise<AuthorizedClientProject | null> => {
  if (isDemoMode()) {
    const project = demoProjects.find((item) => item.id === projectId && (!activeOnly || item.status === 'active'));
    return project ? { id: project.id, projectName: project.projectName, ownerId: '', status: project.status } : null;
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  let query = supabase
    .from('project_clients')
    .select('client:clients!inner(auth_user_id,status),project:projects!inner(id,project_name,owner_id,status)')
    .eq('project_id', projectId)
    .eq('client.auth_user_id', viewerId)
    .neq('client.status', 'disabled');
  if (activeOnly) query = query.eq('project.status', 'active');
  const { data: link, error } = await query.maybeSingle();
  if (error || !link) return null;
  const project = Array.isArray(link.project) ? link.project[0] : link.project;
  if (!project) return null;
  return { id: project.id, projectName: project.project_name, ownerId: project.owner_id, status: project.status };
});

export const getAuthorizedClientTask = cache(async (viewerId: string, taskId: string) => {
  if (isDemoMode()) return demoTasks.find((item) => item.id === taskId && item.clientVisible && item.status !== 'draft') || null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: task, error } = await supabase
    .from('project_tasks')
    .select('id,project_id,assignee_id,client_visible,status,assignee:clients!inner(auth_user_id,status)')
    .eq('id', taskId)
    .eq('assignee.auth_user_id', viewerId)
    .neq('assignee.status', 'disabled')
    .eq('client_visible', true)
    .neq('status', 'draft')
    .is('archived_at', null)
    .maybeSingle();
  if (error || !task) return null;
  const project = await getAuthorizedClientProject(viewerId, task.project_id);
  return project ? { id: task.id, projectId: task.project_id, assigneeId: task.assignee_id, status: task.status } : null;
});

export const getAuthorizedClientMeeting = cache(async (viewerId: string, meetingId: string) => {
  if (isDemoMode()) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('id,project_id,client_id,owner_id,status,start_at,client:clients!inner(auth_user_id,status)')
    .eq('id', meetingId)
    .eq('client.auth_user_id', viewerId)
    .neq('client.status', 'disabled')
    .maybeSingle();
  if (error || !meeting) return null;
  const project = await getAuthorizedClientProject(viewerId, meeting.project_id);
  return project ? meeting : null;
});
