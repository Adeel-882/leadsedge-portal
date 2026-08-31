import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.from('calendar_connections').delete().eq('user_id', viewer.id);
  if (error) return NextResponse.json({ error: 'Calendar could not be disconnected.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
