import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { templateImportSchema } from '@/lib/validation';
import { initialLeadDetails, isLeadAssignmentTemplate } from '@/lib/lead-details-copy';

export async function POST(request: Request) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = templateImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a template and at least one task.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ imported: parsed.data.templateTaskIds.length }, { status: 201 });
  const supabase = await createSupabaseServerClient();
  // Never trust a caller's initialStatus: import is preparation, not publication.
  const { data, error } = await supabase!.rpc('import_template_tasks', { target_project_id: parsed.data.projectId, target_template_id: parsed.data.templateId, selected_template_task_ids: parsed.data.templateTaskIds, initial_task_status: 'draft' });
  if (error) return NextResponse.json({ error: 'Tasks could not be imported.' }, { status: 500 });
  if (data?.length) {
    const { data: drafts, error: readError } = await supabase!.from('project_tasks')
      .select('id,description,template:template_tasks(template:templates(name))')
      .in('id', data).eq('project_id', parsed.data.projectId).eq('status', 'draft');
    let initializationFailed = Boolean(readError);
    for (const draft of drafts || []) {
      if (!isLeadAssignmentTemplate(draft.template)) continue;
      const description = initialLeadDetails(draft.description || '');
      if (description === draft.description) continue;
      const { error: saveError } = await supabase!.from('project_tasks').update({ description })
        .eq('id', draft.id).eq('status', 'draft').eq('description', draft.description);
      initializationFailed ||= Boolean(saveError);
    }
    // The RPC already committed; never tell the UI to retry and duplicate the import.
    if (initializationFailed) return NextResponse.json({ imported: data.length, warning: 'Drafts imported. Default lead text could not be initialized. Open the drafts to enter details; do not import again.' }, { status: 201 });
  }
  return NextResponse.json({ imported: data?.length || 0 }, { status: 201 });
}
