import { Resend } from 'resend';

export async function sendBrandedEmail({ to, subject, heading, greetingName, body, actionLabel, actionLink, idempotencyKey }: { to: string; subject: string; heading: string; greetingName?: string; body: string; actionLabel: string; actionLink: string; idempotencyKey?: string }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { ok: false as const, error: 'Email delivery is not configured.' };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject,
    html: `<div style="background:#f3f6f9;padding:32px;font-family:Arial,sans-serif;color:#12233f"><div style="max-width:560px;margin:auto;background:white;border-radius:18px;padding:32px;border:1px solid #e3e8ef"><div style="display:inline-block;background:#0d7c72;color:white;border-radius:10px;padding:10px 13px;font-weight:800">L</div><h1 style="font-size:26px;margin:24px 0 8px">${escapeHtml(heading)}</h1><p style="line-height:1.65;color:#607087">${greetingName ? `Hi ${escapeHtml(greetingName)}, ` : ''}${escapeHtml(body)}</p><p style="margin:28px 0"><a href="${escapeAttribute(actionLink)}" style="display:inline-block;background:#0d7c72;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">${escapeHtml(actionLabel)}</a></p><p style="font-size:12px;line-height:1.6;color:#8a96a7">This message was sent by LeadsEdge Portal.</p></div></div>`,
  }, idempotencyKey ? { idempotencyKey } : undefined);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data?.id || null };
}

export async function sendPortalInvitation({ to, clientName, actionLink }: { to: string; clientName: string; projectName: string; actionLink: string }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { ok: false as const, error: 'Email delivery is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL, then resend the invitation.' };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject: 'Your LeadsEdge Portal invitation',
    html: `<div style="background:#f3f6f9;padding:32px;font-family:Arial,sans-serif;color:#12233f"><div style="max-width:560px;margin:auto;background:white;border-radius:18px;padding:32px;border:1px solid #e3e8ef"><div style="display:inline-block;background:#0d7c72;color:white;border-radius:10px;padding:10px 13px;font-weight:800">L</div><h1 style="font-size:26px;margin:24px 0 8px">Welcome to LeadsEdge Portal</h1><p style="line-height:1.65;color:#607087">Hi ${escapeHtml(clientName)}, you’ve been invited to <strong>LeadsEdge Portal</strong>. Use the secure button below to open your portal — no password is required.</p><p style="margin:28px 0"><a href="${escapeAttribute(actionLink)}" style="display:inline-block;background:#0d7c72;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">View Your Portal</a></p><p style="font-size:12px;line-height:1.6;color:#8a96a7">This link is private and expires automatically. If you weren’t expecting this invitation, you can ignore this email.</p></div></div>`,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data?.id || null };
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!); }
function escapeAttribute(value: string) { return escapeHtml(value).replace(/`/g, '&#096;'); }
