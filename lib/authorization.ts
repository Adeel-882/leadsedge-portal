import type { TaskRecord } from './types';

export function canClientAccessTask(task: TaskRecord, clientId: string) {
  return task.clientVisible && task.assigneeId === clientId && task.status !== 'draft';
}

export function canClientCompleteTask(task: TaskRecord, clientId: string) {
  return canClientAccessTask(task, clientId) && task.status === 'active' && task.requiresCompletion;
}

export function projectProgress(completedTasks: number, totalTasks: number) {
  if (totalTasks <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((completedTasks / totalTasks) * 100)));
}
