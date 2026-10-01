import sanitizeHtml from 'sanitize-html';
import { cache } from 'react';
import { demoActivity, demoClient, demoNotifications, demoProjectMessages, demoProjects, demoTaskMessages, demoTasks, demoTemplates } from './demo-data';
import { isDemoMode } from './env';
import { createSupabaseServerClient } from './supabase/server';
import { getViewer } from './auth';
import { orderClientProjects } from './project-order';
import type { ActivityEvent, AdminConversationSummary, ClientSummary, ClientTaskSummary, ConversationMessage, ConversationThread, FeedbackState, FeedbackSubmission, FormField, NotificationRecord, ProjectSummary, TaskRecord, TemplateSummary, TemplateTaskRecord, Viewer } from './types';

const safeRichTextOptions: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) },
};

export function sanitizeTaskDescription(value: string) {
  return sanitizeHtml(value, safeRichTextOptions);
}

function feedbackState(value: unknown, enabled: boolean): FeedbackState {
  return value === 'pending' || value === 'waiting' || value === 'requested' || value === 'submitted' || value === 'cancelled' || value === 'not_configured'
    ? value
    : enabled ? 'pending' : 'not_configured';
}

export async function getAdminProjects(): Promise<ProjectSummary[]> {
  if (isDemoMode()) return demoProjects;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('id,project_name,status,created_at,owner:users!projects_owner_id_fkey(full_name,admin_settings(display_name)),project_clients(is_primary,client:clients(id,full_name)),project_tasks(status,archived_at)')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Unable to load projects.');
  return (data || []).map((row) => {
    const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
    const settings = owner?.admin_settings;
    const firstSettings = Array.isArray(settings) ? settings[0] : settings;
    const links = row.project_clients || [];
    const primaryLink = links.find((link) => link.is_primary) || links[0];
    const client = Array.isArray(primaryLink?.client) ? primaryLink.client[0] : primaryLink?.client;
    const tasks = (row.project_tasks || []).filter((task) => !task.archived_at);
    return {
      id: row.id,
      projectName: row.project_name,
      ownerName: firstSettings?.display_name || owner?.full_name || 'Admin',
      clientName: client?.full_name || 'Unassigned',
      clientId: client?.id || '',
      status: row.status,
      completedTasks: tasks.filter((task) => task.status === 'completed').length,
      totalTasks: tasks.length,
      createdAt: row.created_at,
      isPrimary: Boolean(primaryLink?.is_primary),
    };
  });
}

export async function getProject(projectId: string): Promise<ProjectSummary | null> {
  return getProjectForRequest(projectId);
}

const getProjectForRequest = cache(async (projectId: string): Promise<ProjectSummary | null> => {
  if (isDemoMode()) return demoProjects.find((project) => project.id === projectId) || null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: row, error } = await supabase
    .from('projects')
    .select('id,project_name,status,created_at,owner:users!projects_owner_id_fkey(full_name,admin_settings(display_name)),project_clients(is_primary,client:clients(id,full_name)),project_tasks(status,archived_at)')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !row) return null;
  const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
  const settings = owner?.admin_settings;
  const firstSettings = Array.isArray(settings) ? settings[0] : settings;
  const links = row.project_clients || [];
  const primaryLink = links.find((link) => link.is_primary) || links[0];
  const client = Array.isArray(primaryLink?.client) ? primaryLink.client[0] : primaryLink?.client;
  const tasks = (row.project_tasks || []).filter((task) => !task.archived_at);
  return { id: row.id, projectName: row.project_name, ownerName: firstSettings?.display_name || owner?.full_name || 'Admin', clientName: client?.full_name || 'Unassigned', clientId: client?.id || '', status: row.status, completedTasks: tasks.filter((task) => task.status === 'completed').length, totalTasks: tasks.length, createdAt: row.created_at, isPrimary: Boolean(primaryLink?.is_primary) };
});

export async function getAdminClients(): Promise<ClientSummary[]> {
  if (isDemoMode()) return [demoClient];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('clients').select('id,auth_user_id,full_name,email,company,status,project_clients!inner(project_id)').order('full_name');
  if (error) throw new Error('Unable to load clients.');
  return (data || []).map((client) => ({ id: client.id, authUserId: client.auth_user_id, fullName: client.full_name, email: client.email, company: client.company, status: client.status }));
}

