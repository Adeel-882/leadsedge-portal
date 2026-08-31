import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { getUnreadCounts } from '@/lib/queries';

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  return NextResponse.json(await getUnreadCounts(viewer));
}
