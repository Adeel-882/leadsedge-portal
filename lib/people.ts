import { cache } from 'react';
import { createSupabaseServerClient } from './supabase/server';

export const PEOPLE_PAGE_SIZE = 25;
export const PERSON_TAB_PAGE_SIZE = 20;

export type PersonListRow = {
  id: string; authUserId: string | null; fullName: string; email: string; company: string | null;
  title: string | null; phone: string | null; status: string; createdAt: string; lastLoginAt: string | null;
  projectCount: number; projectNames: string[]; firstProjectId: string | null;
};

export type PersonBase = Omit<PersonListRow, 'projectCount' | 'projectNames' | 'firstProjectId'>;

function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }

export async function getPeople(search = '', page = 1) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { rows: [] as PersonListRow[], total: 0 };
  const safePage = Math.max(1, Math.min(page, 10000));
  const { data, error } = await supabase.rpc('get_admin_people', { search_text: search, page_number: safePage, page_size: PEOPLE_PAGE_SIZE });
  if (error) throw error;
  const rows = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id), authUserId: row.auth_user_id ? String(row.auth_user_id) : null,
    fullName: String(row.full_name), email: String(row.email), company: row.company ? String(row.company) : null,
    title: row.title ? String(row.title) : null, phone: row.phone ? String(row.phone) : null,
    status: String(row.status), createdAt: String(row.created_at), lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    projectCount: Number(row.project_count || 0), projectNames: Array.isArray(row.project_names) ? row.project_names.map(String) : [],
    firstProjectId: row.first_project_id ? String(row.first_project_id) : null,
  }));
  return { rows, total: Number((data?.[0] as { total_count?: number } | undefined)?.total_count || 0) };
}

export const getPersonBase = cache(async (clientId: string): Promise<PersonBase | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [profile, lastLogin] = await Promise.all([
    supabase.from('clients').select('id,auth_user_id,full_name,email,company,title,phone,status,created_at').eq('id', clientId).maybeSingle(),
    supabase.rpc('get_admin_client_last_login', { target_client_id: clientId }),
  ]);
  if (profile.error) throw profile.error;
  if (lastLogin.error) throw lastLogin.error;
  if (!profile.data) return null;
  return { id: profile.data.id, authUserId: profile.data.auth_user_id, fullName: profile.data.full_name, email: profile.data.email, company: profile.data.company, title: profile.data.title, phone: profile.data.phone, status: profile.data.status, createdAt: profile.data.created_at, lastLoginAt: lastLogin.data };
});

export async function getPersonOverview(clientId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [memberships, meeting] = await Promise.all([
    supabase.from('project_clients').select('project:projects(id,status,project_tasks(id,assignee_id,status,feedback_state,archived_at))').eq('client_id', clientId),
    supabase.from('meetings').select('id,title,start_at,status,project:projects(project_name)').eq('client_id', clientId).eq('status', 'scheduled').gte('start_at', new Date().toISOString()).order('start_at').limit(1).maybeSingle(),
  ]);
  if (memberships.error) throw memberships.error;
  if (meeting.error) throw meeting.error;
  const projects = (memberships.data ?? []).map((row) => one(row.project)).filter(Boolean) as Array<{ id: string; status: string; project_tasks: Array<{ id: string; assignee_id: string | null; status: string; feedback_state: string; archived_at: string | null }> }>;
  const tasks = projects.flatMap((project) => project.project_tasks ?? []).filter((task) => task.assignee_id === clientId && !task.archived_at);
  return {
    projectCount: projects.length,
    firstProjectId: projects[0]?.id ?? null,
    totalLeads: tasks.length,
    activeLeads: tasks.filter((task) => task.status === 'active').length,
    completedLeads: tasks.filter((task) => task.status === 'completed').length,
    feedbackPending: tasks.filter((task) => ['pending', 'waiting', 'requested'].includes(task.feedback_state)).length,
    feedbackSubmitted: tasks.filter((task) => task.feedback_state === 'submitted').length,
    upcomingMeeting: meeting.data ? { ...meeting.data, project: one(meeting.data.project) } : null,
  };
}

export async function getPersonProjects(clientId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('project_clients').select('created_at,is_primary,project:projects(id,project_name,status,created_at,owner:users(full_name),project_tasks(id,archived_at))').eq('client_id', clientId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, project: one(row.project) })).filter((row) => row.project);
}

