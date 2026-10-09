import { Resend } from 'resend';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function administratorInvitationEmail(name: string, actionLink: string) {
  return {
    subject: "You're invited to LeadsEdge Portal as an Administrator",
    text: `Hi ${name},\n\nAn administrator has invited you to join LeadsEdge Portal with full administrator access, including the ability to invite other administrators.\n\nAccept Invitation: ${actionLink}\n\nOpen the secure link and click Continue. The link is one-time and expires; ask the inviter to resend if needed. If you did not expect this invitation, ignore this email.`,
    html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head><body style="margin:0;background:#070707;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF"><table role="presentation" width="100%" style="max-width:600px;margin:auto;background:#111111;border:1px solid #262626;border-radius:18px"><tr><td style="padding:32px"><div style="color:#FF4134;font-weight:800;font-size:20px">LeadsEdge Portal</div><h1 style="font-size:28px;color:#FFFFFF;margin-top:32px">You're invited as an Administrator</h1><p style="color:#FFFFFF;line-height:1.7">Hi ${escape(name)},</p><p style="color:#FFFFFF;line-height:1.7">An administrator has invited you to join LeadsEdge Portal. Click below to securely activate your administrator account.</p><p style="color:#cccccc;line-height:1.7">This invitation provides full administrator access, including managing clients, projects and settings, and inviting additional administrators.</p><p style="margin:28px 0"><a href="${escape(actionLink)}" style="display:inline-block;background:#FF4134;color:#FFFFFF;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Accept Invitation</a></p><p style="color:#aaaaaa;font-size:13px;line-height:1.7">Open the secure link and click Continue to accept. This link is one-time and expires. If it has expired, ask the administrator to resend it. If you did not expect this invitation, you can ignore this email.</p></td></tr></table></body></html>`,
  };
}
export async function sendAdministratorInvitation(to: string, name: string, actionLink: string, invitationId: string) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return false;
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.RESEND_FROM_EMAIL, to, ...administratorInvitationEmail(name, actionLink),
    }, { idempotencyKey: `administrator-invitation/${invitationId}` });
    return !result.error;
  } catch { return false; } // Provider errors can contain request details; never log them.
}
