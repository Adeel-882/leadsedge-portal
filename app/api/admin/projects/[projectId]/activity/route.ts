import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { getProjectActivity } from '@/lib/project-activity';

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!await requireApiRole('admin')) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: 'Invalid project.' }, { status: 400 });
  try {
    return NextResponse.json(await getProjectActivity(projectId, new URL(request.url).searchParams.get('before')), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Could not load project activity.' }, { status: 400 }); }
}
