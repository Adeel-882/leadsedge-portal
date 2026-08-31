import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function PATCH() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', viewer.id).is('read_at', null);
  if (error) return NextResponse.json({ error: 'Notifications could not be updated.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
