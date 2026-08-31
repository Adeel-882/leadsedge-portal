import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { sanitizeTaskDescription } from '@/lib/queries';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { leadFeedbackForm } from '@/lib/demo-data';

const schema = z.object({ projectId: z.string().uuid(), title: z.string().trim().min(2).max(180), description: z.string().max(40000), assigneeId: z.string().uuid().nullable(), clientVisible: z.boolean(), requiresCompletion: z.boolean(), status: z.enum(['draft', 'active']) });
export async function POST(request: Request) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid task.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID() }, { status: 201 });
  const supabase = await createSupabaseServerClient();
  if (parsed.data.assigneeId) {
    const { data: membership } = await supabase!.from('project_clients').select('client_id').eq('project_id', parsed.data.projectId).eq('client_id', parsed.data.assigneeId).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'The selected assignee does not belong to this project.' }, { status: 400 });
  }
  const { data: task, error } = await supabase!.from('project_tasks').insert({ project_id: parsed.data.projectId, title: parsed.data.title, description: sanitizeTaskDescription(parsed.data.description), task_type: 'standard', assignee_id: parsed.data.assigneeId, client_visible: parsed.data.clientVisible, requires_completion: parsed.data.requiresCompletion, status: parsed.data.status, activated_at: parsed.data.status === 'active' ? new Date().toISOString() : null, form_schema: leadFeedbackForm, feedback_enabled: true, feedback_delay_value: 1, feedback_delay_unit: 'days', feedback_state: 'pending' }).select('id').single();
  if (error || !task) return NextResponse.json({ error: 'Task could not be created.' }, { status: 500 });
  await supabase!.from('task_threads').insert({ task_id: task.id });
  await supabase!.from('task_activity').insert({ task_id: task.id, actor_id: viewer.id, event_type: 'task.created', body: 'created this task' });
  return NextResponse.json({ id: task.id }, { status: 201 });
}
