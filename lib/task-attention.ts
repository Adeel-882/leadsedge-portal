import type { ClientTaskSummary } from './types';

/** Input is the server-authorized, visible, unarchived task inventory. */
export function countTaskAttention(tasks: ClientTaskSummary[]) {
  return tasks.filter(task => task.status === 'active' && task.requiresCompletion).length;
}
