import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { availabilitySchema } from '@/lib/validation';

export async function PATCH(request: Request) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = availabilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid availability.' }, { status: 400 });
  for (const rule of parsed.data.rules) if (rule.enabled && rule.endTime <= rule.startTime) return NextResponse.json({ error: 'Each enabled day must end after it starts.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ ok: true });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase!.rpc('save_availability', { timezone_input: parsed.data.timezone, duration_input: parsed.data.meetingDurationMinutes, buffer_input: parsed.data.bufferMinutes, notice_input: parsed.data.minimumNoticeMinutes, advance_input: parsed.data.maximumAdvanceDays, rules_input: parsed.data.rules });
  if (error) return NextResponse.json({ error: error.message.includes('timezone') ? 'Choose a valid timezone.' : 'Availability could not be saved.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
