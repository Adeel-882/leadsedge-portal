import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/env';
import { inboxRemovalEnabled, inboxVisibilitySchema } from '@/lib/inbox-visibility';
import { resolveRequestOrigin } from '@/lib/request-origin';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  if (!await requireApiRole('admin')) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (!origin || origin !== resolveRequestOrigin(request) || (site && site !== 'same-origin') || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return NextResponse.json({ error: 'Same-origin JSON request required.' }, { status: 403 });
  }
  if (!inboxRemovalEnabled() || isDemoMode()) return NextResponse.json({ error: 'Inbox removal is not enabled for this environment.' }, { status: 503 });
  const body = await request.text();
  if (body.length > 12000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(body); } catch { input = null; }
  const parsed = inboxVisibilitySchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: 'Choose between 1 and 100 conversations.' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Messaging is unavailable.' }, { status: 503 });
  const { error } = await supabase.rpc('set_own_inbox_visibility', {
    project_ids: parsed.data.projectIds, task_ids: parsed.data.taskIds, hide: parsed.data.hide,
  });
  if (error) return NextResponse.json({ error: 'Unable to update your inbox. Please retry.' }, { status: error.code === '42501' ? 403 : 503 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
