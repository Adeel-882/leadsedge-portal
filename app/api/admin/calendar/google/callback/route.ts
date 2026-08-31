import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { encryptCalendarToken, exchangeGoogleCode } from '@/lib/calendar';
import { appUrl } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const viewer = await requireApiRole('admin');
  const base = appUrl().replace(/\/$/, '');
  if (!viewer) return NextResponse.redirect(`${base}/auth/sign-in?next=/admin/settings`);
  const url = new URL(request.url); const code = url.searchParams.get('code'); const state = url.searchParams.get('state');
  const cookieStore = await cookies(); const expectedState = cookieStore.get('leadsedge_google_oauth_state')?.value;
  cookieStore.delete('leadsedge_google_oauth_state');
  if (!code || !state || !expectedState || state !== expectedState) return NextResponse.redirect(`${base}/admin/settings?calendar=invalid-state`);
  try {
    const token = await exchangeGoogleCode(code);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase!.from('calendar_connections').upsert({ user_id: viewer.id, provider: 'google', provider_email: token.email, calendar_id: 'primary', encrypted_refresh_token: encryptCalendarToken(token.refreshToken), scopes: token.scopes, status: 'connected', last_error: null }, { onConflict: 'user_id' });
    if (error) throw new Error('Calendar connection could not be stored.');
    return NextResponse.redirect(`${base}/admin/settings?calendar=connected`);
  } catch {
    return NextResponse.redirect(`${base}/admin/settings?calendar=failed`);
  }
}
