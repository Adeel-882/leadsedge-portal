import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { sendPortalInvitation } from '@/lib/email';
import { appUrl, isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { projectCreateSchema } from '@/lib/validation';
import { buildPortalConfirmationUrl } from '@/lib/auth-flow';

export async function POST(request: Request) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = projectCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid project information.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ warning: 'The workflow is ready. Connect Supabase and Resend to persist this project and send the invitation.' }, { status: 201 });
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Server database credentials are not configured.' }, { status: 503 });

  let clientAuthUserId: string;
  let fullName: string;
  let email: string;
  let company: string | undefined;
  let actionLink: string | null = null;

  if (parsed.data.client.mode === 'existing') {
    const { data: existing, error } = await supabase.from('clients').select('auth_user_id,full_name,email,company').eq('id', parsed.data.client.clientId).single();
    if (error || !existing?.auth_user_id) return NextResponse.json({ error: 'The selected client is unavailable or has no portal account.' }, { status: 400 });
    clientAuthUserId = existing.auth_user_id; fullName = existing.full_name; email = existing.email; company = existing.company || undefined;
  } else {
    fullName = parsed.data.client.fullName; email = parsed.data.client.email.toLowerCase(); company = parsed.data.client.company;
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { role: 'client', full_name: fullName }, redirectTo: `${appUrl()}/portal` } });
    if (linkError || !linkData.user || !linkData.properties?.hashed_token) return NextResponse.json({ error: 'The client account could not be prepared. Check whether this email already exists.' }, { status: 400 });
    const { data: invitedProfile, error: profileError } = await admin.from('users').select('role').eq('id', linkData.user.id).maybeSingle();
    if (profileError || !invitedProfile) return NextResponse.json({ error: 'The client account profile could not be verified.' }, { status: 400 });
    if (invitedProfile.role === 'admin') return NextResponse.json({ error: 'An administrator account cannot be invited as a client.' }, { status: 400 });
    clientAuthUserId = linkData.user.id;
    actionLink = buildPortalConfirmationUrl({ tokenHash: linkData.properties.hashed_token, type: 'invite' });
  }

  const { data: bundle, error: bundleError } = await supabase.rpc('create_project_bundle', { project_name_input: parsed.data.projectName, client_auth_user_id_input: clientAuthUserId, client_full_name_input: fullName, client_email_input: email, client_company_input: company || null }).single();
  if (bundleError || !bundle) return NextResponse.json({ error: 'The project could not be created. No client invitation was sent.' }, { status: 500 });
  const created = bundle as { project_id: string; client_id: string };
  let crmWarning: string | null = null;

  if (parsed.data.client.mode === 'new' && (parsed.data.client.title || parsed.data.client.phone)) {
    const { error: crmError } = await supabase.from('clients').update({
      title: parsed.data.client.title || null,
      phone: parsed.data.client.phone || null,
    }).eq('id', created.client_id);
    if (crmError) crmWarning = 'The person and project were created, but the optional title or phone could not be saved.';
  }

  if (actionLink) {
    const delivery = await sendPortalInvitation({ to: email, clientName: fullName, projectName: parsed.data.projectName, actionLink });
    await admin.from('email_deliveries').insert({ client_id: created.client_id, project_id: created.project_id, email_type: 'client_invitation', provider_id: delivery.ok ? delivery.id : null, status: delivery.ok ? 'sent' : 'failed', error_message: delivery.ok ? null : delivery.error });
    if (!delivery.ok) return NextResponse.json({ projectId: created.project_id, warning: delivery.error }, { status: 201 });
  }
  return NextResponse.json({ projectId: created.project_id, ...(crmWarning ? { warning: crmWarning } : {}) }, { status: 201 });
}
