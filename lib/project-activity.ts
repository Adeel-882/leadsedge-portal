import { requireApiRole } from './auth';
import { createSupabaseServerClient } from './supabase/server';

export type ProjectActivityItem = { id: string; title: string; description: string; createdAt: string };
export type ProjectActivityPage = { items: ProjectActivityItem[]; next: string | null };
const limit = 20;
const one = <T>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;
const titles: Record<string, string> = {
  'task.created': 'Task created', 'task.imported': 'Workflow imported', 'task.assigned': 'Task assigned',
  'task.active': 'Task ready', 'task.completed': 'Task completed', 'lead.completed': 'Lead completed',
  'task.comment': 'New task comment', 'feedback.requested': 'Feedback requested',
  'feedback.scheduled': 'Feedback scheduled', 'feedback.submitted': 'Feedback submitted',
  'feedback.cancelled': 'Feedback cancelled', 'meeting.booked': 'Meeting scheduled',
  'meeting.cancelled': 'Meeting cancelled', 'task.draft': 'Task moved to draft',
};

export function activityPresentation(event: string, body: string, actor: string | null, task?: string) {
  const name = actor || 'A member';
  const subject = task || 'the task';
  const description = event === 'task.comment' ? `${name} commented on ${subject}.`
    : ['lead.completed', 'task.completed'].includes(event) ? `${name} completed ${subject}.`
      : event === 'task.imported' ? `${name} imported ${subject}.`
        : event === 'task.created' ? `${name} created ${subject}.`
          : event === 'task.assigned' ? `${name} updated the assignment for ${subject}.`
            : event === 'task.active' ? `${name} made ${subject} available.`
              : event === 'feedback.submitted' ? `${name} submitted feedback for ${subject}.`
                : event.startsWith('feedback.') ? `${titles[event] || 'Feedback updated'} for ${subject}.`
                  : body;
  return { title: titles[event] || 'Project update', description };
}

export function activityPage(items: ProjectActivityItem[]): ProjectActivityPage {
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const selected = sorted.slice(0, limit);
  const last = selected.at(-1);
  return { items: selected, next: sorted.length > limit && last ? `${last.createdAt}|${last.id}` : null };
}

/** Three bounded sources, joined actor/task context; never one query per event. */
export async function getProjectActivity(projectId: string, cursor?: string | null): Promise<ProjectActivityPage> {
  if (!await requireApiRole('admin')) throw new Error('Administrator access required.');
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error('Activity unavailable.');
  const { data: project, error: projectError } = await supabase.from('projects').select('project_name').eq('id', projectId).maybeSingle();
  if (projectError || !project) throw new Error('Project unavailable.');
  let before: { time: string; id: string } | null = null;
  if (cursor) {
    const [time, id, extra] = cursor.split('|');
    if (extra || !/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(time || '') || !Number.isFinite(Date.parse(time)) || !/^[0-9a-f-]{36}$/i.test(id || '')) throw new Error('Invalid activity cursor.');
    before = { time, id };
  }
  const finish = <T extends { order: (...args: [string, { ascending: boolean }]) => T; limit: (n: number) => T; or: (s: string) => T }>(query: T) => {
    if (before) query = query.or(`created_at.lt.${before.time},and(created_at.eq.${before.time},id.lt.${before.id})`);
    return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  };
  const [tasks, events, messages] = await Promise.all([
    finish(supabase.from('task_activity').select('id,event_type,body,created_at,actor:users(full_name),task:project_tasks!inner(project_id,title)').eq('task.project_id', projectId)),
    finish(supabase.from('project_activity').select('id,event_type,body,created_at,actor:users(full_name)').eq('project_id', projectId).neq('event_type', 'fixture.activity')),
    finish(supabase.from('project_messages').select('id,created_at,sender:users(full_name)').eq('project_id', projectId).eq('message_type', 'user')),
  ]);
  if (tasks.error || events.error || messages.error) throw new Error('Activity unavailable.');
  return activityPage([
    ...(tasks.data || []).map(row => ({ id: row.id, createdAt: row.created_at, ...activityPresentation(row.event_type, row.body, one(row.actor)?.full_name || null, one(row.task)?.title) })),
    ...(events.data || []).map(row => ({ id: row.id, createdAt: row.created_at, ...activityPresentation(row.event_type, row.body, one(row.actor)?.full_name || null) })),
    ...(messages.data || []).map(row => ({ id: row.id, createdAt: row.created_at, title: 'Project message', description: `${one(row.sender)?.full_name || 'A member'} sent a message in ${project.project_name}.` })),
  ]);
}
