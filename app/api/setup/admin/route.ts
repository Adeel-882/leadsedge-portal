import { NextResponse } from 'next/server';
import { administratorExists, getViewerWithContact } from '@/lib/auth';
import { hasServiceRoleEnv, isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { profileSchema } from '@/lib/validation';

export async function POST(request: Request) {
  if (isDemoMode()) return NextResponse.json({ error: 'Connect Supabase before administrator setup.' }, { status: 400 });
  if (!hasServiceRoleEnv()) return NextResponse.json({ error: 'Supabase server configuration is incomplete.' }, { status: 503 });
  const adminExists = await administratorExists();
  if (adminExists === null) return NextResponse.json({ error: 'Administrator setup could not be verified.' }, { status: 503 });
  if (adminExists) return NextResponse.json({ error: 'An administrator already exists.' }, { status: 409 });
  const viewer = await getViewerWithContact();
  if (!viewer) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid display name and timezone.' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.rpc('setup_first_admin', { display_name: parsed.data.displayName, admin_timezone: parsed.data.timezone });
  if (error) return NextResponse.json({ error: error.message.includes('already exists') ? 'An administrator already exists.' : 'Administrator setup failed.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
