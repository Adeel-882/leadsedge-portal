import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { templateImportSchema } from '@/lib/validation';

export async function POST(request: Request) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = templateImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a template and at least one task.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ imported: parsed.data.templateTaskIds.length }, { status: 201 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase!.rpc('import_template_tasks', { target_project_id: parsed.data.projectId, target_template_id: parsed.data.templateId, selected_template_task_ids: parsed.data.templateTaskIds, initial_task_status: parsed.data.initialStatus });
  if (error) return NextResponse.json({ error: 'Tasks could not be imported.' }, { status: 500 });
  return NextResponse.json({ imported: data?.length || 0 }, { status: 201 });
}
