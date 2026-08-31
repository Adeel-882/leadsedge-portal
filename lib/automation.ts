import { sendBrandedEmail } from './email';
import { appUrl } from './env';
import { createSupabaseAdminClient } from './supabase/admin';

export async function processAutomationWork(limit = 20) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { processedFeedback: 0, sentEmails: 0, failedEmails: 0 };
  const { data: feedbackCount } = await admin.rpc('process_due_feedback_requests_job');
  const reminderCutoff = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const { data: dueMeetings } = await admin.from('meetings').select('id,project_id,client_id,owner_id,title,start_at,timezone').eq('status', 'scheduled').is('reminder_sent_at', null).gte('start_at', new Date().toISOString()).lte('start_at', reminderCutoff).limit(limit);
  for (const meeting of dueMeetings || []) {
    const { data: claimed } = await admin.from('meetings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', meeting.id).is('reminder_sent_at', null).select('id').maybeSingle();
    if (!claimed) continue;
    const [{ data: client }, { data: owner }] = await Promise.all([admin.from('clients').select('auth_user_id,email,full_name').eq('id', meeting.client_id).single(), admin.from('users').select('email,full_name').eq('id', meeting.owner_id).single()]);
    const recipients = [{ userId: client?.auth_user_id, email: client?.email, name: client?.full_name, targetUrl: `/portal/meetings/${meeting.id}`, dedupe: 'client' }, { userId: meeting.owner_id, email: owner?.email, name: owner?.full_name, targetUrl: `/admin/meetings/${meeting.id}`, dedupe: 'admin' }];
    for (const recipient of recipients) if (recipient.userId && recipient.email) {
      await admin.from('notifications').insert({ user_id: recipient.userId, project_id: meeting.project_id, type: 'meeting.reminder', title: 'Meeting reminder', body: `${meeting.title} starts within 24 hours.`, target_url: recipient.targetUrl });
      await admin.from('email_outbox').insert({ user_id: recipient.userId, client_id: recipient.dedupe === 'client' ? meeting.client_id : null, project_id: meeting.project_id, meeting_id: meeting.id, email_type: 'meeting.reminder', recipient_email: recipient.email, template_data: { clientName: recipient.name, title: meeting.title, startAt: meeting.start_at, timezone: meeting.timezone, targetUrl: recipient.targetUrl }, dedupe_key: `meeting-reminder-${recipient.dedupe}:${meeting.id}` });
    }
  }
  const { data: rows } = await admin.from('email_outbox').select('id,user_id,client_id,project_id,email_type,recipient_email,template_data,attempts').in('status', ['pending', 'failed']).lte('available_at', new Date().toISOString()).lt('attempts', 5).order('created_at').limit(limit);
  let sentEmails = 0; let failedEmails = 0;
  for (const row of rows || []) {
    const { data: claimed } = await admin.from('email_outbox').update({ status: 'sending', attempts: row.attempts + 1, last_error: null }).eq('id', row.id).in('status', ['pending', 'failed']).select('id').maybeSingle();
    if (!claimed) continue;
    const template = (row.template_data || {}) as Record<string, string>;
    const targetUrl = `${appUrl().replace(/\/$/, '')}${template.targetUrl || (row.email_type.startsWith('meeting.') ? '/portal/meetings' : '/portal/tasks')}`;
    const title = row.email_type === 'feedback.requested' ? 'How did this lead go?'
      : row.email_type === 'feedback.submitted' ? 'Feedback submitted'
        : row.email_type === 'task.assigned' ? 'A new lead assignment is ready'
          : row.email_type === 'meeting.cancelled' ? 'Meeting cancelled'
            : row.email_type === 'meeting.reminder' ? 'Meeting reminder' : 'Your Leadsedge meeting is confirmed';
    const detail = row.email_type === 'feedback.requested' ? 'Please share your feedback for the completed lead assignment.'
      : row.email_type === 'feedback.submitted' ? `${template.clientName || 'A client'} submitted feedback for ${template.taskTitle || 'a lead assignment'}.`
        : row.email_type === 'task.assigned' ? `${template.taskTitle || 'A lead assignment'} is ready in your portal.`
          : `${template.title || 'Your meeting'}${template.startAt ? ` · ${new Date(template.startAt).toLocaleString('en-US', { timeZone: template.timezone || 'UTC', dateStyle: 'medium', timeStyle: 'short' })}` : ''}`;
    const actionLabel = row.email_type === 'feedback.requested' ? 'Leave Feedback' : row.email_type === 'feedback.submitted' ? 'View Feedback' : row.email_type === 'task.assigned' ? 'View Lead Assignment' : 'View Meeting';
    const result = await sendBrandedEmail({ to: row.recipient_email, subject: `${title} — Leadsedge Portal`, heading: title, greetingName: template.clientName, body: detail, actionLabel, actionLink: targetUrl });
    if (result.ok) {
      await admin.from('email_outbox').update({ status: 'sent', provider_id: result.id, sent_at: new Date().toISOString() }).eq('id', row.id);
      await admin.from('email_deliveries').insert({ client_id: row.client_id, project_id: row.project_id, email_type: row.email_type, provider_id: result.id, status: 'sent' });
      sentEmails += 1;
    } else {
      await admin.from('email_outbox').update({ status: 'failed', last_error: result.error, available_at: new Date(Date.now() + 5 * 60_000).toISOString() }).eq('id', row.id);
      await admin.from('email_deliveries').insert({ client_id: row.client_id, project_id: row.project_id, email_type: row.email_type, status: 'failed', error_message: result.error });
      failedEmails += 1;
    }
  }
  return { processedFeedback: Number(feedbackCount || 0), sentEmails, failedEmails };
}
