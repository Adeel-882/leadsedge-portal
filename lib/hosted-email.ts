import { Resend } from 'resend';

export const emailTemplateContracts = {
  client_invitation: ['CLIENT_NAME', 'ACTION_URL'],
  'task.assigned': ['CLIENT_NAME', 'TASK_TITLE', 'ACTION_URL'],
  'feedback.requested': ['CLIENT_NAME', 'TASK_TITLE', 'PROJECT_NAME', 'ACTION_URL'],
  'feedback.submitted': ['CLIENT_NAME', 'TASK_TITLE', 'PROJECT_NAME', 'ACTION_URL'],
  'meeting.confirmation': ['MEETING_TITLE', 'START_DISPLAY', 'TIMEZONE', 'ACTION_URL'],
  'meeting.cancelled': ['MEETING_TITLE', 'START_DISPLAY', 'TIMEZONE', 'ACTION_URL'],
  'meeting.reminder': ['MEETING_TITLE', 'START_DISPLAY', 'TIMEZONE', 'ACTION_URL'],
} as const;
export type EmailCategory = keyof typeof emailTemplateContracts;
export type HostedEmail = { [K in EmailCategory]: {
  category: K; variables: Record<(typeof emailTemplateContracts)[K][number], string>;
} }[EmailCategory];
export function templateConfigPrefix(category: EmailCategory) {
  return `RESEND_TEMPLATE_${category.replaceAll('.', '_').toUpperCase()}`;
}
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

/** Null selects legacy before any request. Never perform a second send here. */
export async function sendHostedEmail(to: string, email?: HostedEmail, idempotencyKey?: string) {
  if (!email) return null;
  const prefix = templateConfigPrefix(email.category);
  const id = process.env[`${prefix}_ID`]?.trim();
  if (process.env[`${prefix}_ENABLED`]?.trim().toLowerCase() !== 'true' || !id) return null;
  const variables: Record<string, string> = {};
  for (const key of emailTemplateContracts[email.category]) {
    const value = (email.variables as Record<string, string>)[key];
    if (typeof value !== 'string') return { ok: false as const, error: 'Email template variables are invalid.' };
    // Reviewed HTML uses triple-brace variables in text and quoted href attributes.
    variables[key] = escape(value);
    if (variables[key].length > 2000) return { ok: false as const, error: 'Email template variable exceeds provider limit.' };
  }
  try {
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.RESEND_FROM_EMAIL!, to, template: { id, variables },
    }, idempotencyKey ? { idempotencyKey } : undefined);
    if (error) return { ok: false as const, error: 'Hosted email delivery failed.' };
    return { ok: true as const, id: data?.id || null };
  } catch {
    throw new Error('Hosted email delivery outcome is uncertain.');
  }
}

export function automationHostedEmail(type: string, data: Record<string, string>, actionUrl: string): HostedEmail | undefined {
  if (type === 'feedback.requested' || type === 'feedback.submitted') return {
    category: type, variables: { CLIENT_NAME: data.clientName || 'A client', TASK_TITLE: data.taskTitle || 'a lead assignment', PROJECT_NAME: data.projectName || 'Your project', ACTION_URL: actionUrl },
  };
  if (type === 'meeting.confirmation' || type === 'meeting.cancelled' || type === 'meeting.reminder') return {
    category: type, variables: { MEETING_TITLE: data.title || 'Your meeting', START_DISPLAY: data.startAt ? new Date(data.startAt).toLocaleString('en-US', { timeZone: data.timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' }) : 'See meeting details', TIMEZONE: data.timezone || 'UTC', ACTION_URL: actionUrl },
  };
}
