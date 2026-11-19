import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireApiRole } from '@/lib/auth';
import { sendTrackedClientInvitation } from '@/lib/client-invitation-tracking';
import { appUrl, isDemoMode } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { projectCreateSchema } from '@/lib/validation';
import { projectCreationReady } from '@/lib/project-creation-readiness';
import { committedProjectResult, type ProjectCreationResult } from '@/lib/project-creation';

export async function POST(request: Request) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = projectCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid project information.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ warning: 'The workflow is ready. Connect Supabase and Resend to persist this project and send the invitation.' }, { status: 201 });
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Server database credentials are not configured.' }, { status: 503 });
  const requestId = request.headers.get('Idempotency-Key');
  if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return NextResponse.json({ error: 'A valid project creation request ID is required. Refresh this page before creating a project.' }, { status: 400 });
  }
  if (!await projectCreationReady(supabase, admin)) {
    return NextResponse.json({ error: 'Project creation is temporarily unavailable because its database setup is incomplete. This attempt made no changes. If you retried an earlier request, check Projects for its result.' }, { status: 503 });
  }
  const payloadHash = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
  const claimArgs = { request_id_input: requestId, payload_hash_input: payloadHash };
  let created: { project_id: string; client_id: string } | null = null;
  async function completed(result: ProjectCreationResult) {
    try { await supabase!.rpc('finish_project_creation', { ...claimArgs, result_input: result }); } catch { /* committed IDs remain durable even if response recording fails */ }
    return NextResponse.json(result, { status: 201 });
  }
  try {
    const { data: claim, error: claimError } = await supabase.rpc('claim_project_creation', claimArgs);
    if (claimError || !claim) return NextResponse.json({ error: 'This creation request could not be confirmed. Retry the same request or check Projects before starting another.' }, { status: 409 });
    if (!claim.acquired) {
      const previous = committedProjectResult(claim.result);
      if (previous) return NextResponse.json(previous);
      if (claim.projectId) return NextResponse.json({ projectId: claim.projectId, projectName: parsed.data.projectName, invitationStatus: 'pending', warning: 'This project already exists. Its invitation may still be processing; check its status before resending.' });
      return NextResponse.json({ error: 'This request is already processing or needs review. Retry this same request to check its result; do not create another project.' }, { status: 409 });
    }

  let clientAuthUserId: string;
  let fullName: string;
  let email: string;
  let company: string | undefined;
  let invitation: { tokenHash: string; issuedAt: string } | null = null;

  if (parsed.data.client.mode === 'existing') {
    const { data: existing, error } = await supabase.from('clients').select('auth_user_id,full_name,email,company').eq('id', parsed.data.client.clientId).single();
    if (error || !existing?.auth_user_id) return NextResponse.json({ error: 'The selected client is unavailable or has no portal account.' }, { status: 400 });
    clientAuthUserId = existing.auth_user_id; fullName = existing.full_name; email = existing.email; company = existing.company || undefined;
  } else {
    fullName = parsed.data.client.fullName; email = parsed.data.client.email.toLowerCase(); company = parsed.data.client.company;
    const issuedAt = new Date().toISOString();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { role: 'client', full_name: fullName }, redirectTo: `${appUrl()}/portal` } });
    if (linkError || !linkData.user || !linkData.properties?.hashed_token) return NextResponse.json({ error: 'The client account could not be prepared. Check whether this email already exists.' }, { status: 400 });
    const { data: invitedProfile, error: profileError } = await admin.from('users').select('role').eq('id', linkData.user.id).maybeSingle();
    if (profileError || !invitedProfile) return NextResponse.json({ error: 'The client account profile could not be verified.' }, { status: 400 });
    if (invitedProfile.role === 'admin') return NextResponse.json({ error: 'An administrator account cannot be invited as a client.' }, { status: 400 });
    clientAuthUserId = linkData.user.id;
    invitation = { tokenHash: linkData.properties.hashed_token, issuedAt };
  }

  const { data: bundle, error: bundleError } = await supabase.rpc('create_project_bundle_once', { ...claimArgs, project_name_input: parsed.data.projectName, client_auth_user_id_input: clientAuthUserId, client_full_name_input: fullName, client_email_input: email, client_company_input: company || null }).single();
  if (bundleError || !bundle) {
    const { data: recovered } = await supabase.rpc('claim_project_creation', claimArgs);
    if (recovered?.projectId) return completed({ projectId: recovered.projectId, projectName: parsed.data.projectName, invitationStatus: 'not_sent', warning: 'Project creation was recovered after a response failure. No invitation was sent; use Resend invitation on this project.' });
    return NextResponse.json({ error: 'The creation result could not be confirmed. Retry this same request to check the result; do not start another project.' }, { status: 409 });
  }
  created = bundle as { project_id: string; client_id: string };
  let crmWarning: string | null = null;

  if (parsed.data.client.mode === 'new' && (parsed.data.client.title || parsed.data.client.phone)) {
    const { error: crmError } = await supabase.from('clients').update({
      title: parsed.data.client.title || null,
      phone: parsed.data.client.phone || null,
    }).eq('id', created.client_id);
    if (crmError) crmWarning = 'The person and project were created, but the optional title or phone could not be saved.';
  }

  if (invitation) {
    const delivery = await sendTrackedClientInvitation({ admin, clientId: created.client_id, projectId: created.project_id,
      authUserId: clientAuthUserId, ...invitation, type: 'invite', to: email, clientName: fullName, projectName: parsed.data.projectName });
    if (!delivery.ok) return completed({ projectId: created.project_id, projectName: parsed.data.projectName, invitationStatus: delivery.deliveryState, warning: [delivery.error, crmWarning].filter(Boolean).join(' ') });
  }
  return completed({ projectId: created.project_id, projectName: parsed.data.projectName, invitationStatus: invitation ? 'sent' : 'not_requested', ...(crmWarning ? { warning: crmWarning } : {}) });
  } catch {
    if (created) return completed({ projectId: created.project_id, projectName: parsed.data.projectName, invitationStatus: 'unknown', warning: 'The project was created, but invitation delivery could not be confirmed. Check its history before resending.' });
    return NextResponse.json({ error: 'The creation result could not be confirmed. Retry this same request; do not start another project.' }, { status: 409 });
  }
}
