import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { sanitizeTaskDescription } from '@/lib/queries';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { taskUpdateSchema } from '@/lib/validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = taskUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid task update.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { taskId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: current, error: loadError } = await supabase!.from('project_tasks').select('project_id,status,assignee_id,title').eq('id', taskId).single();
  if (loadError || !current) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  const now = new Date().toISOString();
  const { error } = await supabase!.from('project_tasks').update({ title: parsed.data.title, description: sanitizeTaskDescription(parsed.data.description), assignee_id: parsed.data.assigneeId, client_visible: parsed.data.clientVisible, requires_completion: parsed.data.requiresCompletion, status: parsed.data.status, due_at: parsed.data.dueAt, activated_at: parsed.data.status === 'active' && current.status === 'draft' ? now : undefined, completed_at: parsed.data.status === 'completed' && current.status !== 'completed' ? now : parsed.data.status !== 'completed' ? null : undefined }).eq('id', taskId);
  if (error) return NextResponse.json({ error: 'Task could not be saved.' }, { status: 500 });
  if (current.assignee_id !== parsed.data.assigneeId && parsed.data.assigneeId) await supabase!.from('task_activity').insert({ task_id: taskId, actor_id: viewer.id, event_type: 'task.assigned', body: 'updated the task assignee' });
  if (current.status !== parsed.data.status) {
    await supabase!.from('task_activity').insert({ task_id: taskId, actor_id: viewer.id, event_type: `task.${parsed.data.status}`, body: `${parsed.data.status === 'active' ? 'activated' : parsed.data.status === 'completed' ? 'completed' : 'moved'} this task` });
    if (parsed.data.status === 'active' && parsed.data.assigneeId) {
      const { data: client } = await supabase!.from('clients').select('auth_user_id').eq('id', parsed.data.assigneeId).single();
      if (client?.auth_user_id) await supabase!.from('notifications').insert({ user_id: client.auth_user_id, project_id: current.project_id, task_id: taskId, type: 'task.activated', title: 'New task ready', body: `${parsed.data.title} is ready for you.` });
    }
  }
  return NextResponse.json({ ok: true });
}
