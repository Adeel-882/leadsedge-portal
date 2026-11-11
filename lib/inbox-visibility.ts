import { z } from 'zod';

export const inboxVisibilitySchema = z.object({
  projectIds: z.array(z.string().uuid()).max(100),
  taskIds: z.array(z.string().uuid()).max(100),
  hide: z.boolean(),
}).strict().refine(value => value.projectIds.length + value.taskIds.length >= 1 && value.projectIds.length + value.taskIds.length <= 100);

export function inboxRemovalEnabled() {
  return process.env.LEADSEDGE_INBOX_REMOVAL_ENABLED === 'true';
}

export function visibilityKeys(rows: { project_id: string | null; task_id: string | null }[]) {
  return new Set(rows.map(row => row.project_id ? `project:${row.project_id}` : `task:${row.task_id}`));
}

export function visibilityRequest(keys: string[], hide = true) {
  return inboxVisibilitySchema.parse({
    projectIds: [...new Set(keys.filter(key => key.startsWith('project:')).map(key => key.slice(8)))],
    taskIds: [...new Set(keys.filter(key => key.startsWith('task:')).map(key => key.slice(5)))], hide,
  });
}
