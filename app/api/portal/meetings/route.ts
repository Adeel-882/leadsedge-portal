import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { createGoogleMeetingEvent } from '@/lib/calendar';
import { getAvailability, getAvailableSlots } from '@/lib/meetings';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { meetingCreateSchema } from '@/lib/validation';
import { getAuthorizedClientProject } from '@/lib/client-access';

function dateInZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function POST(request: Request) {
  const viewer = await requireApiRole('client');
  if (!viewer) return NextResponse.json({ error: 'Client access required.' }, { status: 403 });
  const parsed = meetingCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid meeting time.' }, { status: 400 });
  const project = await getAuthorizedClientProject(viewer.id, parsed.data.projectId, true);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  try {
    const savedSettings = await getAvailability(project.ownerId);
    if (!savedSettings) return NextResponse.json({ error: 'Scheduling is not configured for this project.' }, { status: 409 });
    const availability = await getAvailableSlots(project.ownerId, dateInZone(parsed.data.startAt, savedSettings.timezone));
    if (!availability.settings || !availability.slots.some((slot) => slot.startAt === parsed.data.startAt)) return NextResponse.json({ error: 'That time is no longer available. Choose another slot.' }, { status: 409 });
    const meetingTitle = `Leadsedge Portal — ${project.projectName}`;
    const { data: meeting, error } = await supabase!.rpc('book_client_meeting', { target_project_id: parsed.data.projectId, requested_start: parsed.data.startAt, requested_timezone: availability.settings.timezone, meeting_title: meetingTitle, meeting_description: 'Project meeting scheduled through Leadsedge Portal.' });
    if (error || !meeting) return NextResponse.json({ error: error?.message.includes('just booked') ? 'That time was just booked. Choose another slot.' : 'The meeting could not be booked.' }, { status: 409 });
    const { data: client } = await supabase!.from('clients').select('email,full_name').eq('auth_user_id', viewer.id).single();
    try {
      const event = await createGoogleMeetingEvent(project.ownerId, { title: meeting.title, description: `Client: ${client?.full_name || viewer.fullName}\nProject: ${project.projectName}\nView details in Leadsedge Portal.`, startAt: meeting.start_at, endAt: meeting.end_at, timezone: meeting.timezone, clientEmail: client?.email || viewer.email });
      if (event) await createSupabaseAdminClient()!.from('meetings').update({ google_event_id: event.id, google_event_html_link: event.htmlLink }).eq('id', meeting.id);
    } catch {
      await createSupabaseAdminClient()!.from('automation_runs').insert({ job_type: 'calendar.event.create', resource_type: 'meeting', resource_id: meeting.id, dedupe_key: `calendar-create:${meeting.id}`, status: 'failed', error_message: 'Google Calendar event creation failed after the internal booking succeeded.', completed_at: new Date().toISOString() });
    }
  // Durable automation work (notifications, email_outbox rows) is committed by
  // the statements above. Draining the outbox is the cron processor's job at
  // /api/cron/automation; doing it inline made the user wait on Supabase round
  // trips and Resend delivery before this response returned.
    return NextResponse.json({ ok: true, meetingId: meeting.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The meeting could not be booked.' }, { status: 400 });
  }
}
