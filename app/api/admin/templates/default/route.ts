import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Restores the product's canonical Lead Assignment workflow.
 *
 * seed_default_template() has always defined it, but its only caller was
 * setup_first_admin(), which runs once and then refuses forever. Any project
 * whose administrator was provisioned another way — a seeded staging
 * environment, a restored database, a manually promoted user — therefore had no
 * reachable path to the default workflow, and /admin/templates stayed empty
 * with no way out.
 *
 * The function is idempotent: it returns the existing template when one is
 * already named Lead Assignment, and adds its task only when the template has
 * none. Calling this twice cannot create a duplicate.
 */
export async function POST() {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ error: 'Templates cannot be restored in demo mode.' }, { status: 503 });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration is unavailable.' }, { status: 503 });

  // SECURITY DEFINER, but it re-checks is_admin() itself, so the route guard and
  // the database guard have to agree before anything is written.
  const { data, error } = await supabase.rpc('seed_default_template');
  if (error) {
    console.warn('[templates] Default workflow could not be restored.', JSON.stringify({ code: error.code || 'unknown' }));
    return NextResponse.json({ error: 'The default workflow could not be restored.' }, { status: 500 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
