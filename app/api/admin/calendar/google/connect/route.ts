import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireApiRole } from '@/lib/auth';
import { buildGoogleAuthorizationUrl, googleCalendarConfigured } from '@/lib/calendar';
import { appUrl } from '@/lib/env';

export async function GET() {
  const viewer = await requireApiRole('admin');
  const base = appUrl().replace(/\/$/, '');
  if (!viewer) return NextResponse.redirect(`${base}/auth/sign-in?next=/admin/settings`);
  if (!googleCalendarConfigured()) return NextResponse.redirect(`${base}/admin/settings?calendar=not-configured`);
  const state = crypto.randomBytes(32).toString('base64url');
  const cookieStore = await cookies();
  cookieStore.set('leadsedge_google_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: base.startsWith('https://'), path: '/api/admin/calendar/google/callback', maxAge: 600 });
  return NextResponse.redirect(buildGoogleAuthorizationUrl(state, viewer.email));
}
