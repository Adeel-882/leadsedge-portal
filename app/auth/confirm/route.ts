import { NextResponse } from 'next/server';
import { classifyOtpError, destinationForRole, parsePortalEmailOtpType, type AuthErrorReason } from '@/lib/auth-flow';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/types';

function errorRedirect(url: URL, reason: AuthErrorReason) {
  const response = NextResponse.redirect(new URL(`/auth/error?reason=${reason}`, url.origin));
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = parsePortalEmailOtpType(url.searchParams.get('type'));
  const requestedNext = url.searchParams.get('next');

  if (!tokenHash || tokenHash.length < 20 || tokenHash.length > 512 || !type) return errorRedirect(url, 'invalid');

  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorRedirect(url, 'configuration');

  const { data: verification, error: verificationError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (verificationError || !verification.user) return errorRedirect(url, classifyOtpError(verificationError));

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', verification.user.id)
    .maybeSingle();

  if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'client')) {
    await supabase.auth.signOut({ scope: 'local' });
    return errorRedirect(url, 'unauthorized');
  }

  const role = profile.role as Role;
  if (role === 'client') {
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('auth_user_id', verification.user.id)
      .maybeSingle();

    if (clientError || !client) {
      await supabase.auth.signOut({ scope: 'local' });
      return errorRedirect(url, 'unauthorized');
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('project_clients')
      .select('project_id')
      .eq('client_id', client.id)
      .limit(1);

    if (membershipError || !memberships?.length) {
      await supabase.auth.signOut({ scope: 'local' });
      return errorRedirect(url, 'unauthorized');
    }

    const { error: activationError } = await supabase.rpc('activate_current_client');
    if (activationError) {
      await supabase.auth.signOut({ scope: 'local' });
      return errorRedirect(url, 'unauthorized');
    }
  }

  const response = NextResponse.redirect(new URL(destinationForRole(role, requestedNext), url.origin));
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
