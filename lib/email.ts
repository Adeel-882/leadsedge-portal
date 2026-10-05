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
    subject: "You're invited to LeadsEdge Portal",
    html: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="supported-color-schemes" content="dark">
    <title>You're invited to LeadsEdge Portal</title>
  </head>

  <body style="margin:0;padding:0;background:#070707;">

    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      style="background:#070707;"
    >
      <tr>
        <td align="center" style="padding:32px 16px;">

          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="
              max-width:600px;
              background:#111111;
              border:1px solid #262626;
              border-radius:18px;
            "
          >

            <!-- BRAND -->
            <tr>
              <td style="padding:34px 38px 12px;">

                <table
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                >
                  <tr>

                    <td
                      align="center"
                      valign="middle"
                      width="44"
                      height="44"
                      style="
                        width:44px;
                        height:44px;
                        background:#FF4134;
                        border-radius:10px;
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:16px;
                        font-weight:800;
                        color:#FFFFFF;
                      "
                    >
                      LE
                    </td>

                    <td style="padding-left:12px;">
                      <div
                        style="
                          font-family:Arial,Helvetica,sans-serif;
                          font-size:17px;
                          font-weight:800;
                          color:#F7F7F2;
                          line-height:20px;
                        "
                      >
                        LeadsEdge
                      </div>

                      <div
                        style="
                          font-family:Arial,Helvetica,sans-serif;
                          font-size:12px;
                          font-weight:600;
                          color:#777772;
                          letter-spacing:0.5px;
                          line-height:16px;
                        "
                      >
                        PORTAL
                      </div>
                    </td>

                  </tr>
                </table>

              </td>
            </tr>

            <!-- ACCENT LABEL -->
            <tr>
              <td style="padding:16px 38px 6px;">
                <div
                  style="
                    font-family:Arial,Helvetica,sans-serif;
                    font-size:13px;
                    font-weight:700;
                    letter-spacing:1.4px;
                    text-transform:uppercase;
                    color:#FF4134;
                  "
                >
                  Client Invitation
                </div>
              </td>
            </tr>

            <!-- TITLE -->
            <tr>
              <td style="padding:4px 38px 8px;">
                <h1
                  style="
                    margin:0;
                    font-family:Arial,Helvetica,sans-serif;
                    font-size:30px;
                    line-height:38px;
                    font-weight:800;
                    color:#F7F7F2;
                  "
                >
                  Welcome to LeadsEdge Portal
                </h1>
              </td>
            </tr>

            <!-- COPY -->
            <tr>
              <td style="padding:10px 38px 22px;">

                <p
                  style="
                    margin:0;
                    font-family:Arial,Helvetica,sans-serif;
                    font-size:16px;
                    line-height:26px;
                    color:#A7A7A2;
                  "
                >
                  Hi ${escapeHtml(clientName)},
                </p>

                <p
                  style="
                    margin:10px 0 0;
                    font-family:Arial,Helvetica,sans-serif;
                    font-size:16px;
                    line-height:26px;
                    color:#A7A7A2;
                  "
                >
                  You've been invited to
                  <strong style="color:#F7F7F2;">
                    LeadsEdge Portal
                  </strong>.
                  Use the secure button below to access your workspace.
                  No password is required.
                </p>

              </td>
            </tr>

            <!-- BUTTON -->
            <tr>
              <td
                align="center"
                style="padding:8px 38px 16px;"
              >

                <a
                  href="${escapeAttribute(actionLink)}"
                  style="
                    display:inline-block;
                    background:#FF4134;
                    color:#FFFFFF;
                    text-decoration:none;
                    font-family:Arial,Helvetica,sans-serif;
                    font-size:16px;
                    font-weight:700;
                    line-height:20px;
                    padding:14px 24px;
                    border-radius:9px;
                    text-align:center;
                  "
                >
                  View Your Portal
                </a>

              </td>
            </tr>

            <!-- SECURITY NOTE -->
            <tr>
              <td style="padding:12px 38px 6px;">

                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="
                    background:#171717;
                    border:1px solid #262626;
                    border-radius:10px;
                  "
                >
                  <tr>
                    <td style="padding:15px 17px;">

                      <p
                        style="
                          margin:0;
                          font-family:Arial,Helvetica,sans-serif;
                          font-size:13px;
                          line-height:21px;
                          color:#8F8F8A;
                        "
                      >
                        This invitation is private and expires automatically.
                        For your security, the invitation link can only be used once.
                      </p>

                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding:28px 38px 34px;">

                <div
                  style="
                    border-top:1px solid #262626;
                    padding-top:20px;
                  "
                >

                  <p
                    style="
                      margin:0 0 7px;
                      font-family:Arial,Helvetica,sans-serif;
                      font-size:13px;
                      line-height:21px;
                      color:#7E7E79;
                    "
                  >
                    If you weren't expecting this invitation, you can safely ignore this email.
                  </p>

                  <p
                    style="
                      margin:0;
                      font-family:Arial,Helvetica,sans-serif;
                      font-size:12px;
                      line-height:20px;
                      color:#5E5E5A;
                    "
                  >
                    © 2026 Leads Edge LLC · LeadsEdge Portal
                  </p>

                </div>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </body>
</html>`,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data?.id || null };
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!); }
function escapeAttribute(value: string) { return escapeHtml(value).replace(/`/g, '&#096;'); }
