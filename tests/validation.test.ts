import { describe, expect, it } from 'vitest';
import { messageSchema, projectCreateSchema, taskUpdateSchema } from '@/lib/validation';

describe('server input validation', () => {
  it('accepts a valid new-client project and rejects malformed email', () => {
    expect(projectCreateSchema.safeParse({ projectName: 'Adeel Ahmed', client: { mode: 'new', fullName: 'Adeel Ahmed', email: 'adeel@example.com', company: '' } }).success).toBe(true);
    expect(projectCreateSchema.safeParse({ projectName: 'Adeel Ahmed', client: { mode: 'new', fullName: 'Adeel Ahmed', email: 'not-an-email' } }).success).toBe(false);
  });

  it('rejects empty and oversized messages', () => {
    expect(messageSchema.safeParse({ body: 'Hello' }).success).toBe(true);
    expect(messageSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(messageSchema.safeParse({ body: 'x'.repeat(5001) }).success).toBe(false);
  });

  it('requires valid task state and dates', () => {
    expect(taskUpdateSchema.safeParse({ title: 'Lead Assignment', description: '<p>Details</p>', clientVisible: true, requiresCompletion: true, assigneeId: null, status: 'active', dueAt: null }).success).toBe(true);
    expect(taskUpdateSchema.safeParse({ title: 'A', description: '', clientVisible: true, requiresCompletion: true, assigneeId: null, status: 'open', dueAt: 'tomorrow' }).success).toBe(false);
  });
});
