import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { sanitizeTaskDescription } from '@/lib/queries';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({ title: z.string().trim().min(2).max(180), description: z.string().max(40000), taskType: z.enum(['standard', 'form']), clientVisible: z.boolean(), requiresCompletion: z.boolean(), formSchema: z.array(z.object({ id: z.string(), label: z.string(), type: z.enum(['text', 'textarea', 'radio']), required: z.boolean().optional(), options: z.array(z.string()).optional() })).nullable() });

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter valid task details.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID() }, { status: 201 });
  const { templateId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase!.from('template_tasks').select('sort_order').eq('template_id', templateId).order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase!.from('template_tasks').insert({ template_id: templateId, title: parsed.data.title, description: sanitizeTaskDescription(parsed.data.description), task_type: parsed.data.taskType, sort_order: (last?.sort_order || 0) + 1, client_visible: parsed.data.clientVisible, requires_completion: parsed.data.requiresCompletion, form_schema: parsed.data.taskType === 'form' ? parsed.data.formSchema : null }).select('id').single();
  if (error || !data) return NextResponse.json({ error: 'Template task could not be created.' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
