import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/components/settings-form';
import { AvailabilityForm } from '@/components/admin/availability-form';
import { CalendarConnection } from '@/components/admin/calendar-connection';
import { googleCalendarConfigured } from '@/lib/calendar';
import { DEFAULT_AVAILABILITY, getAvailability } from '@/lib/meetings';

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ calendar?: string }> }) {
  const viewer = await requireRole('admin');
  // Settings, calendar connection and availability all key on viewer.id alone,
  // so they run concurrently instead of three round trips deep.
  const supabase = isDemoMode() ? null : await createSupabaseServerClient();
  const [settingsResult, connectionResult, savedAvailability, query] = await Promise.all([
    supabase ? supabase.from('admin_settings').select('timezone').eq('user_id', viewer.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase ? supabase.from('calendar_connections').select('provider_email,status').eq('user_id', viewer.id).maybeSingle() : Promise.resolve({ data: null }),
    getAvailability(viewer.id),
    searchParams,
  ]);
  const timezone = isDemoMode() ? 'Asia/Karachi' : settingsResult.data?.timezone || 'UTC';
  const calendarConnection: { provider_email: string | null; status: string } | null = connectionResult.data;
  const availability = savedAvailability || { ...DEFAULT_AVAILABILITY, timezone };
  const calendarMessages: Record<string, string> = { connected: 'Google Calendar connected successfully.', 'not-configured': 'Google OAuth variables are not configured.', 'invalid-state': 'The calendar connection expired. Please try again.', failed: 'Google Calendar could not be connected. Confirm the OAuth redirect URI and grant offline access.' };
  return <div className="page-wrap"><div className="page-header"><p className="page-eyebrow">Administrator</p><h1 className="page-title">Profile and scheduling</h1><p className="page-subtitle">Manage your identity, notifications, office hours, and calendar connection.</p></div><div className="space-y-4"><div className="grid gap-4 xl:grid-cols-2"><SettingsForm displayName={viewer.fullName} timezone={timezone} /><CalendarConnection configured={googleCalendarConfigured()} connected={calendarConnection?.status === 'connected'} email={calendarConnection?.provider_email || null} statusMessage={query.calendar ? calendarMessages[query.calendar] : undefined} /></div><section className="surface-flat p-5"><h2 className="section-title">Administrators</h2><p className="section-description mb-4">Invite trusted people to help manage LeadsEdge Portal. All administrators have full access.</p><Link className="button-secondary" href="/admin/settings/admins">Manage administrators</Link></section><AvailabilityForm initial={availability} /></div></div>;
}