export async function getProjectClients(projectId: string): Promise<ClientSummary[]> {
  if (isDemoMode()) return projectId === demoProjects[0].id ? [demoClient] : [];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('project_clients').select('is_primary,client:clients(id,auth_user_id,full_name,email,company,status)').eq('project_id', projectId).order('is_primary', { ascending: false });
  if (error) throw new Error('Unable to load project clients.');
  return (data || []).flatMap((row) => {
    const client = Array.isArray(row.client) ? row.client[0] : row.client;
    if (!client) return [];
    return [{ id: client.id, authUserId: client.auth_user_id, fullName: client.full_name, email: client.email, company: client.company, status: client.status }];
  });
}

export async function getProjectTasks(projectId: string, clientOnly = false): Promise<TaskRecord[]> {
  if (isDemoMode()) return demoTasks.filter((task) => task.projectId === projectId && (!clientOnly || (task.clientVisible && task.status !== 'draft')));
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  let query = supabase.from('project_tasks').select('id,project_id,title,description,task_type,status,client_visible,requires_completion,assignee_id,due_at,activated_at,completed_at,created_at,form_schema,feedback_enabled,feedback_delay_value,feedback_delay_unit,feedback_state,feedback_scheduled_for,feedback_requested_at,feedback_submitted_at,assignee:clients(full_name,auth_user_id,status)').eq('project_id', projectId).is('archived_at', null).order('created_at');
  if (clientOnly) {
    const viewer = await getViewer();
    if (!viewer || viewer.role !== 'client') return [];
    query = query.eq('assignee.auth_user_id', viewer.id).neq('assignee.status', 'disabled').eq('client_visible', true).neq('status', 'draft');
  }
  const { data, error } = await query;
  if (error) throw new Error('Unable to load tasks.');
  return (data || []).map((row) => {
    const assignee = Array.isArray(row.assignee) ? row.assignee[0] : row.assignee;
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      description: sanitizeTaskDescription(row.description || ''),
      taskType: row.task_type === 'form' ? 'form' : 'standard',
      status: row.status === 'active' || row.status === 'completed' ? row.status : 'draft',
      clientVisible: Boolean(row.client_visible),
      requiresCompletion: Boolean(row.requires_completion),
      assigneeId: row.assignee_id,
      assigneeName: assignee?.full_name || null,
      dueAt: row.due_at,
      activatedAt: row.activated_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      formSchema: Array.isArray(row.form_schema) ? row.form_schema as FormField[] : null,
      feedbackEnabled: Boolean(row.feedback_enabled),
      feedbackDelayValue: typeof row.feedback_delay_value === 'number' ? row.feedback_delay_value : null,
      feedbackDelayUnit: row.feedback_delay_unit === 'minutes' || row.feedback_delay_unit === 'hours' || row.feedback_delay_unit === 'days' ? row.feedback_delay_unit : null,
      feedbackState: feedbackState(row.feedback_state, Boolean(row.feedback_enabled)),
      feedbackScheduledFor: row.feedback_scheduled_for,
      feedbackRequestedAt: row.feedback_requested_at,
      feedbackSubmittedAt: row.feedback_submitted_at,
    };
  });
}

