import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { getCachedAvailableSlots } from '@/lib/meetings';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthorizedClientProject } from '@/lib/client-access';

export async function GET(request: Request) {
  const viewer = await requireApiRole('client');
  if (!viewer) return NextResponse.json({ error: 'Client access required.' }, { status: 403 });
  const url = new URL(request.url); const projectId = url.searchParams.get('projectId'); const date = url.searchParams.get('date');
  if (!projectId || !date) return NextResponse.json({ error: 'Project and date are required.' }, { status: 400 });
  const project = await getAuthorizedClientProject(viewer.id, projectId, true);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const [availability, ownerResult] = await Promise.all([
      getCachedAvailableSlots(project.ownerId, date),
      createSupabaseAdminClient()!.from('users').select('full_name,admin_settings(display_name)').eq('id', project.ownerId).single(),
    ]);
    const owner = ownerResult.data;
    const settings = Array.isArray(owner?.admin_settings) ? owner.admin_settings[0] : owner?.admin_settings;
    return NextResponse.json({ ...availability, ownerName: settings?.display_name || owner?.full_name || 'Administrator' });
  }
  catch { return NextResponse.json({ error: 'Availability could not be checked. The calendar connection may need attention.' }, { status: 502 }); }
}
