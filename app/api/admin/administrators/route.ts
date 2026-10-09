import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasEmailEnv, hasServiceRoleEnv, isDemoMode } from '@/lib/env';
import { administratorInvitationSchema, type AdministratorEntry } from '@/lib/administrator-invitations';
import { deliverAdministratorInvitation } from '@/lib/administrator-invitation-service';
import { isAdministratorMutation } from '@/lib/administrator-mutation-origin';

export async function GET() {
  if (!await requireApiRole('admin')) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  if (!supabase || isDemoMode()) return NextResponse.json({ administrators: [], invitations: [], available: false, error: 'Administrator management requires the staging backend.' });
  const [users, invitations] = await Promise.all([
    supabase.from('users').select('id,full_name,email,created_at').eq('role', 'admin').order('created_at'),
    supabase.from('administrator_invitations').select('id,full_name,email,status,created_at,expires_at,invited_by,accepted_by,accepted_at,delivery_status').order('created_at', { ascending: false }).limit(500),
  ]);
  if (users.error) return NextResponse.json({ error: 'Administrators could not be loaded.' }, { status: 503 });
  const names = new Map((users.data || []).map(user => [user.id, user.full_name]));
  const administrators: AdministratorEntry[] = (users.data || []).map(user => {
    const accepted = invitations.data?.find(invite => invite.status === 'accepted' && invite.accepted_by === user.id);
    return { id: user.id, fullName: user.full_name, email: user.email, status: 'Active', addedAt: accepted?.accepted_at || user.created_at, invitedBy: accepted ? names.get(accepted.invited_by) || 'Administrator' : null };
  });
  return NextResponse.json({ administrators, available: !invitations.error,
    invitations: (invitations.data || []).filter(invite => ['pending', 'expired'].includes(invite.status)).map(invite => ({
      id: invite.id, fullName: invite.full_name, email: invite.email,
      status: invite.status === 'expired' || new Date(invite.expires_at).getTime() <= Date.now() ? 'Expired' : 'Pending',
      addedAt: invite.created_at, invitedBy: names.get(invite.invited_by) || 'Administrator', deliveryFailed: invite.delivery_status === 'failed',
    })), ...(invitations.error ? { error: 'Administrator invitations are not available yet. The database migration requires approval.' } : {}),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (!isAdministratorMutation(request)) return NextResponse.json({ error: 'Same-origin JSON request required.' }, { status: 403 });
  const parsed = administratorInvitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid name and email address.' }, { status: 400 });
  if (isDemoMode() || !hasEmailEnv() || !hasServiceRoleEnv()) return NextResponse.json({ error: 'Administrator invitation delivery is not configured.' }, { status: 503 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
  const { data, error } = await supabase.rpc('prepare_administrator_invitation', { full_name_input: parsed.data.fullName, email_input: parsed.data.email });
  const invitation = Array.isArray(data) ? data[0] : data;
  if (error || !invitation?.id) return NextResponse.json({ error: error?.code === '23505' ? 'This email already belongs to an account or pending invitation.' : 'The invitation could not be prepared. Confirm the approved migration is installed.' }, { status: error?.code === '23505' ? 409 : 503 });
  const delivered = await deliverAdministratorInvitation(invitation, viewer.id);
  return NextResponse.json(delivered ? { message: 'Administrator invitation sent.' } : { error: 'Invitation saved, but delivery failed. Refresh the list and resend.' }, { status: delivered ? 201 : 502 });
}