export async function getTask(taskId: string, authorizedViewerId?: string): Promise<TaskRecord | null> {
  if (isDemoMode()) return demoTasks.find((task) => task.id === taskId) || null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  // Same filters as getAuthorizedClientTask, combined with the full cold-screen row.
  // Admin callers retain the left join so unassigned tasks remain visible.
  let query = authorizedViewerId
    ? supabase.from('project_tasks').select('id,project_id,title,description,task_type,status,client_visible,requires_completion,assignee_id,due_at,activated_at,completed_at,created_at,form_schema,feedback_enabled,feedback_delay_value,feedback_delay_unit,feedback_state,feedback_scheduled_for,feedback_requested_at,feedback_submitted_at,assignee:clients!inner(full_name)')
    : supabase.from('project_tasks').select('id,project_id,title,description,task_type,status,client_visible,requires_completion,assignee_id,due_at,activated_at,completed_at,created_at,form_schema,feedback_enabled,feedback_delay_value,feedback_delay_unit,feedback_state,feedback_scheduled_for,feedback_requested_at,feedback_submitted_at,assignee:clients(full_name)');
  if (authorizedViewerId) query = query.eq('assignee.auth_user_id', authorizedViewerId).neq('assignee.status', 'disabled').eq('client_visible', true).neq('status', 'draft');
  const { data: row, error } = await query.eq('id', taskId).is('archived_at', null).maybeSingle();
  if (error || !row) return null;
  const assignee = Array.isArray(row.assignee) ? row.assignee[0] : row.assignee;
  const enabled = Boolean(row.feedback_enabled);
  return { id: row.id, projectId: row.project_id, title: row.title, description: sanitizeTaskDescription(row.description || ''), taskType: row.task_type === 'form' ? 'form' : 'standard', status: row.status === 'active' || row.status === 'completed' ? row.status : 'draft', clientVisible: Boolean(row.client_visible), requiresCompletion: Boolean(row.requires_completion), assigneeId: row.assignee_id, assigneeName: assignee?.full_name || null, dueAt: row.due_at, activatedAt: row.activated_at, completedAt: row.completed_at, createdAt: row.created_at, formSchema: Array.isArray(row.form_schema) ? row.form_schema as FormField[] : null, feedbackEnabled: enabled, feedbackDelayValue: typeof row.feedback_delay_value === 'number' ? row.feedback_delay_value : null, feedbackDelayUnit: row.feedback_delay_unit === 'minutes' || row.feedback_delay_unit === 'hours' || row.feedback_delay_unit === 'days' ? row.feedback_delay_unit : null, feedbackState: feedbackState(row.feedback_state, enabled), feedbackScheduledFor: row.feedback_scheduled_for, feedbackRequestedAt: row.feedback_requested_at, feedbackSubmittedAt: row.feedback_submitted_at };
}

export async function getTemplates(): Promise<TemplateSummary[]> {
  if (isDemoMode()) return demoTemplates;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('templates').select('id,name,description,archived_at,updated_at,template_tasks(count)').order('updated_at', { ascending: false });
  if (error) throw new Error('Unable to load templates.');
  return (data || []).map((row) => ({ id: row.id, name: row.name, description: row.description, archivedAt: row.archived_at, updatedAt: row.updated_at, taskCount: row.template_tasks?.[0]?.count || 0 }));
}

export async function getTemplateTasks(templateId: string) {
  if (isDemoMode()) return demoTasks.map((task, index) => ({ id: `00000000-0000-4000-8000-00000000031${index}`, title: task.title.replace(' - Adeel Ahmed', ''), taskType: task.taskType, clientVisible: task.clientVisible }));
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('template_tasks').select('id,title,task_type,client_visible').eq('template_id', templateId).order('sort_order');
  if (error) throw new Error('Unable to load template tasks.');
  return (data || []).map((row) => ({ id: row.id, title: row.title, taskType: row.task_type, clientVisible: row.client_visible }));
}

