import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAuthConfirmationUrl, destinationForRole } from '@/lib/auth-flow';
import { sendBrandedEmail } from '@/lib/email';
import { appUrl, isDemoMode } from '@/lib/env';
import { isMagicLinkEligible, normalizeSignInEmail, shouldUseBrandedEmailFallback } from '@/lib/sign-in';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/types';

const schema = z.object({ email: z.string().trim().email(), next: z.string().startsWith('/').refine((value) => !value.startsWith('//')) });
const unauthorizedMessage = 'This email does not have access to the portal.';

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ message: 'Demo mode is active. Configure Supabase to send secure sign-in links.' });

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });

  const email = normalizeSignInEmail(parsed.data.email);
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id,email,role,full_name')
    .eq('email', email)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Authentication eligibility could not be verified.' }, { status: 503 });

  let client: { id: string; status: 'invited' | 'active' | 'disabled' } | null = null;
  let hasProject = false;
  if (profile?.role === 'client') {
    const { data: clientRecord, error: clientError } = await admin
      .from('clients')
      .select('id,status')
      .eq('auth_user_id', profile.id)
      .eq('email', email)
      .maybeSingle();
    if (clientError) return NextResponse.json({ error: 'Authentication eligibility could not be verified.' }, { status: 503 });
    client = clientRecord;
    if (client) {
      const { count, error: membershipError } = await admin
        .from('project_clients')
        .select('project_id', { count: 'exact', head: true })
        .eq('client_id', client.id);
      if (membershipError) return NextResponse.json({ error: 'Authentication eligibility could not be verified.' }, { status: 503 });
      hasProject = (count || 0) > 0;
    }
  }

  const role = profile?.role === 'admin' || profile?.role === 'client' ? profile.role as Role : null;
  if (!profile || !role || !isMagicLinkEligible({ role, clientStatus: client?.status || null, hasProject })) {
    return NextResponse.json({ error: unauthorizedMessage }, { status: 400 });
  }

  const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
  if (authUserError || !authUserData.user || normalizeSignInEmail(authUserData.user.email || '') !== email) {
    return NextResponse.json({ error: 'The authorized account is not linked to a valid authentication user.' }, { status: 409 });
  }

  const next = destinationForRole(role, parsed.data.next);
  const redirectTo = `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
  if (!otpError) return NextResponse.json({ message: 'Check your inbox for a secure, expiring sign-in link.' });

  if (!shouldUseBrandedEmailFallback(otpError)) {
    return NextResponse.json({ error: 'We could not send a sign-in link. Please try again.' }, { status: 502 });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: next } });
  if (linkError || !linkData.properties?.hashed_token || linkData.user.id !== profile.id) {
    return NextResponse.json({ error: 'A secure sign-in link could not be generated for this account.' }, { status: 502 });
  }

  const actionLink = buildAuthConfirmationUrl({ tokenHash: linkData.properties.hashed_token, type: 'magiclink', role, next });
  const delivery = await sendBrandedEmail({
    to: email,
    subject: 'Your Leadsedge Portal sign-in link',
    heading: 'Sign in to Leadsedge Portal',
    greetingName: profile.full_name,
    body: 'Use the secure button below to sign in. This one-time link expires automatically.',
    actionLabel: 'Sign in securely',
    actionLink,
  });
  await admin.from('email_deliveries').insert({
    client_id: client?.id || null,
    project_id: null,
    email_type: `${role}_sign_in`,
    provider_id: delivery.ok ? delivery.id : null,
    status: delivery.ok ? 'sent' : 'failed',
    error_message: delivery.ok ? null : delivery.error,
  });
  if (!delivery.ok) return NextResponse.json({ error: 'Email delivery is temporarily unavailable. Please try again later.' }, { status: 503 });

  return NextResponse.json({ message: 'Check your inbox for a secure, expiring sign-in link.' });
}