export async function getPersonForms(clientId: string, page = 1) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { rows: [], total: 0 };
  const offset = (Math.max(1, page) - 1) * PERSON_TAB_PAGE_SIZE;
  const { data, error, count } = await supabase.from('project_tasks')
    .select('id,title,task_type,status,feedback_state,feedback_scheduled_for,feedback_requested_at,feedback_submitted_at,created_at,project:projects!inner(id,project_name,project_clients!inner(client_id)),form_submissions(id,submitted_at,answers)', { count: 'exact' })
    .eq('assignee_id', clientId).eq('project.project_clients.client_id', clientId).is('archived_at', null).or('task_type.eq.form,feedback_enabled.eq.true')
    .order('created_at', { ascending: false }).range(offset, offset + PERSON_TAB_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []).map((row) => ({ ...row, project: one(row.project) })), total: count ?? 0 };
}

const emailGroups: Record<string, string[]> = {
  assignments: ['task.assigned'], feedback: ['feedback.requested', 'feedback.submitted'],
  meetings: ['meeting.booked', 'meeting.cancelled', 'meeting.reminder'], invitations: ['client_invitation', 'client_sign_in'],
};

export async function getPersonEmails(clientId: string, page = 1, filter = 'all') {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { rows: [], total: 0 };
  const safePage = Math.max(1, Math.min(page, 50));
  const fetchLimit = safePage * PERSON_TAB_PAGE_SIZE;
  const types = emailGroups[filter];
  let outbox = supabase.from('email_outbox').select('id,email_type,recipient_email,template_data,status,last_error,created_at,sent_at,project:projects(id,project_name),task:project_tasks(id,title)', { count: 'exact' }).eq('client_id', clientId).order('created_at', { ascending: false }).limit(fetchLimit);
  let deliveries = supabase.from('email_deliveries').select('id,email_type,status,error_message,created_at,project:projects(id,project_name)', { count: 'exact' }).eq('client_id', clientId).in('email_type', ['client_invitation', 'client_sign_in']).order('created_at', { ascending: false }).limit(fetchLimit);
  if (types) {
    outbox = outbox.in('email_type', types);
    deliveries = deliveries.in('email_type', types);
  }
  const [outboxResult, deliveryResult] = await Promise.all([outbox, deliveries]);
  if (outboxResult.error) throw outboxResult.error;
  if (deliveryResult.error) throw deliveryResult.error;
  const rows = [
    ...(outboxResult.data ?? []).map((row) => ({ ...row, source: 'outbox' as const, project: one(row.project), task: one(row.task) })),
    ...(deliveryResult.data ?? []).map((row) => ({ ...row, source: 'delivery' as const, project: one(row.project), task: null, recipient_email: null, template_data: {}, last_error: row.error_message, sent_at: row.status === 'sent' ? row.created_at : null })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const offset = (safePage - 1) * PERSON_TAB_PAGE_SIZE;
  return { rows: rows.slice(offset, offset + PERSON_TAB_PAGE_SIZE), total: (outboxResult.count ?? 0) + (deliveryResult.count ?? 0) };
}

export async function getPersonActivity(clientId: string, page = 1) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { rows: [], total: 0 };
  const offset = (Math.max(1, page) - 1) * PERSON_TAB_PAGE_SIZE;
  const { data, error, count } = await supabase.from('project_tasks')
    .select('id,title,status,feedback_state,created_at,activated_at,completed_at,project:projects!inner(id,project_name,project_clients!inner(client_id))', { count: 'exact' })
    .eq('assignee_id', clientId).eq('project.project_clients.client_id', clientId).is('archived_at', null).order('created_at', { ascending: false }).range(offset, offset + PERSON_TAB_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []).map((row) => ({ ...row, project: one(row.project) })), total: count ?? 0 };
}

export async function getPersonPreview(clientId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('project_clients').select('project:projects(id,project_name,status,project_tasks(id,title,status,feedback_state,client_visible,assignee_id,archived_at))').eq('client_id', clientId);
  if (error) throw error;
  return (data ?? []).map((row) => one(row.project)).filter(Boolean).map((project) => ({ ...project!, project_tasks: (project!.project_tasks ?? []).filter((task) => task.client_visible && task.assignee_id === clientId && !task.archived_at && task.status !== 'draft') }));
}
