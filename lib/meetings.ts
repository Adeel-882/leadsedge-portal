import { getGoogleBusyRanges } from './calendar';
import { isDemoMode } from './env';
import { createSupabaseServerClient } from './supabase/server';
import type { AvailabilitySettings, MeetingRecord, MeetingSlot } from './types';
import { getViewer } from './auth';

export const DEFAULT_AVAILABILITY: AvailabilitySettings = {
  timezone: 'UTC', meetingDurationMinutes: 30, bufferMinutes: 15, minimumNoticeMinutes: 120, maximumAdvanceDays: 60,
  rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, enabled: weekday >= 1 && weekday <= 5, startTime: '09:00', endTime: '17:00' })),
};

type MeetingRow = {
  id: string; project_id: string; client_id: string; owner_id: string; owner_display_name: string; title: string; description: string;
  start_at: string; end_at: string; timezone: string; status: MeetingRecord['status']; google_event_html_link: string | null;
  duration_minutes: number;
  cancellation_reason: string | null; cancelled_at: string | null;
  project: { project_name: string } | { project_name: string }[] | null;
  client: { full_name: string; auth_user_id?: string | null } | { full_name: string; auth_user_id?: string | null }[] | null;
  owner: { full_name: string } | { full_name: string }[] | null;
};

function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value; }
function mapMeeting(row: MeetingRow): MeetingRecord {
  return { id: row.id, projectId: row.project_id, projectName: first(row.project)?.project_name || 'Project', clientId: row.client_id, clientName: first(row.client)?.full_name || 'Client', ownerId: row.owner_id, ownerName: row.owner_display_name || first(row.owner)?.full_name || 'Administrator', title: row.title || 'Meeting', description: row.description || '', startAt: row.start_at, endAt: row.end_at, timezone: row.timezone || 'UTC', durationMinutes: Number(row.duration_minutes || 30), status: row.status || 'scheduled', googleEventHtmlLink: row.google_event_html_link || null, cancellationReason: row.cancellation_reason || null, cancelledAt: row.cancelled_at || null };
}

const meetingSelect = 'id,project_id,client_id,owner_id,owner_display_name,title,description,start_at,end_at,timezone,duration_minutes,status,google_event_html_link,cancellation_reason,cancelled_at,project:projects(project_name),client:clients!inner(full_name,auth_user_id),owner:users!meetings_owner_id_fkey(full_name)';

