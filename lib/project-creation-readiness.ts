import type { SupabaseClient } from '@supabase/supabase-js';

export async function projectCreationReady(supabase: SupabaseClient, admin: SupabaseClient) {
  try {
    const { data, error } = await supabase.rpc('project_creation_readiness', {}, { get: true });
    if (error || data !== true) return false;
    return await invitationTrackingReady(admin);
  } catch { return false; }
}

export async function invitationTrackingReady(admin: SupabaseClient) {
  try {
    const table = await admin.from('client_invitation_attempts').select('id').limit(0);
    if (table.error) return false;
    // Verify PostgREST has refreshed its RPC routes, not just PostgreSQL catalogs.
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: 'application/openapi+json' },
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const schema = await response.json() as { paths?: Record<string, unknown> };
    return ['prepare_client_invitation_attempt', 'finish_client_invitation_delivery', 'record_client_invitation_sign_in']
      .every(name => Boolean(schema.paths?.[`/rpc/${name}`]));
  } catch { return false; }
}
