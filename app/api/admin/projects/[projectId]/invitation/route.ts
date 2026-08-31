import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { sendPortalInvitation } from '@/lib/email';
import { appUrl, isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildPortalConfirmationUrl } from '@/lib/auth-flow';

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ error: 'Invitations cannot be sent in demo mode.' }, { status: 503 });
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Server authentication is not configured.' }, { status: 503 });
  const { data: project, error } = await supabase.from('projects').select('project_name,project_clients!inner(is_primary,client:clients(id,auth_user_id,full_name,email))').eq('id', projectId).single();
  const link = project?.project_clients?.find((item) => item.is_primary) || project?.project_clients?.[0];
  const client = Array.isArray(link?.client) ? link.client[0] : link?.client;
  if (error || !project || !client?.auth_user_id) return NextResponse.json({ error: 'Client invitation details are unavailable.' }, { status: 404 });
  const { data: clientProfile, error: profileError } = await admin.from('users').select('role').eq('id', client.auth_user_id).maybeSingle();
  if (profileError || !clientProfile || clientProfile.role !== 'client') return NextResponse.json({ error: 'Only a linked client account can receive a portal invitation.' }, { status: 400 });

  const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(client.auth_user_id);
  if (authUserError || !authUserData.user) {
    return NextResponse.json({ error: "The client's authentication account no longer exists. Restore or relink it before resending an invitation." }, { status: 409 });
  }
  if (!authUserData.user.email || authUserData.user.email.toLowerCase() !== client.email.toLowerCase()) {
    return NextResponse.json({ error: "The linked authentication account does not match this client's email." }, { status: 409 });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: client.email, options: { redirectTo: `${appUrl()}/portal` } });
  if (linkError || !linkData.properties?.hashed_token || linkData.user.id !== client.auth_user_id) {
    return NextResponse.json({ error: 'A secure invitation link could not be generated for the linked client account.' }, { status: 500 });
  }
  const actionLink = buildPortalConfirmationUrl({ tokenHash: linkData.properties.hashed_token, type: 'magiclink' });
  const delivery = await sendPortalInvitation({ to: client.email, clientName: client.full_name, projectName: project.project_name, actionLink });
  await admin.from('email_deliveries').insert({ client_id: client.id, project_id: projectId, email_type: 'client_invitation', provider_id: delivery.ok ? delivery.id : null, status: delivery.ok ? 'sent' : 'failed', error_message: delivery.ok ? null : delivery.error });
  if (!delivery.ok) return NextResponse.json({ error: 'Invitation could not be sent. Please try again.' }, { status: 502 });
  return NextResponse.json({ message: `Invitation sent to ${client.email}`, sentAt: new Date().toISOString() });
}
