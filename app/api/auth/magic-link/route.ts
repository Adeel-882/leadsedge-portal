import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl, hasPublicAuthEnv, isDemoMode } from '@/lib/env';
import { normalizeSignInEmail } from '@/lib/sign-in';
import { createResponseBoundSupabaseClient } from '@/lib/supabase/response-bound';

const schema = z.object({ email: z.string().trim().email(), next: z.string().startsWith('/').refine((value) => !value.startsWith('//')) });
const genericSuccessMessage = 'If this email is authorized, check your inbox for a sign-in link.';

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ message: 'Demo mode is active. Configure Supabase to send secure sign-in links.' });
  if (!hasPublicAuthEnv()) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });

  const routeClient = createResponseBoundSupabaseClient(request);
  if (!routeClient) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
  const { supabase, attachCookies } = routeClient;

  const email = normalizeSignInEmail(parsed.data.email);
  // The emailed link must come back to the origin the browser is already on:
  // the PKCE verifier and the session cookies are scoped to that origin, so a
  // NEXT_PUBLIC_APP_URL pointing at localhost while the user browses 127.0.0.1
  // produces a link that can never complete. Keep the configured value (it is
  // what Supabase allow-lists) but never let the mismatch pass silently.
  const configuredOrigin = appUrl();
  const requestOrigin = new URL(request.url).origin;
  if (configuredOrigin !== requestOrigin) {
    console.warn('[auth] Sign-in origin mismatch.', JSON.stringify({
      configuredOrigin,
      requestOrigin,
      consequence: 'the emailed link will return to the configured origin and its session cookies will not be visible here',
    }));
  }
  const redirectTo = `${configuredOrigin}/auth/confirm?next=${encodeURIComponent(parsed.data.next)}`;
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });

  if (otpError) {
    console.warn('[auth] Magic-link request was not accepted by the provider.', {
      code: otpError.code || 'unknown',
      status: otpError.status || null,
    });
  }

  return attachCookies(NextResponse.json({ message: genericSuccessMessage }));
}
