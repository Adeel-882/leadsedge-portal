import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { sanitizeTaskDescription } from '@/lib/queries';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const updateSchema = z.object({ title: z.string().trim().min(2).max(180), description: z.string().max(40000), taskType: z.enum(['standard', 'form']), clientVisible: z.boolean(), requiresCompletion: z.boolean(), formSchema: z.array(z.object({ id: z.string(), label: z.string(), type: z.enum(['text', 'textarea', 'radio']), required: z.boolean().optional(), options: z.array(z.string()).optional() })).nullable() });
const orderSchema = z.object({ action: z.enum(['up', 'down']) });

export async function PATCH(request: Request, { params }: { params: Promise<{ templateId: string; taskId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter valid task details.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { templateId, taskId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.from('template_tasks').update({ title: parsed.data.title, description: sanitizeTaskDescription(parsed.data.description), task_type: parsed.data.taskType, client_visible: parsed.data.clientVisible, requires_completion: parsed.data.requiresCompletion, form_schema: parsed.data.taskType === 'form' ? parsed.data.formSchema : null }).eq('id', taskId).eq('template_id', templateId);
  return error ? NextResponse.json({ error: 'Template task could not be saved.' }, { status: 500 }) : NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string; taskId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid reorder action.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { templateId, taskId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase!.from('template_tasks').select('id,sort_order').eq('id', taskId).eq('template_id', templateId).single();
  if (!current) return NextResponse.json({ error: 'Template task not found.' }, { status: 404 });
  const neighborQuery = supabase!.from('template_tasks').select('id,sort_order').eq('template_id', templateId);
  const { data: neighbor } = parsed.data.action === 'up' ? await neighborQuery.lt('sort_order', current.sort_order).order('sort_order', { ascending: false }).limit(1).maybeSingle() : await neighborQuery.gt('sort_order', current.sort_order).order('sort_order').limit(1).maybeSingle();
  if (!neighbor) return NextResponse.json({ ok: true });
  const temporary = -Math.abs(current.sort_order) - 10000;
  await supabase!.from('template_tasks').update({ sort_order: temporary }).eq('id', current.id);
  await supabase!.from('template_tasks').update({ sort_order: current.sort_order }).eq('id', neighbor.id);
  await supabase!.from('template_tasks').update({ sort_order: neighbor.sort_order }).eq('id', current.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ templateId: string; taskId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const { templateId, taskId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.from('template_tasks').delete().eq('id', taskId).eq('template_id', templateId);
  return error ? NextResponse.json({ error: 'Template task could not be deleted.' }, { status: 500 }) : NextResponse.json({ ok: true });
}
