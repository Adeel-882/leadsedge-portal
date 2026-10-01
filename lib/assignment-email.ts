import { createSupabaseAdminClient } from './supabase/admin';
import { sendBrandedEmail } from './email';
import { appUrl } from './env';

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
const one = <T>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;

// Re-read current assignment; request payloads and old outbox recipients are not authority.
async function recipient(admin: Admin, taskId: string) {
  const { data: task, error } = await admin.from('project_tasks')
    .select('id,project_id,title,assignee_id,template:template_tasks!inner(template:templates!inner(name))')
    .eq('id', taskId).eq('status', 'active').eq('requires_completion', true)
    .eq('client_visible', true).is('archived_at', null).maybeSingle();
  if (error) throw new Error('assignment_lookup_failed');
  if (!task || one(one(task.template)?.template)?.name !== 'Lead Assignment' || !task.assignee_id) return null;
  const [{ data: client, error: clientError }, { data: membership, error: memberError }] = await Promise.all([
    admin.from('clients').select('id,auth_user_id,email,full_name').eq('id', task.assignee_id).neq('status', 'disabled').maybeSingle(),
    admin.from('project_clients').select('client_id').eq('project_id', task.project_id).eq('client_id', task.assignee_id).maybeSingle(),
  ]);
  if (clientError || memberError) throw new Error('assignment_recipient_lookup_failed');
  if (!client?.auth_user_id || !membership) return null;
  const { data: profile, error: profileError } = await admin.from('users').select('id,email').eq('id', client.auth_user_id).eq('role', 'client').maybeSingle();
  if (profileError) throw new Error('assignment_profile_lookup_failed');
  if (!profile || profile.email.toLowerCase() !== client.email.toLowerCase()) return null;
  return { task, client };
}

export function assignmentEmailLink(taskId: string) {
  const url = new URL('/auth/sign-in', appUrl());
  url.searchParams.set('next', `/portal/tasks/${taskId}`);
  return url.toString();
}

