import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { getAdminMessageInbox } from '@/lib/queries';

export async function GET() {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  return NextResponse.json({ conversations: await getAdminMessageInbox() });
}