export async function getMeetings(): Promise<MeetingRecord[]> {
  if (isDemoMode()) return [];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const viewer = await getViewer();
  if (!viewer) return [];
  let query = supabase.from('meetings').select(meetingSelect);
  query = viewer.role === 'admin' ? query.eq('owner_id', viewer.id) : query.eq('client.auth_user_id', viewer.id);
  const { data, error } = await query.order('start_at');
  if (error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST205' || error.message.includes('schema cache'))) return [];
  if (error) throw new Error('Unable to load meetings.');
  return ((data || []) as unknown as MeetingRow[]).map(mapMeeting);
}

export async function getNextMeeting(): Promise<MeetingRecord | null> {
  if (isDemoMode()) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const viewer = await getViewer();
  if (!viewer) return null;
  let query = supabase.from('meetings').select(meetingSelect).eq('status', 'scheduled').gte('start_at', new Date().toISOString());
  query = viewer.role === 'admin' ? query.eq('owner_id', viewer.id) : query.eq('client.auth_user_id', viewer.id);
  const { data, error } = await query.order('start_at').limit(1).maybeSingle();
  if (error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST205' || error.message.includes('schema cache'))) return null;
  if (error) throw new Error('Unable to load the next meeting.');
  return data ? mapMeeting(data as unknown as MeetingRow) : null;
}

export async function getUpcomingProjectMeetings(projectId: string): Promise<MeetingRecord[]> {
  if (isDemoMode()) return [];
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const viewer = await getViewer();
  if (!viewer) return [];
  let query = supabase.from('meetings').select(meetingSelect).eq('project_id', projectId).eq('status', 'scheduled').gte('start_at', new Date().toISOString());
  query = viewer.role === 'admin' ? query.eq('owner_id', viewer.id) : query.eq('client.auth_user_id', viewer.id);
  const { data, error } = await query.order('start_at');
  if (error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST205' || error.message.includes('schema cache'))) return [];
  if (error) throw new Error('Unable to load project meetings.');
  return ((data || []) as unknown as MeetingRow[]).map(mapMeeting);
}

export async function getMeeting(id: string): Promise<MeetingRecord | null> {
  if (isDemoMode()) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const viewer = await getViewer();
  if (!viewer) return null;
  let query = supabase.from('meetings').select(meetingSelect).eq('id', id);
  query = viewer.role === 'admin' ? query.eq('owner_id', viewer.id) : query.eq('client.auth_user_id', viewer.id);
  const { data } = await query.maybeSingle();
  return data ? mapMeeting(data as unknown as MeetingRow) : null;
}

export async function getAvailability(ownerId: string): Promise<AvailabilitySettings | null> {
  if (isDemoMode()) return { ...DEFAULT_AVAILABILITY };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const [{ data: settings }, { data: rules }] = await Promise.all([
    supabase.from('availability_settings').select('timezone,meeting_duration_minutes,buffer_minutes,minimum_notice_minutes,maximum_advance_days').eq('user_id', ownerId).maybeSingle(),
    supabase.from('availability_rules').select('weekday,enabled,start_time,end_time').eq('user_id', ownerId).order('weekday'),
  ]);
  if (!settings) return null;
  return { timezone: settings.timezone, meetingDurationMinutes: settings.meeting_duration_minutes, bufferMinutes: settings.buffer_minutes, minimumNoticeMinutes: settings.minimum_notice_minutes, maximumAdvanceDays: settings.maximum_advance_days, rules: (rules || []).map((rule) => ({ weekday: rule.weekday, enabled: rule.enabled, startTime: rule.start_time.slice(0, 5), endTime: rule.end_time.slice(0, 5) })) };
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function zonedLocalToUtc(dateValue: string, timeValue: string, timeZone: string) {
  const [year, month, day] = dateValue.split('-').map(Number); const [hour, minute] = timeValue.split(':').map(Number);
  let result = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = zonedParts(result, timeZone);
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    result = new Date(result.getTime() + (Date.UTC(year, month - 1, day, hour, minute) - represented));
  }
  return result;
}

function rangesOverlap(start: number, end: number, busyStart: number, busyEnd: number) { return start < busyEnd && end > busyStart; }

export async function getAvailableSlots(ownerId: string, dateValue: string): Promise<{ settings: AvailabilitySettings | null; slots: MeetingSlot[] }> {
  const settings = await getAvailability(ownerId);
  if (!settings || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return { settings, slots: [] };
  const midday = zonedLocalToUtc(dateValue, '12:00', settings.timezone);
  const weekdayLabel = new Intl.DateTimeFormat('en-US', { timeZone: settings.timezone, weekday: 'short' }).format(midday);
  const localDow = weekdayLabel === 'Sun' ? 0 : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayLabel) + 1;
  const rule = settings.rules.find((item) => item.weekday === localDow && item.enabled);
  if (!rule) return { settings, slots: [] };
  const start = zonedLocalToUtc(dateValue, rule.startTime, settings.timezone);
  const end = zonedLocalToUtc(dateValue, rule.endTime, settings.timezone);
  const minStart = Date.now() + settings.minimumNoticeMinutes * 60_000;
  const maxStart = Date.now() + settings.maximumAdvanceDays * 86_400_000;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { settings, slots: [] };
  const queryStart = new Date(start.getTime() - settings.bufferMinutes * 60_000).toISOString();
  const queryEnd = new Date(end.getTime() + settings.bufferMinutes * 60_000).toISOString();
  const [{ data: meetings }, googleBusy] = await Promise.all([
    supabase.from('meetings').select('start_at,end_at').eq('owner_id', ownerId).eq('status', 'scheduled').lt('start_at', queryEnd).gt('end_at', queryStart),
    getGoogleBusyRanges(ownerId, queryStart, queryEnd),
  ]);
  const busy = [...(meetings || []).map((item) => ({ start: item.start_at, end: item.end_at })), ...googleBusy];
  const slots: MeetingSlot[] = [];
  const duration = settings.meetingDurationMinutes * 60_000;
  for (let cursor = start.getTime(); cursor + duration <= end.getTime(); cursor += duration) {
    const slotEnd = cursor + duration;
    if (cursor < minStart || cursor > maxStart) continue;
    const paddedStart = cursor - settings.bufferMinutes * 60_000; const paddedEnd = slotEnd + settings.bufferMinutes * 60_000;
    if (busy.some((range) => rangesOverlap(paddedStart, paddedEnd, Date.parse(range.start), Date.parse(range.end)))) continue;
    const startDate = new Date(cursor);
    slots.push({ startAt: startDate.toISOString(), endAt: new Date(slotEnd).toISOString(), label: new Intl.DateTimeFormat('en-US', { timeZone: settings.timezone, hour: 'numeric', minute: '2-digit' }).format(startDate) });
  }
  return { settings, slots };
}
