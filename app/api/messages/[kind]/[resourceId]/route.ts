import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { messageSchema } from '@/lib/validation';

export async function POST(request: Request, { params }: { params: Promise<{ kind: string; resourceId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Sign in to send a message.' }, { status: 401 });
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Write a message between 1 and 5,000 characters.' }, { status: 400 });
  const { kind, resourceId } = await params;
  if (kind !== 'task' && kind !== 'project') return NextResponse.json({ error: 'Invalid conversation.' }, { status: 404 });
  if (isDemoMode()) return NextResponse.json({ message: { id: crypto.randomUUID(), senderId: viewer.id, senderName: viewer.fullName, senderRole: viewer.role, body: parsed.data.body, attachmentUrl: parsed.data.attachmentUrl || null, createdAt: new Date().toISOString() } }, { status: 201 });
  const supabase = await createSupabaseServerClient();
  const threadTable = kind === 'task' ? 'task_threads' : 'project_threads';
  const resourceField = kind === 'task' ? 'task_id' : 'project_id';
  const { data: thread, error: threadError } = await supabase!.from(threadTable).select('id').eq(resourceField, resourceId).single();
  if (threadError || !thread) return NextResponse.json({ error: 'Conversation is unavailable.' }, { status: 404 });
  const insertResult = kind === 'task'
    ? await supabase!.from('task_messages').insert({ task_id: resourceId, thread_id: thread.id, sender_id: viewer.id, body: parsed.data.body, attachment_url: parsed.data.attachmentUrl || null }).select('id,created_at').single()
    : await supabase!.from('project_messages').insert({ project_id: resourceId, thread_id: thread.id, sender_id: viewer.id, body: parsed.data.body, attachment_url: parsed.data.attachmentUrl || null }).select('id,created_at').single();
  const { data: saved, error } = insertResult;
  if (error || !saved) return NextResponse.json({ error: 'Message could not be sent.' }, { status: 500 });
  return NextResponse.json({ message: { id: saved.id, senderId: viewer.id, senderName: viewer.fullName, senderRole: viewer.role, body: parsed.data.body, attachmentUrl: parsed.data.attachmentUrl || null, createdAt: saved.created_at } }, { status: 201 });
}
