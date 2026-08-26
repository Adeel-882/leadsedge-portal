import sanitizeHtml from 'sanitize-html';
import { demoActivity, demoClient, demoNotifications, demoProjectMessages, demoProjects, demoTaskMessages, demoTasks, demoTemplates } from './demo-data';
import { isDemoMode } from './env';
import { createSupabaseServerClient } from './supabase/server';
import type { ActivityEvent, ClientSummary, ConversationMessage, FormField, NotificationRecord, ProjectSummary, TaskRecord, TemplateSummary, TemplateTaskRecord } from './types';

const safeRichTextOptions: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h2', 'h3', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) },
};

export function sanitizeTaskDescription(value: string) {
  return sanitizeHtml(value, safeRichTextOptions);
}

export async function getAdminProjects(): Promise<ProjectSummary[]> {
  if (isDemoMode()) return demoProjects;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('id,project_name,status,created_at,owner:users!projects_owner_id_fkey(full_name,admin_settings(display_name)),project_clients(is_primary,client:clients(id,full_name)),project_tasks(status)')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Unable to load projects.');
  return (data || []).map((row) => {
    const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
    const settings = owner?.admin_settings;
    const firstSettings = Array.isArray(settings) ? settings[0] : settings;
    const links = row.project_clients || [];
    const primaryLink = links.find((link) => link.is_primary) || links[0];
    const client = Array.isArray(primaryLink?.client) ? primaryLink.client[0] : primaryLink?.client;
    const tasks = row.project_tasks || [];
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
    };
  });
}

export async function getProject(projectId: string): Promise<ProjectSummary | null> {
  return (await getAdminProjects()).find((project) => project.id === projectId) || null;
}

export async function getProjectClients(projectId: string): Promise<ClientSummary[]> {
  if (isDemoMode()) return projectId === demoProjects[0].id ? [demoClient] : [];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('project_clients').select('client:clients(id,auth_user_id,full_name,email,company,status)').eq('project_id', projectId);
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
  let query = supabase.from('project_tasks').select('id,project_id,title,description,task_type,status,client_visible,requires_completion,assignee_id,due_at,activated_at,completed_at,created_at,form_schema,assignee:clients(full_name)').eq('project_id', projectId).order('created_at');
  if (clientOnly) query = query.eq('client_visible', true).neq('status', 'draft');
  const { data, error } = await query;
  if (error) throw new Error('Unable to load tasks.');
  return (data || []).map((row) => {
    const assignee = Array.isArray(row.assignee) ? row.assignee[0] : row.assignee;
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      description: sanitizeTaskDescription(row.description),
      taskType: row.task_type,
      status: row.status,
      clientVisible: row.client_visible,
      requiresCompletion: row.requires_completion,
      assigneeId: row.assignee_id,
      assigneeName: assignee?.full_name || null,
      dueAt: row.due_at,
      activatedAt: row.activated_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      formSchema: row.form_schema as FormField[] | null,
    };
  });
}

export async function getTask(taskId: string): Promise<TaskRecord | null> {
  if (isDemoMode()) return demoTasks.find((task) => task.id === taskId) || null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: row, error } = await supabase.from('project_tasks').select('id,project_id,title,description,task_type,status,client_visible,requires_completion,assignee_id,due_at,activated_at,completed_at,created_at,form_schema,assignee:clients(full_name)').eq('id', taskId).maybeSingle();
  if (error || !row) return null;
  const assignee = Array.isArray(row.assignee) ? row.assignee[0] : row.assignee;
  return { id: row.id, projectId: row.project_id, title: row.title, description: sanitizeTaskDescription(row.description), taskType: row.task_type, status: row.status, clientVisible: row.client_visible, requiresCompletion: row.requires_completion, assigneeId: row.assignee_id, assigneeName: assignee?.full_name || null, dueAt: row.due_at, activatedAt: row.activated_at, completedAt: row.completed_at, createdAt: row.created_at, formSchema: row.form_schema as FormField[] | null };
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

