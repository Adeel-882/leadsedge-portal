import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const viewer = await requireApiRole('client');
  if (!viewer) return NextResponse.json({ error: 'Client access required.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { taskId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.rpc('complete_project_task', { target_task_id: taskId });
  if (error) return NextResponse.json({ error: 'This task is not available for completion.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
