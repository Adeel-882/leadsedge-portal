import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { profileSchema } from '@/lib/validation';

export async function PATCH(request: Request) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid display name and timezone.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const supabase = await createSupabaseServerClient();
  const [{ error: profileError }, { error: settingsError }] = await Promise.all([
    supabase!.from('users').update({ full_name: parsed.data.displayName }).eq('id', viewer.id),
    supabase!.from('admin_settings').upsert({ user_id: viewer.id, display_name: parsed.data.displayName, timezone: parsed.data.timezone, ...(parsed.data.notificationPreferences ? { notification_preferences: parsed.data.notificationPreferences } : {}) }, { onConflict: 'user_id' }),
  ]);
  if (profileError || settingsError) return NextResponse.json({ error: 'Settings could not be saved.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
