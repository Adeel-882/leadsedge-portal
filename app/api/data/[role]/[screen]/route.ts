import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { allowedScreen, loadScreen } from '@/lib/screen-data';
export async function GET(request: Request, { params }: { params: Promise<{ role: string; screen: string }> }) {
  const viewer = await getViewer();
  const { role, screen } = await params;
  if (!viewer) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  if (viewer.role !== role || request.headers.get('x-cache-viewer') !== viewer.id) return NextResponse.json({ error: 'Your account has changed. Reload this page.' }, { status: 403 });
  if (!allowedScreen(viewer.role, screen)) return NextResponse.json({ error: 'Unavailable screen.' }, { status: 404 });
  const url = new URL(request.url);
  const args = screen === 'people' ? [(url.searchParams.get('q') || '').trim().slice(0,160), String(Math.max(1, Math.min(10000, Number(url.searchParams.get('page')) || 1)))] : screen === 'task' ? [url.searchParams.get('id') || ''] : [];
  try {
    const data = await loadScreen(viewer.role, screen, args);
    if (data === null) return NextResponse.json({ error: 'This item is no longer available.' }, { status: 404 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Unable to load data. Please retry.' }, { status: 500 }); }
}
