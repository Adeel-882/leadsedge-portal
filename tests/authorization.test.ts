import { describe, expect, it } from 'vitest';
import { canClientAccessTask, canClientCompleteTask, projectProgress } from '@/lib/authorization';
import { demoClient, demoTasks } from '@/lib/demo-data';

describe('client task authorization', () => {
  it('allows an assigned client to open an active visible task', () => {
    expect(canClientAccessTask(demoTasks[0], demoClient.id)).toBe(true);
  });

  it('rejects a different client and draft tasks', () => {
    expect(canClientAccessTask(demoTasks[0], '00000000-0000-4000-8000-999999999999')).toBe(false);
    expect(canClientAccessTask({ ...demoTasks[0], status: 'draft' }, demoClient.id)).toBe(false);
  });

  it('only permits completion when all task rules are satisfied', () => {
    expect(canClientCompleteTask(demoTasks[0], demoClient.id)).toBe(true);
    expect(canClientCompleteTask({ ...demoTasks[0], requiresCompletion: false }, demoClient.id)).toBe(false);
    expect(canClientCompleteTask({ ...demoTasks[0], status: 'completed' }, demoClient.id)).toBe(false);
  });
});

describe('task and project helpers', () => {

  it('keeps progress within zero and one hundred', () => {
    expect(projectProgress(1, 4)).toBe(25);
    expect(projectProgress(0, 0)).toBe(0);
    expect(projectProgress(8, 4)).toBe(100);
  });
});
