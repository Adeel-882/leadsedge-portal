import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function PATCH(_request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { notificationId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId).eq('user_id', viewer.id);
  if (error) return NextResponse.json({ error: 'Notification could not be updated.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
