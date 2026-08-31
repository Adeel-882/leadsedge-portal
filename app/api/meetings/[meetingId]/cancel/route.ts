import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { deleteGoogleMeetingEvent } from '@/lib/calendar';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { meetingCancelSchema } from '@/lib/validation';
import { getAuthorizedClientMeeting } from '@/lib/client-access';

export async function POST(request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = meetingCancelSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid cancellation.' }, { status: 400 });
  const { meetingId } = await params;
  if (viewer.role === 'client' && !await getAuthorizedClientMeeting(viewer.id, meetingId)) return NextResponse.json({ error: 'Meeting not found.' }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: meeting, error } = await supabase!.rpc('cancel_meeting', { target_meeting_id: meetingId, reason_input: parsed.data.reason });
  if (error || !meeting) return NextResponse.json({ error: 'This meeting cannot be cancelled.' }, { status: 400 });
  if (meeting.google_event_id) {
    try { await deleteGoogleMeetingEvent(meeting.owner_id, meeting.google_event_id); } catch { /* Internal cancellation remains authoritative. */ }
  }
  // Durable automation work (notifications, email_outbox rows) is committed by
  // the statements above. Draining the outbox is the cron processor's job at
  // /api/cron/automation; doing it inline made the user wait on Supabase round
  // trips and Resend delivery before this response returned.
  return NextResponse.json({ ok: true, destination: viewer.role === 'admin' ? '/admin/meetings' : '/portal/meetings' });
}