export async function getTemplateDetail(templateId: string): Promise<{ template: TemplateSummary; tasks: TemplateTaskRecord[] } | null> {
  if (isDemoMode()) {
    const template = demoTemplates.find((item) => item.id === templateId);
    if (!template) return null;
    return { template, tasks: demoTasks.map((task, index) => ({ id: `00000000-0000-4000-8000-00000000031${index}`, templateId, title: task.title.replace(' - Adeel Ahmed', ''), description: task.description, taskType: task.taskType, sortOrder: index + 1, clientVisible: task.clientVisible, requiresCompletion: task.requiresCompletion, formSchema: task.formSchema })) };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: row, error } = await supabase.from('templates').select('id,name,description,archived_at,updated_at,template_tasks(id,template_id,title,description,task_type,sort_order,client_visible,requires_completion,form_schema)').eq('id', templateId).maybeSingle();
  if (error || !row) return null;
  return {
    template: { id: row.id, name: row.name, description: row.description, archivedAt: row.archived_at, updatedAt: row.updated_at, taskCount: row.template_tasks?.length || 0 },
    tasks: (row.template_tasks || []).sort((a, b) => a.sort_order - b.sort_order).map((task) => ({ id: task.id, templateId: task.template_id, title: task.title, description: sanitizeTaskDescription(task.description), taskType: task.task_type, sortOrder: task.sort_order, clientVisible: task.client_visible, requiresCompletion: task.requires_completion, formSchema: task.form_schema as FormField[] | null })),
  };
}

export async function getTaskMessages(taskId: string): Promise<ConversationMessage[]> {
  if (isDemoMode()) return demoTaskMessages;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('task_messages').select('id,sender_id,body,attachment_url,created_at,sender:users(full_name,role)').eq('task_id', taskId).order('created_at');
  if (error) throw new Error('Unable to load task conversation.');
  return (data || []).map((row) => {
    const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
    return { id: row.id, senderId: row.sender_id, senderName: sender?.full_name || 'Member', senderRole: sender?.role || 'client', body: row.body, attachmentUrl: row.attachment_url, createdAt: row.created_at };
  });
}

export async function getProjectMessages(projectId: string): Promise<ConversationMessage[]> {
  if (isDemoMode()) return demoProjectMessages;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('project_messages').select('id,sender_id,body,attachment_url,created_at,sender:users(full_name,role)').eq('project_id', projectId).order('created_at');
  if (error) throw new Error('Unable to load project conversation.');
  return (data || []).map((row) => {
    const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
    return { id: row.id, senderId: row.sender_id, senderName: sender?.full_name || 'Member', senderRole: sender?.role || 'client', body: row.body, attachmentUrl: row.attachment_url, createdAt: row.created_at };
  });
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

export async function getNotifications(): Promise<NotificationRecord[]> {
  if (isDemoMode()) return demoNotifications;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('notifications').select('id,type,title,body,read_at,created_at').order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error('Unable to load notifications.');
  return (data || []).map((row) => ({ id: row.id, type: row.type, title: row.title, body: row.body, readAt: row.read_at, createdAt: row.created_at }));
}

export async function getClientProjects(): Promise<ProjectSummary[]> {
  if (isDemoMode()) return [demoProjects[0]];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('projects').select('id,project_name,status,created_at,owner:users!projects_owner_id_fkey(full_name,admin_settings(display_name)),project_clients!inner(client:clients!inner(id,full_name,auth_user_id)),project_tasks(status)').order('created_at', { ascending: false });
  if (error) throw new Error('Unable to load your projects.');
  return (data || []).map((row) => {
    const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
    const settings = Array.isArray(owner?.admin_settings) ? owner?.admin_settings[0] : owner?.admin_settings;
    const link = row.project_clients?.[0];
    const client = Array.isArray(link?.client) ? link.client[0] : link?.client;
    const tasks = row.project_tasks || [];
    return { id: row.id, projectName: row.project_name, ownerName: settings?.display_name || owner?.full_name || 'Admin', clientName: client?.full_name || '', clientId: client?.id || '', status: row.status, completedTasks: tasks.filter((task) => task.status === 'completed').length, totalTasks: tasks.length, createdAt: row.created_at };
  });
}