/** Used by import and edit. Unique outbox keys survive saves, retries and workers. */
export async function queueAssignmentEmails(taskIds: string[]) {
  const admin = createSupabaseAdminClient();
  if (!admin) return [];
  const queued: string[] = [];
  for (const taskId of taskIds) {
    try {
      const current = await recipient(admin, taskId);
      if (!current) continue;
      const { task, client } = current;
      // Respect previously queued/sent rows, including the older task-only key.
      const { data: existing, error: lookupError } = await admin.from('email_outbox').select('id,status')
        .eq('task_id', task.id).eq('client_id', client.id).eq('email_type', 'task.assigned').limit(1);
      if (lookupError) throw new Error('outbox_lookup_failed');
      if (existing?.length) { if (existing[0].status === 'pending') queued.push(existing[0].id); continue; }
      const { data, error } = await admin.from('email_outbox').upsert({
        user_id: client.auth_user_id, client_id: client.id, project_id: task.project_id, task_id: task.id,
        email_type: 'task.assigned', recipient_email: client.email,
        template_data: { clientName: client.full_name, taskTitle: task.title, targetUrl: `/portal/tasks/${task.id}` },
        dedupe_key: `task-assigned:${task.id}:${client.id}`,
      }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
      if (error) throw new Error('outbox_enqueue_failed');
      queued.push(...(data || []).map(row => row.id));
      // The outbox event ID also makes the matching Bell event idempotent.
      // Imports have no database notification trigger; editor activation already
      // emitted this notification historically, so its old event is retained.
      if (data?.[0]) {
        const { data: notifications, error: notificationError } = await admin.from('notifications').select('id')
          .eq('task_id', task.id).eq('user_id', client.auth_user_id).eq('type', 'task.activated').limit(1);
        if (notificationError) throw new Error('notification_lookup_failed');
        if (!notifications?.length) {
          const { error: notifyError } = await admin.from('notifications').upsert({
            id: data[0].id, user_id: client.auth_user_id, project_id: task.project_id, task_id: task.id,
            type: 'task.activated', title: 'New task ready', body: `${task.title} is ready for you.`, target_url: `/portal/tasks/${task.id}`,
          }, { onConflict: 'id', ignoreDuplicates: true });
          if (notifyError) console.warn('[assignment-email]', { stage: 'notification_failed', taskId });
        }
      }
    } catch { console.warn('[assignment-email]', { stage: 'queue_failed', taskId }); }
  }
  return queued;
}

/** Existing cron retries failures; after-response work attempts newly queued rows promptly. */
export async function deliverAssignmentEmails(ids?: string[], limit = 20) {
  const admin = createSupabaseAdminClient();
  if (!admin || ids?.length === 0) return { sentEmails: 0, failedEmails: 0 };
  let query = admin.from('email_outbox').select('id,task_id,client_id,project_id,recipient_email,template_data,attempts,created_at')
    .eq('email_type', 'task.assigned').in('status', ['pending', 'failed']).lt('attempts', 5)
    .lte('available_at', new Date().toISOString()).order('created_at').limit(limit);
  if (ids) query = query.in('id', ids);
  const { data: rows, error } = await query;
  if (error) { console.warn('[assignment-email]', { stage: 'outbox_read_failed' }); return { sentEmails: 0, failedEmails: 0 }; }
  let sentEmails = 0, failedEmails = 0;
  for (const row of rows || []) {
    // Resend retains keys for 24 hours. Never automatically replay an ambiguous
    // older attempt outside that window; leave it for delivery reconciliation.
    if (row.attempts > 0 && Date.now() - Date.parse(row.created_at) > 23 * 3_600_000) {
      await admin.from('email_outbox').update({ status: 'sending', last_error: 'Delivery reconciliation required before retry.' }).eq('id', row.id).eq('status', 'failed');
      continue;
    }
    const { data: claimed } = await admin.from('email_outbox').update({ status: 'sending', attempts: row.attempts + 1 })
      .eq('id', row.id).in('status', ['pending', 'failed']).select('id').maybeSingle();
    if (!claimed) continue;
    try {
      const current = row.task_id && await recipient(admin, row.task_id);
      if (!current || current.client.id !== row.client_id || current.client.email !== row.recipient_email) {
        await admin.from('email_outbox').update({ status: 'cancelled' }).eq('id', row.id);
        continue;
      }
      // Freeze queue-time content: the provider's idempotency key must have a stable payload.
      const template = row.template_data as { clientName: string; taskTitle: string };
      const result = await sendBrandedEmail({ to: row.recipient_email,
        subject: 'New lead assigned in LeadsEdge Portal', heading: 'A new lead is ready',
        greetingName: template.clientName,
        body: `A new lead has been assigned to you in LeadsEdge Portal. ${template.taskTitle}. Open your portal to review the lead details, continue the conversation, and manage the assignment.`,
        actionLabel: 'View Lead', actionLink: assignmentEmailLink(row.task_id!), idempotencyKey: `assignment/${row.id}`,
      });
      if (!result.ok) throw new Error('provider_failed');
      const { error: saved } = await admin.from('email_outbox').update({ status: 'sent', provider_id: result.id, sent_at: new Date().toISOString(), last_error: null }).eq('id', row.id);
      if (saved) { console.warn('[assignment-email]', { stage: 'delivery_ack_failed', outboxId: row.id }); continue; }
      sentEmails++;
    } catch {
      failedEmails++;
      console.warn('[assignment-email]', { stage: 'delivery_failed', outboxId: row.id });
      await admin.from('email_outbox').update({ status: 'failed', last_error: 'Assignment email delivery failed.', available_at: new Date(Date.now() + 300_000).toISOString() }).eq('id', row.id);
    }
  }
  return { sentEmails, failedEmails };
}
