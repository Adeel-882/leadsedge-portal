import { z } from 'zod';

export const projectCreateSchema = z.object({
  projectName: z.string().trim().min(2).max(120),
  client: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('new'), fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(255), company: z.string().trim().max(160).optional() }),
    z.object({ mode: z.literal('existing'), clientId: z.string().uuid() }),
  ]),
});

export const templateImportSchema = z.object({ projectId: z.string().uuid(), templateId: z.string().uuid(), templateTaskIds: z.array(z.string().uuid()).min(1), initialStatus: z.enum(['draft', 'active']).default('draft') });
export const taskUpdateSchema = z.object({ title: z.string().trim().min(2).max(180), description: z.string().max(40000), clientVisible: z.boolean(), requiresCompletion: z.boolean(), assigneeId: z.string().uuid().nullable(), status: z.enum(['draft', 'active', 'completed']), dueAt: z.string().datetime().nullable() });
export const messageSchema = z.object({ body: z.string().trim().min(1).max(5000), attachmentUrl: z.string().url().nullable().optional() });
export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  timezone: z.string().trim().min(1).max(80),
  notificationPreferences: z.object({ task_messages: z.boolean(), project_messages: z.boolean(), task_completed: z.boolean() }).optional(),
});
export const formSubmissionSchema = z.object({ answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])) });
