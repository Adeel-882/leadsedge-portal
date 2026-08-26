import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formSubmissionSchema } from '@/lib/validation';

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const viewer = await requireApiRole('client');
  if (!viewer) return NextResponse.json({ error: 'Client access required.' }, { status: 403 });
  const parsed = formSubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'The form response is invalid.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { taskId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase!.rpc('submit_form_task', { target_task_id: taskId, submitted_answers: parsed.data.answers });
  if (error) return NextResponse.json({ error: 'This form is no longer available.' }, { status: 400 });
  return NextResponse.json({ submissionId: data }, { status: 201 });
}
