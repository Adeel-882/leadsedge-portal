import { z } from 'zod';
import { FEEDBACK_DELAY_MAX, FEEDBACK_DELAY_MIN } from './scheduling';

export const projectCreateSchema = z.object({
  projectName: z.string().trim().min(2).max(120),
  client: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('new'), fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(255), company: z.string().trim().max(160).optional(), title: z.string().trim().max(160).optional(), phone: z.string().trim().max(40).optional() }),
    z.object({ mode: z.literal('existing'), clientId: z.string().uuid() }),
  ]),
});

export const personUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160),
  title: z.string().trim().max(160),
  phone: z.string().trim().max(40),
});

export const templateImportSchema = z.object({ projectId: z.string().uuid(), templateId: z.string().uuid(), templateTaskIds: z.array(z.string().uuid()).min(1), initialStatus: z.enum(['draft', 'active']).default('draft') });
const formFieldSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  type: z.enum(['text', 'textarea', 'radio', 'select', 'checkbox']),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});

export const feedbackConfigurationSchema = z.object({
  enabled: z.boolean(),
  // Bounds shared with the editor and the database CHECK constraint.
  delayValue: z.number().int().min(FEEDBACK_DELAY_MIN).max(FEEDBACK_DELAY_MAX),
  delayUnit: z.enum(['minutes', 'hours', 'days']),
  formSchema: z.array(formFieldSchema).min(1).max(30),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().max(40000),
  clientVisible: z.boolean(),
  requiresCompletion: z.boolean(),
  assigneeId: z.string().uuid().nullable(),
  status: z.enum(['draft', 'active', 'completed']),
  feedback: feedbackConfigurationSchema,
});
export const projectDeleteSchema = z.object({ projectName: z.string().trim().min(1).max(120), deleteClient: z.boolean() });
export const messageSchema = z.object({ body: z.string().trim().min(1).max(5000), attachmentUrl: z.string().url().nullable().optional() });
export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  timezone: z.string().trim().min(1).max(80),
  notificationPreferences: z.object({ task_messages: z.boolean(), project_messages: z.boolean(), task_completed: z.boolean() }).optional(),
});
export const formSubmissionSchema = z.object({
  answers: z.record(z.string().min(1).max(80), z.union([
    z.string().max(10000),
    z.array(z.string().max(10000)).max(20),
  ])).refine((answers) => Object.keys(answers).length <= 30),
});

export const availabilitySchema = z.object({
  timezone: z.string().trim().min(1).max(80),
  meetingDurationMinutes: z.number().int().refine((value) => [15, 30, 45, 60, 90, 120].includes(value)),
  bufferMinutes: z.number().int().min(0).max(120),
  minimumNoticeMinutes: z.number().int().min(0).max(43200),
  maximumAdvanceDays: z.number().int().min(1).max(365),
  rules: z.array(z.object({ weekday: z.number().int().min(0).max(6), enabled: z.boolean(), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/) })).length(7),
});

export const meetingCreateSchema = z.object({
  projectId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(80),
  title: z.string().trim().min(2).max(160).default('Project meeting'),
  description: z.string().trim().max(2000).default(''),
});

export const meetingCancelSchema = z.object({ reason: z.string().trim().max(500).optional().default('') });
