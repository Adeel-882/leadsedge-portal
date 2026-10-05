import { NextRequest, NextResponse } from 'next/server';
import { classifyOtpError, destinationForRole, isSupabaseAuthorizationCode, safeInternalPath, type AuthErrorReason } from '@/lib/auth-flow';
import { completeAuthenticatedSession } from '@/lib/auth-session';
import { createResponseBoundSupabaseClient } from '@/lib/supabase/response-bound';
import { externalRequestUrl } from '@/lib/app-origin';

/**
 * Compatibility entry point for PKCE links that were emailed while
 * `emailRedirectTo` still pointed here. New sign-in emails land on
 * /auth/confirm, which puts the same exchange behind an explicit Continue.
 * Authorization is shared with that route so both paths treat admins and
 * clients identically.
 */
function callbackError(url: URL, reason: AuthErrorReason) {
  const response = NextResponse.redirect(new URL(`/auth/error?reason=${reason}`, url.origin));
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

function logCallback(stage: string, detail: Record<string, unknown>) {
  console.warn('[auth-callback]', JSON.stringify({ stage, ...detail }));
}

export async function GET(request: NextRequest) {
  const url = externalRequestUrl(request);
  const requestedNext = safeInternalPath(url.searchParams.get('next'), '') || null;

  const providerErrorCode = url.searchParams.get('error_code');
  const providerError = url.searchParams.get('error');
  if (providerErrorCode || providerError) {
    const reason = classifyOtpError({ code: providerErrorCode, message: url.searchParams.get('error_description') });
    logCallback('GET_PROVIDER_ERROR', { providerErrorCode: providerErrorCode || providerError, reason });
    return callbackError(url, reason);
  }

  const code = url.searchParams.get('code') || '';
  if (!isSupabaseAuthorizationCode(code)) {
    logCallback('GET_CODE_REJECTED', { codePresent: Boolean(code), codeLength: code.length });
    return callbackError(url, 'invalid');
  }

  const routeClient = createResponseBoundSupabaseClient(request);
  if (!routeClient) {
    logCallback('CONFIGURATION', { code: 'missing_public_auth_config' });
    return callbackError(url, 'configuration');
  }
  const { supabase, attachCookies } = routeClient;

  const { data: exchange, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !exchange.user || !exchange.session) {
    logCallback(error ? 'CODE_EXCHANGE_FAILED' : 'SESSION_MISSING', {
      name: error?.name || 'AuthSessionError',
      code: error?.code || 'missing_session',
      status: error?.status ?? null,
    });
    return attachCookies(callbackError(url, error ? classifyOtpError(error) : 'configuration'));
  }

  const completion = await completeAuthenticatedSession(supabase, exchange.user.id);
  if (!completion.ok) {
    logCallback('AUTHORIZATION_DENIED', { stage: completion.stage, code: completion.code });
    return attachCookies(callbackError(url, completion.reason));
  }

  const response = NextResponse.redirect(new URL(destinationForRole(completion.role, requestedNext), url.origin));
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return attachCookies(response);
}
