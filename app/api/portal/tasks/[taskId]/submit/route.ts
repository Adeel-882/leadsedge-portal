import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formSubmissionSchema } from '@/lib/validation';
import { answersMatchFeedbackForm, feedbackSubmissionErrorMessage } from '@/lib/feedback';
import { getAuthorizedClientTask } from '@/lib/client-access';
import { readLimitedJson, RequestBodyError } from '@/lib/request-body';

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const viewer = await requireApiRole('client');
  if (!viewer) return NextResponse.json({ error: 'Client access required.' }, { status: 403 });
  let input: unknown;
  try { input = await readLimitedJson(request); }
  catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const parsed = formSubmissionSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: 'The form response is invalid.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { taskId } = await params;
  const task = await getAuthorizedClientTask(viewer.id, taskId);
  if (!task) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  if (!answersMatchFeedbackForm(parsed.data.answers, task.formSchema)) return NextResponse.json({ error: 'One or more feedback answers are invalid.' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase!.rpc('submit_lead_feedback', { target_task_id: taskId, submitted_answers: parsed.data.answers });
  if (error) return NextResponse.json({ error: feedbackSubmissionErrorMessage(error.message) }, { status: 400 });
  // Durable automation work (notifications, email_outbox rows) is committed by
  // the statements above. Draining the outbox is the cron processor's job at
  // /api/cron/automation; doing it inline made the user wait on Supabase round
  // trips and Resend delivery before this response returned.
  return NextResponse.json({ submissionId: data }, { status: 201 });
}