export async function getTemplatesWithTasks(): Promise<{ templates: TemplateSummary[]; templateTasks: Record<string, { id: string; title: string; taskType: string; clientVisible: boolean }[]> }> {
  if (isDemoMode()) {
    const entries = await Promise.all(demoTemplates.map(async (template) => [template.id, await getTemplateTasks(template.id)] as const));
    return { templates: demoTemplates, templateTasks: Object.fromEntries(entries) };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { templates: [], templateTasks: {} };
  const { data, error } = await supabase.from('templates').select('id,name,description,archived_at,updated_at,template_tasks(id,title,task_type,client_visible,sort_order)').order('updated_at', { ascending: false });
  if (error) throw new Error('Unable to load templates.');
  const rows = data || [];
  return {
    templates: rows.map((row) => ({ id: row.id, name: row.name, description: row.description, archivedAt: row.archived_at, updatedAt: row.updated_at, taskCount: row.template_tasks?.length || 0 })),
    templateTasks: Object.fromEntries(rows.map((row) => [row.id, (row.template_tasks || []).sort((a, b) => a.sort_order - b.sort_order).map((task) => ({ id: task.id, title: task.title, taskType: task.task_type, clientVisible: task.client_visible }))])),
  };
}

export async function getTemplateDetail(templateId: string): Promise<{ template: TemplateSummary; tasks: TemplateTaskRecord[] } | null> {
  if (isDemoMode()) {
    const template = demoTemplates.find((item) => item.id === templateId);
    if (!template) return null;
    return { template, tasks: demoTasks.map((task, index) => ({ id: `00000000-0000-4000-8000-00000000031${index}`, templateId, title: task.title.replace(' - Adeel Ahmed', ''), description: task.description, taskType: task.taskType, sortOrder: index + 1, clientVisible: task.clientVisible, requiresCompletion: task.requiresCompletion, formSchema: task.formSchema, feedbackEnabled: task.feedbackEnabled, feedbackDelayValue: task.feedbackDelayValue, feedbackDelayUnit: task.feedbackDelayUnit })) };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: row, error } = await supabase.from('templates').select('id,name,description,archived_at,updated_at,template_tasks(id,template_id,title,description,task_type,sort_order,client_visible,requires_completion,form_schema,feedback_enabled,feedback_delay_value,feedback_delay_unit)').eq('id', templateId).maybeSingle();
  if (error || !row) return null;
  return {
    template: { id: row.id, name: row.name, description: row.description, archivedAt: row.archived_at, updatedAt: row.updated_at, taskCount: row.template_tasks?.length || 0 },
    tasks: (row.template_tasks || []).sort((a, b) => a.sort_order - b.sort_order).map((task) => ({ id: task.id, templateId: task.template_id, title: task.title, description: sanitizeTaskDescription(task.description), taskType: task.task_type, sortOrder: task.sort_order, clientVisible: task.client_visible, requiresCompletion: task.requires_completion, formSchema: task.form_schema as FormField[] | null, feedbackEnabled: task.feedback_enabled, feedbackDelayValue: task.feedback_delay_value, feedbackDelayUnit: task.feedback_delay_unit })),
  };
}

const MESSAGE_PAGE_SIZE = 50;
// Bounded window used only to show a preview and a last-activity time per thread.
// Unread counts never come from this sample; they come from read receipts.
const CONVERSATION_ACTIVITY_SAMPLE = 400;

function mapMessages(rows: Array<{ id: string; sender_id: string; body: string; attachment_url: string | null; created_at: string; sender: { full_name: string; role: string } | { full_name: string; role: string }[] | null }>): ConversationMessage[] {
  return rows.map((row) => {
    const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
    return { id: row.id, senderId: row.sender_id, senderName: sender?.full_name || 'Member', senderRole: sender?.role === 'admin' ? 'admin' : 'client', body: row.body, attachmentUrl: row.attachment_url, createdAt: row.created_at };
  });
}

export async function getTaskMessages(taskId: string, before?: string): Promise<ConversationMessage[]> {
  if (isDemoMode()) return demoTaskMessages;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  let query = supabase.from('task_messages').select('id,sender_id,body,attachment_url,created_at,sender:users(full_name,role)').eq('task_id', taskId).eq('message_type', 'user').order('created_at', { ascending: false }).limit(MESSAGE_PAGE_SIZE);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw new Error('Unable to load task conversation.');
  return mapMessages((data || []).reverse());
}

export async function getProjectMessages(projectId: string, before?: string): Promise<ConversationMessage[]> {
  if (isDemoMode()) return demoProjectMessages;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  let query = supabase.from('project_messages').select('id,sender_id,body,attachment_url,created_at,sender:users(full_name,role)').eq('project_id', projectId).eq('message_type', 'user').order('created_at', { ascending: false }).limit(MESSAGE_PAGE_SIZE);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw new Error('Unable to load project conversation.');
  return mapMessages((data || []).reverse());
}

export async function getTaskActivity(taskId: string): Promise<ActivityEvent[]> {
  if (isDemoMode()) return demoActivity;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('task_activity').select('id,event_type,body,created_at,actor:users(full_name)').eq('task_id', taskId).order('created_at');
  if (error) throw new Error('Unable to load task activity.');
  return (data || []).map((row) => {
    const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
    return { id: row.id, actorName: actor?.full_name || 'System', eventType: row.event_type, body: row.body, createdAt: row.created_at };
  });
}

export async function getTaskSubmission(taskId: string): Promise<FeedbackSubmission | null> {
  if (isDemoMode()) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: row, error } = await supabase.from('form_submissions').select('id,answers,submitted_at,submitter:users(full_name)').eq('task_id', taskId).order('submitted_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !row) return null;
  const submitter = Array.isArray(row.submitter) ? row.submitter[0] : row.submitter;
  return { id: row.id, answers: row.answers as Record<string, string | string[]>, submittedAt: row.submitted_at, submittedByName: submitter?.full_name || 'Client' };
}

export async function getNotifications(limit = 30, knownViewer?: Viewer | null): Promise<NotificationRecord[]> {
  if (isDemoMode()) return demoNotifications;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const viewer = knownViewer ?? await getViewer();
  if (!viewer) return [];
  const { data, error } = await supabase.from('notifications').select('id,type,title,body,read_at,created_at,target_url').eq('user_id', viewer.id).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error('Unable to load notifications.');
  return (data || []).map((row) => ({ id: row.id, type: row.type, title: row.title, body: row.body, readAt: row.read_at, createdAt: row.created_at, targetUrl: row.target_url || '/'}));
}

export async function getUnreadCounts(knownViewer?: Viewer | null): Promise<{ messages: number; notifications: number }> {
  return knownViewer ? readUnreadCounts() : getUnreadCountsForRequest();
}

// get_unread_counts() returns both badges in one round trip. It is scoped by
// auth.uid() inside the function, so the resolved viewer is only an
// authentication gate here, not the filter.
async function readUnreadCounts(): Promise<{ messages: number; notifications: number }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { messages: 0, notifications: 0 };
  const { data, error } = await supabase.rpc('get_unread_counts');
  if (error) throw new Error('Unable to load unread counts. Apply the latest Supabase migration.');
  const row = Array.isArray(data) ? data[0] : data;
  return { messages: Number(row?.unread_messages || 0), notifications: Number(row?.unread_notifications || 0) };
}

