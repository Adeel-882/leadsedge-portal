import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { getUnreadCounts } from '@/lib/queries';

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (request.headers.get('x-cache-viewer') && request.headers.get('x-cache-viewer') !== viewer.id) return NextResponse.json({ error: 'Account changed.' }, { status: 403 });
  return NextResponse.json(await getUnreadCounts(viewer));
}
