import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { taskId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.rpc('request_feedback_now', { target_task_id: taskId });
  if (error) return NextResponse.json({ error: 'Feedback could not be requested. Confirm the lead is completed and the form is configured.' }, { status: 400 });
  // Durable automation work (notifications, email_outbox rows) is committed by
  // the statements above. Draining the outbox is the cron processor's job at
  // /api/cron/automation; doing it inline made the user wait on Supabase round
  // trips and Resend delivery before this response returned.
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { taskId } = await params; const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.rpc('cancel_feedback_request', { target_task_id: taskId });
  if (error) return NextResponse.json({ error: 'There is no cancellable feedback request.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
