import { getViewer } from './auth';
import { createSupabaseAdminClient } from './supabase/admin';
import { createSupabaseServerClient } from './supabase/server';
import type { ClientInvitationAttempt } from './client-invitation-status';

export type InvitationOverview = {
  attempt: ClientInvitationAttempt | null;
  legacy: { id: string; status: string; created_at: string } | null;
  lastLogin: string | null;
  unavailable: boolean;
};

/** Request-scoped only: no shared cache, no polling, no client exposure. */
export async function getClientInvitationOverview(projectId: string, clientId: string): Promise<InvitationOverview> {
  const result: InvitationOverview = { attempt: null, legacy: null, lastLogin: null, unavailable: false };
  try {
    const viewer = await getViewer();
    if (viewer?.role !== 'admin') return { ...result, unavailable: true };
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ...result, unavailable: true };
    const [attempts, legacy, client] = await Promise.allSettled([
      supabase.from('client_invitation_attempts').select('id,created_at,expires_at,delivery_status,sent_at,signed_in_at,email_delivery_id')
        .eq('project_id', projectId).eq('client_id', clientId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('email_deliveries').select('id,status,created_at').eq('project_id', projectId).eq('client_id', clientId)
        .eq('email_type', 'client_invitation').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('clients').select('auth_user_id').eq('id', clientId).maybeSingle(),
    ]);
    if (attempts.status === 'fulfilled' && !attempts.value.error) result.attempt = attempts.value.data as ClientInvitationAttempt | null;
    else result.unavailable = true;
    if (legacy.status === 'fulfilled' && !legacy.value.error) result.legacy = legacy.value.data;
    if (client.status === 'fulfilled' && !client.value.error && client.value.data?.auth_user_id) {
      const admin = createSupabaseAdminClient();
      if (admin) {
        const { data, error } = await admin.auth.admin.getUserById(client.value.data.auth_user_id);
        if (!error) result.lastLogin = data.user?.last_sign_in_at || null;
      }
    }
    return result;
  } catch {
    return { ...result, unavailable: true };
  }
}
