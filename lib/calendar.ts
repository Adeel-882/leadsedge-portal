import crypto from 'node:crypto';
import { appUrl, hasGoogleCalendarEnv } from './env';
import { createSupabaseAdminClient } from './supabase/admin';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy'];

type GoogleTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
type BusyRange = { start: string; end: string };

export function googleCalendarConfigured() { return hasGoogleCalendarEnv(); }
export function googleCallbackUrl() { return `${appUrl().replace(/\/$/, '')}/api/admin/calendar/google/callback`; }

export function buildGoogleAuthorizationUrl(state: string, loginHint?: string) {
  if (!hasGoogleCalendarEnv()) throw new Error('Google Calendar is not configured.');
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleCallbackUrl(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: SCOPES.join(' '),
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeGoogleCode(code: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: googleCallbackUrl(), grant_type: 'authorization_code' }), cache: 'no-store' });
  const result = await response.json() as GoogleTokenResponse;
  if (!response.ok || !result.access_token || !result.refresh_token) throw new Error(result.error_description || 'Google did not return an offline refresh token. Reconnect and grant consent.');
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${result.access_token}` }, cache: 'no-store' });
  const profile = await profileResponse.json().catch(() => ({})) as { email?: string };
  return { accessToken: result.access_token, refreshToken: result.refresh_token, email: profile.email || null, scopes: (result.scope || '').split(' ').filter(Boolean) };
}

function encryptionKey() { return crypto.createHash('sha256').update(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || '').digest(); }
export function encryptCalendarToken(token: string) {
  if (!hasGoogleCalendarEnv()) throw new Error('Google Calendar is not configured.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptCalendarToken(payload: string) {
  const [ivValue, tagValue, encryptedValue] = payload.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Stored calendar credentials are invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

async function getCalendarAccess(ownerId: string) {
  if (!hasGoogleCalendarEnv()) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data: connection } = await admin.from('calendar_connections').select('encrypted_refresh_token,calendar_id,status').eq('user_id', ownerId).maybeSingle();
  if (!connection || connection.status !== 'connected') return null;
  const response = await fetch(GOOGLE_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: decryptCalendarToken(connection.encrypted_refresh_token), grant_type: 'refresh_token' }), cache: 'no-store' });
  const token = await response.json() as GoogleTokenResponse;
  if (!response.ok || !token.access_token) {
    await admin.from('calendar_connections').update({ status: 'error', last_error: 'Calendar authorization needs to be renewed.' }).eq('user_id', ownerId);
    throw new Error('Google Calendar authorization needs to be renewed.');
  }
  return { token: token.access_token, calendarId: connection.calendar_id || 'primary' };
}

export async function getGoogleBusyRanges(ownerId: string, timeMin: string, timeMax: string): Promise<BusyRange[]> {
  const access = await getCalendarAccess(ownerId);
  if (!access) return [];
  const response = await fetch(`${CALENDAR_API}/freeBusy`, { method: 'POST', headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ timeMin, timeMax, items: [{ id: access.calendarId }] }), cache: 'no-store' });
  const data = await response.json().catch(() => ({})) as { calendars?: Record<string, { busy?: BusyRange[]; errors?: unknown[] }> };
  if (!response.ok) throw new Error('Google Calendar availability could not be checked.');
  return data.calendars?.[access.calendarId]?.busy || [];
}

export async function createGoogleMeetingEvent(ownerId: string, meeting: { title: string; description: string; startAt: string; endAt: string; timezone: string; clientEmail: string }) {
  const access = await getCalendarAccess(ownerId);
  if (!access) return null;
  const response = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(access.calendarId)}/events?sendUpdates=all&conferenceDataVersion=1`, { method: 'POST', headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: meeting.title, description: meeting.description, start: { dateTime: meeting.startAt, timeZone: meeting.timezone }, end: { dateTime: meeting.endAt, timeZone: meeting.timezone }, attendees: [{ email: meeting.clientEmail }], conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }), cache: 'no-store' });
  const data = await response.json().catch(() => ({})) as { id?: string; htmlLink?: string; error?: { message?: string } };
  if (!response.ok || !data.id) throw new Error(data.error?.message || 'The Google Calendar event could not be created.');
  return { id: data.id, htmlLink: data.htmlLink || null };
}

export async function deleteGoogleMeetingEvent(ownerId: string, eventId: string) {
  const access = await getCalendarAccess(ownerId);
  if (!access) return;
  const response = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(access.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: 'DELETE', headers: { Authorization: `Bearer ${access.token}` }, cache: 'no-store' });
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error('The Google Calendar event could not be removed.');
}
