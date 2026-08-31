import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthorizedClientTask } from '@/lib/client-access';

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const viewer = await requireApiRole('client');
  if (!viewer) return NextResponse.json({ error: 'Client access required.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { taskId } = await params;
  if (!await getAuthorizedClientTask(viewer.id, taskId)) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.rpc('complete_project_task', { target_task_id: taskId });
  if (error) return NextResponse.json({ error: 'This task is not available for completion.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
