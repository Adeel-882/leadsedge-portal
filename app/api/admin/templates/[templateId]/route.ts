import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({ action: z.enum(['duplicate', 'archive']) });
const updateSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000) });

export async function PATCH(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter valid template details.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { templateId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.from('templates').update(parsed.data).eq('id', templateId);
  return error ? NextResponse.json({ error: 'Template could not be saved.' }, { status: 500 }) : NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid template action.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { templateId } = await params;
  const supabase = await createSupabaseServerClient();
  if (parsed.data.action === 'archive') {
    const { error } = await supabase!.from('templates').update({ archived_at: new Date().toISOString() }).eq('id', templateId);
    return error ? NextResponse.json({ error: 'Template could not be archived.' }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  const { data: source, error } = await supabase!.from('templates').select('name,description,template_tasks(title,description,task_type,sort_order,client_visible,requires_completion,form_schema)').eq('id', templateId).single();
  if (error || !source) return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  const { data: copy, error: copyError } = await supabase!.from('templates').insert({ name: `${source.name} copy`, description: source.description, created_by: viewer.id }).select('id').single();
  if (copyError || !copy) return NextResponse.json({ error: 'Template could not be duplicated.' }, { status: 500 });
  if (source.template_tasks?.length) await supabase!.from('template_tasks').insert(source.template_tasks.map((task) => ({ ...task, template_id: copy.id })));
  return NextResponse.json({ id: copy.id }, { status: 201 });
}
