import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasEmailEnv, hasServiceRoleEnv, isDemoMode } from '@/lib/env';
import { administratorInvitationActionSchema, invitationIdSchema } from '@/lib/administrator-invitations';
import { deliverAdministratorInvitation } from '@/lib/administrator-invitation-service';
import { isAdministratorMutation } from '@/lib/administrator-mutation-origin';

export async function POST(request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (!isAdministratorMutation(request)) return NextResponse.json({ error: 'Same-origin JSON request required.' }, { status: 403 });
  const id = invitationIdSchema.safeParse((await params).invitationId);
  const parsed = administratorInvitationActionSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success) return NextResponse.json({ error: 'Invalid invitation action.' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase || isDemoMode()) return NextResponse.json({ error: 'Administrator management is unavailable.' }, { status: 503 });
  if (parsed.data.action === 'revoke') {
    const { error } = await supabase.rpc('revoke_administrator_invitation', { invitation_id: id.data });
    return NextResponse.json(error ? { error: 'Invitation could not be revoked. Refresh and try again.' } : { message: 'Invitation revoked.' }, { status: error ? 409 : 200 });
  }
  if (!hasEmailEnv() || !hasServiceRoleEnv()) return NextResponse.json({ error: 'Invitation delivery is not configured.' }, { status: 503 });
  const { data: previous, error: readError } = await supabase.from('administrator_invitations').select('full_name,email').eq('id', id.data).maybeSingle();
  if (readError || !previous) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  const { data, error } = await supabase.rpc('prepare_administrator_invitation', { full_name_input: previous.full_name, email_input: previous.email, previous_id: id.data });
  const invitation = Array.isArray(data) ? data[0] : data;
  if (error || !invitation?.id) return NextResponse.json({ error: 'Cannot resend this invitation. It may have changed, or was sent less than a minute ago.' }, { status: 409 });
  const delivered = await deliverAdministratorInvitation(invitation, viewer.id);
  return NextResponse.json(delivered ? { message: 'A fresh invitation was sent. The previous invitation is revoked.' } : { error: 'Delivery failed. Refresh and retry.' }, { status: delivered ? 200 : 502 });
}
