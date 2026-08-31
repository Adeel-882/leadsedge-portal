import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { projectDeleteSchema } from '@/lib/validation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = projectDeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter the exact project name to confirm deletion.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ projectDeleted: true, clientDeleted: parsed.data.deleteClient });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server database credentials are not configured.' }, { status: 503 });
  const { projectId } = await params;
  const { data, error } = await admin.rpc('delete_project_bundle_admin', {
    target_project_id: projectId,
    delete_client: parsed.data.deleteClient,
    expected_project_name: parsed.data.projectName,
    requesting_admin_id: viewer.id,
  }).single();
  if (error || !data) {
    const message = error?.message.includes('another project')
      ? 'This client belongs to another project. Delete only this project instead.'
      : 'The project could not be deleted. Check the confirmation name and try again.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const deleted = data as { project_deleted: boolean; client_deleted: boolean };
  return NextResponse.json({ projectDeleted: deleted.project_deleted, clientDeleted: deleted.client_deleted });
}