const getUnreadCountsForRequest = cache(async (): Promise<{ messages: number; notifications: number }> => {
  if (isDemoMode()) {
    const notifications = demoNotifications.filter((item) => !item.readAt).length;
    return { messages: demoTaskMessages.length + demoProjectMessages.length, notifications };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { messages: 0, notifications: 0 };
  const viewer = await getViewer();
  if (!viewer) return { messages: 0, notifications: 0 };
  return readUnreadCounts();
});

export async function getClientProjects(activeOnly = false): Promise<ProjectSummary[]> {
  if (isDemoMode()) return activeOnly ? [demoProjects[0]].filter((project) => project.status === 'active') : [demoProjects[0]];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const viewer = await getViewer();
  if (!viewer || viewer.role !== 'client') return [];
  let query = supabase.from('projects').select('id,project_name,status,created_at,owner:users!projects_owner_id_fkey(full_name,admin_settings(display_name)),project_clients!inner(is_primary,client:clients!inner(id,full_name,auth_user_id,status)),project_tasks(status,archived_at)').eq('project_clients.client.auth_user_id', viewer.id).neq('project_clients.client.status', 'disabled');
  if (activeOnly) query = query.eq('status', 'active');
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw new Error('Unable to load your projects.');
  const projects = (data || []).map((row) => {
    const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
    const settings = Array.isArray(owner?.admin_settings) ? owner?.admin_settings[0] : owner?.admin_settings;
    // The embedded membership is filtered to this viewer, so is_primary here is
    // this client's own flag rather than some other client's on a shared project.
    const link = row.project_clients?.[0];
    const client = Array.isArray(link?.client) ? link.client[0] : link?.client;
    const tasks = (row.project_tasks || []).filter((task) => !task.archived_at);
    return { id: row.id, projectName: row.project_name, ownerName: settings?.display_name || owner?.full_name || 'Admin', clientName: client?.full_name || '', clientId: client?.id || '', status: row.status, completedTasks: tasks.filter((task) => task.status === 'completed').length, totalTasks: tasks.length, createdAt: row.created_at, isPrimary: Boolean(link?.is_primary) };
  });
  // One shared definition of the default project, matching get_portal_bootstrap().
  return orderClientProjects(projects.map((project) => ({ ...project, createdAt: project.createdAt })));
}

/**
 * Every conversation the client can open, with the unread counts that make up
 * the navigation badge.
 *
 * The badge counts unread project messages *and* unread task comments across
 * all of the client's projects, so the inbox has to inventory both. Unread
 * counts are exact: they come from this viewer's own read receipts, joined to
 * the messages themselves so row level security drops anything the client is
 * not entitled to — the same set `get_unread_message_count()` counts.
 */
export async function getClientConversationThreads(): Promise<ConversationThread[]> {
  if (isDemoMode()) return [];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const viewer = await getViewer();
  if (!viewer || viewer.role !== 'client') return [];

  // Each read is already authorized by the user's session/RLS. Empty inner
  // embeds retain explicit client filters without serially acquiring ID lists.
  const [projects, tasks, receiptResult, projectActivity, taskActivity] = await Promise.all([
    getClientProjects(),
    getClientTaskList(),
    supabase.from('message_read_receipts')
      .select('project_message:project_messages(project_id,message_type),task_message:task_messages(task_id,message_type)')
      .is('read_at', null),
    supabase.from('project_messages')
      .select('project_id,body,created_at,sender:users(full_name),project:projects!inner(project_clients!inner(client:clients!inner()))')
      .eq('project.project_clients.client.auth_user_id', viewer.id)
      .neq('project.project_clients.client.status', 'disabled')
      .eq('message_type', 'user').order('created_at', { ascending: false }).limit(CONVERSATION_ACTIVITY_SAMPLE),
    supabase.from('task_messages')
      .select('task_id,body,created_at,sender:users(full_name),task:project_tasks!inner(assignee:clients!inner())')
      .eq('task.assignee.auth_user_id', viewer.id).neq('task.assignee.status', 'disabled')
      .eq('task.client_visible', true).neq('task.status', 'draft').is('task.archived_at', null)
      .eq('message_type', 'user').order('created_at', { ascending: false }).limit(CONVERSATION_ACTIVITY_SAMPLE),
  ]);
  if (receiptResult.error || projectActivity.error || taskActivity.error) throw new Error('Unable to load your conversations.');
  if (!projects.length) return [];
  const projectNameById = new Map(projects.map((project) => [project.id, project.projectName]));

  const unreadByProject = new Map<string, number>();
  const unreadByTask = new Map<string, number>();
  for (const receipt of receiptResult.data || []) {
    const projectMessage = Array.isArray(receipt.project_message) ? receipt.project_message[0] : receipt.project_message;
    const taskMessage = Array.isArray(receipt.task_message) ? receipt.task_message[0] : receipt.task_message;
    // A receipt whose message is null was filtered out by row level security, and
    // a non-user message is not counted by the badge either.
    if (projectMessage?.project_id && projectMessage.message_type === 'user') {
      unreadByProject.set(projectMessage.project_id, (unreadByProject.get(projectMessage.project_id) || 0) + 1);
    } else if (taskMessage?.task_id && taskMessage.message_type === 'user') {
      unreadByTask.set(taskMessage.task_id, (unreadByTask.get(taskMessage.task_id) || 0) + 1);
    }
  }

  // Previews are a convenience, not the source of truth: they come from a bounded
  // recent window, so a very long-running conversation may list without one while
  // its unread count stays exact.
  const latest = <T extends { body: string; created_at: string; sender?: { full_name: string } | { full_name: string }[] | null }>(rows: T[] | null, key: (row: T) => string) => {
    const map = new Map<string, { body: string; createdAt: string; senderName: string | null }>();
    for (const row of rows || []) {
      if (map.has(key(row))) continue;
      const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
      map.set(key(row), { body: row.body, createdAt: row.created_at, senderName: sender?.full_name || null });
    }
    return map;
  };
  const projectLatest = latest(projectActivity.data, (row) => row.project_id);
  const taskLatest = latest(taskActivity.data as Array<{ task_id: string; body: string; created_at: string; sender?: { full_name: string } | { full_name: string }[] | null }> | null, (row) => row.task_id);

  const projectThreads: ConversationThread[] = projects.map((project) => ({
    kind: 'project',
    id: project.id,
    title: project.projectName,
    projectId: project.id,
    projectName: project.projectName,
    unreadCount: unreadByProject.get(project.id) || 0,
    lastMessageAt: projectLatest.get(project.id)?.createdAt || null,
    lastMessagePreview: projectLatest.get(project.id)?.body || null,
    lastSenderName: projectLatest.get(project.id)?.senderName || null,
  }));

  // A lead only earns an inbox row once it has a conversation, so an untouched
  // task list does not bury the project threads.
  const taskThreads: ConversationThread[] = tasks
    .filter((task) => (unreadByTask.get(task.id) || 0) > 0 || taskLatest.has(task.id))
    .map((task) => ({
      kind: 'task' as const,
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      projectName: projectNameById.get(task.projectId) || task.projectName,
      unreadCount: unreadByTask.get(task.id) || 0,
      lastMessageAt: taskLatest.get(task.id)?.createdAt || null,
      lastMessagePreview: taskLatest.get(task.id)?.body || null,
      lastSenderName: taskLatest.get(task.id)?.senderName || null,
    }))
    .sort((a, b) => (b.unreadCount - a.unreadCount) || (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));

  return [...projectThreads, ...taskThreads];
}

export async function getClientTaskList(): Promise<ClientTaskSummary[]> {
  if (isDemoMode()) return demoTasks.filter((task) => task.clientVisible && task.status !== 'draft').map((task) => ({ id: task.id, projectId: task.projectId, projectName: demoProjects.find((project) => project.id === task.projectId)?.projectName || 'Project', title: task.title, status: task.status, requiresCompletion: task.requiresCompletion, feedbackState: task.feedbackState, feedbackSubmittedAt: task.feedbackSubmittedAt }));
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const viewer = await getViewer();
  if (!viewer || viewer.role !== 'client') return [];
  const { data, error } = await supabase.from('project_tasks').select('id,project_id,title,status,requires_completion,feedback_state,feedback_submitted_at,project:projects(project_name),assignee:clients!inner()').eq('assignee.auth_user_id', viewer.id).neq('assignee.status', 'disabled').is('archived_at', null).eq('client_visible', true).neq('status', 'draft').order('created_at');
  if (error) throw new Error('Unable to load your tasks.');
  return (data || []).map((row) => {
    const project = Array.isArray(row.project) ? row.project[0] : row.project;
    return { id: row.id, projectId: row.project_id, projectName: project?.project_name || 'Project', title: row.title, status: row.status === 'completed' ? 'completed' : 'active', requiresCompletion: row.requires_completion, feedbackState: feedbackState(row.feedback_state, row.feedback_state !== 'not_configured'), feedbackSubmittedAt: row.feedback_submitted_at };
  });
}

export async function getAdminMessageInbox(): Promise<AdminConversationSummary[]> {
  if (isDemoMode()) return [
    { kind: 'task', resourceId: demoTasks[0].id, projectId: demoProjects[0].id, projectName: demoProjects[0].projectName, taskTitle: demoTasks[0].title, senderName: demoTaskMessages.at(-1)?.senderName || demoClient.fullName, preview: demoTaskMessages.at(-1)?.body || '', lastMessageAt: demoTaskMessages.at(-1)?.createdAt || new Date(0).toISOString(), unreadCount: 1, href: `/admin/projects/${demoProjects[0].id}/tasks/${demoTasks[0].id}#conversation` },
    { kind: 'project', resourceId: demoProjects[0].id, projectId: demoProjects[0].id, projectName: demoProjects[0].projectName, taskTitle: null, senderName: demoProjectMessages.at(-1)?.senderName || demoClient.fullName, preview: demoProjectMessages.at(-1)?.body || '', lastMessageAt: demoProjectMessages.at(-1)?.createdAt || new Date(0).toISOString(), unreadCount: 1, href: `/admin/projects/${demoProjects[0].id}/chat` },
  ];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const [projectResult, taskResult, unreadResult] = await Promise.all([
    supabase.from('project_messages').select('project_id,body,created_at,sender:users(full_name),project:projects(project_name)').eq('message_type', 'user').order('created_at', { ascending: false }).limit(CONVERSATION_ACTIVITY_SAMPLE),
    supabase.from('task_messages').select('task_id,body,created_at,sender:users(full_name),task:project_tasks!inner(title,project_id,archived_at,project:projects(project_name))').eq('message_type', 'user').order('created_at', { ascending: false }).limit(CONVERSATION_ACTIVITY_SAMPLE),
    supabase.from('message_read_receipts').select('project_message:project_messages(project_id,message_type,body,created_at,sender:users(full_name),project:projects(project_name)),task_message:task_messages(task_id,message_type,body,created_at,sender:users(full_name),task:project_tasks!inner(title,project_id,archived_at,project:projects(project_name)))').is('read_at', null),
  ]);
  if (projectResult.error || taskResult.error || unreadResult.error) throw new Error('Unable to load message inbox.');
  const projectUnreadCounts = new Map<string, number>();
  const taskUnreadCounts = new Map<string, number>();
  const unreadProjectLatest = new Map<string, AdminConversationSummary>();
  const unreadTaskLatest = new Map<string, AdminConversationSummary>();
  for (const receipt of unreadResult.data || []) {
    const projectMessage = Array.isArray(receipt.project_message) ? receipt.project_message[0] : receipt.project_message;
    const taskMessage = Array.isArray(receipt.task_message) ? receipt.task_message[0] : receipt.task_message;
    if (projectMessage?.project_id && projectMessage.message_type === 'user') {
      projectUnreadCounts.set(projectMessage.project_id, (projectUnreadCounts.get(projectMessage.project_id) || 0) + 1);
      const current = unreadProjectLatest.get(projectMessage.project_id);
      if (!current || Date.parse(projectMessage.created_at) > Date.parse(current.lastMessageAt)) {
        const sender = Array.isArray(projectMessage.sender) ? projectMessage.sender[0] : projectMessage.sender;
        const project = Array.isArray(projectMessage.project) ? projectMessage.project[0] : projectMessage.project;
        unreadProjectLatest.set(projectMessage.project_id, { kind: 'project', resourceId: projectMessage.project_id, projectId: projectMessage.project_id, projectName: project?.project_name || 'Project', taskTitle: null, senderName: sender?.full_name || 'Member', preview: projectMessage.body, lastMessageAt: projectMessage.created_at, unreadCount: 0, href: `/admin/projects/${projectMessage.project_id}/chat` });
      }
    } else if (taskMessage?.task_id && taskMessage.message_type === 'user') {
      taskUnreadCounts.set(taskMessage.task_id, (taskUnreadCounts.get(taskMessage.task_id) || 0) + 1);
      const task = Array.isArray(taskMessage.task) ? taskMessage.task[0] : taskMessage.task;
      if (task && !task.archived_at) {
        const current = unreadTaskLatest.get(taskMessage.task_id);
        if (!current || Date.parse(taskMessage.created_at) > Date.parse(current.lastMessageAt)) {
          const sender = Array.isArray(taskMessage.sender) ? taskMessage.sender[0] : taskMessage.sender;
          const project = Array.isArray(task.project) ? task.project[0] : task.project;
          unreadTaskLatest.set(taskMessage.task_id, { kind: 'task', resourceId: taskMessage.task_id, projectId: task.project_id, projectName: project?.project_name || 'Project', taskTitle: task.title || 'Task', senderName: sender?.full_name || 'Member', preview: taskMessage.body, lastMessageAt: taskMessage.created_at, unreadCount: 0, href: `/admin/projects/${task.project_id}/tasks/${taskMessage.task_id}#conversation` });
        }
      }
    }
  }
  const items = new Map<string, AdminConversationSummary>();
  for (const row of projectResult.data || []) {
    const key = `project:${row.project_id}`;
    if (items.has(key)) continue;
    const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
    const project = Array.isArray(row.project) ? row.project[0] : row.project;
    items.set(key, { kind: 'project', resourceId: row.project_id, projectId: row.project_id, projectName: project?.project_name || 'Project', taskTitle: null, senderName: sender?.full_name || 'Member', preview: row.body, lastMessageAt: row.created_at, unreadCount: projectUnreadCounts.get(row.project_id) || 0, href: `/admin/projects/${row.project_id}/chat` });
  }
  for (const row of taskResult.data || []) {
    const key = `task:${row.task_id}`;
    if (items.has(key)) continue;
    const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
    const task = Array.isArray(row.task) ? row.task[0] : row.task;
    if (!task || task.archived_at) continue;
    const project = Array.isArray(task?.project) ? task.project[0] : task?.project;
    items.set(key, { kind: 'task', resourceId: row.task_id, projectId: task?.project_id || '', projectName: project?.project_name || 'Project', taskTitle: task?.title || 'Task', senderName: sender?.full_name || 'Member', preview: row.body, lastMessageAt: row.created_at, unreadCount: taskUnreadCounts.get(row.task_id) || 0, href: `/admin/projects/${task?.project_id}/tasks/${row.task_id}#conversation` });
  }
  for (const summary of [...unreadProjectLatest.values(), ...unreadTaskLatest.values()]) {
    const key = `${summary.kind}:${summary.resourceId}`;
    if (!items.has(key)) items.set(key, { ...summary, unreadCount: summary.kind === 'project' ? projectUnreadCounts.get(summary.resourceId) || 0 : taskUnreadCounts.get(summary.resourceId) || 0 });
  }
  return [...items.values()].sort((a, b) => Number(b.unreadCount > 0) - Number(a.unreadCount > 0) || Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
}
