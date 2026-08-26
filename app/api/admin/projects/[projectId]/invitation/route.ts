import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { sendPortalInvitation } from '@/lib/email';
import { appUrl, isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ message: 'Connect Supabase and Resend to send invitations.' });
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Email delivery is not configured.' }, { status: 503 });
  const { data: project, error } = await supabase.from('projects').select('project_name,project_clients!inner(is_primary,client:clients(id,auth_user_id,full_name,email))').eq('id', projectId).single();
  const link = project?.project_clients?.find((item) => item.is_primary) || project?.project_clients?.[0];
  const client = Array.isArray(link?.client) ? link.client[0] : link?.client;
  if (error || !project || !client?.auth_user_id) return NextResponse.json({ error: 'Client invitation details are unavailable.' }, { status: 404 });
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: client.email, options: { redirectTo: `${appUrl()}/auth/callback?next=/portal` } });
  if (linkError) return NextResponse.json({ error: 'A secure invitation link could not be generated.' }, { status: 500 });
  const delivery = await sendPortalInvitation({ to: client.email, clientName: client.full_name, projectName: project.project_name, actionLink: linkData.properties.action_link });
  await admin.from('email_deliveries').insert({ client_id: client.id, project_id: projectId, email_type: 'client_invitation', provider_id: delivery.ok ? delivery.id : null, status: delivery.ok ? 'sent' : 'failed', error_message: delivery.ok ? null : delivery.error });
  if (!delivery.ok) return NextResponse.json({ error: delivery.error }, { status: 502 });
  return NextResponse.json({ message: `Invitation sent to ${client.email}.` });
}
