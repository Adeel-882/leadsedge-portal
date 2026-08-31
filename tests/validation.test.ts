import { describe, expect, it } from 'vitest';
import { availabilitySchema, feedbackConfigurationSchema, meetingCreateSchema, messageSchema, projectCreateSchema, projectDeleteSchema, taskUpdateSchema } from '@/lib/validation';
import { leadFeedbackForm } from '@/lib/demo-data';

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

  it('requires a valid single-task feedback configuration without a due date', () => {
    const valid = { title: 'Lead Assignment', description: '<p>Details</p>', clientVisible: true, requiresCompletion: true, assigneeId: null, status: 'active', feedback: { enabled: true, delayValue: 1, delayUnit: 'days', formSchema: leadFeedbackForm } };
    expect(taskUpdateSchema.safeParse(valid).success).toBe(true);
    expect(taskUpdateSchema.safeParse({ ...valid, feedback: { ...valid.feedback, delayValue: 11 } }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ ...valid, status: 'open' }).success).toBe(false);
    expect('dueAt' in taskUpdateSchema.parse(valid)).toBe(false);
  });

  it('supports the complete Phase 1 feedback field set', () => {
    expect(feedbackConfigurationSchema.safeParse({ enabled: true, delayValue: 2, delayUnit: 'hours', formSchema: leadFeedbackForm }).success).toBe(true);
    expect(new Set(leadFeedbackForm.map((field) => field.type))).toEqual(new Set(['text', 'textarea', 'radio', 'select']));
  });

  it('requires explicit project deletion intent', () => {
    expect(projectDeleteSchema.safeParse({ projectName: 'Temporary Project', deleteClient: false }).success).toBe(true);
    expect(projectDeleteSchema.safeParse({ projectName: '', deleteClient: true }).success).toBe(false);
  });

  it('validates availability and meeting booking inputs', () => {
    const rules = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, enabled: weekday > 0 && weekday < 6, startTime: '09:00', endTime: '17:00' }));
    expect(availabilitySchema.safeParse({ timezone: 'Asia/Karachi', meetingDurationMinutes: 30, bufferMinutes: 15, minimumNoticeMinutes: 120, maximumAdvanceDays: 60, rules }).success).toBe(true);
    expect(availabilitySchema.safeParse({ timezone: 'UTC', meetingDurationMinutes: 17, bufferMinutes: 15, minimumNoticeMinutes: 0, maximumAdvanceDays: 60, rules }).success).toBe(false);
    expect(meetingCreateSchema.safeParse({ projectId: 'd11678b4-e15c-4d30-bef5-f14acc20dc9c', startAt: '2026-08-30T10:00:00+05:00', timezone: 'Asia/Karachi', title: 'Project meeting', description: '' }).success).toBe(true);
  });
});
