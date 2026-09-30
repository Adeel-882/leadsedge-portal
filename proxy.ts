import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasSupabaseEnv } from '@/lib/env';

export async function proxy(request: NextRequest) {
  const started = performance.now();
  // Never trust a caller-supplied correlation ID: it also scopes safe in-flight
  // read deduplication inside this one request.
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  if (!hasSupabaseEnv()) return NextResponse.next();
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // This proxy exists only to keep the session cookie fresh. It is deliberately
  // NOT an authorization boundary: every route resolves the viewer through
  // requireRole()/getViewer(), which validate signed claims and resolve the
  // current application profile and role from the database.
  //
  // getClaims() validates the access token and lets @supabase/ssr refresh and
  // persist cookies when required. With asymmetric signing this is normally a
  // local verification backed by the SDK's short-lived JWKS cache.
  await supabase.auth.getClaims();
  const duration = Math.round((performance.now() - started) * 10) / 10;
  response.headers.set('x-request-id', requestId);
  response.headers.set('Server-Timing', `proxy;dur=${duration}`);
  if (process.env.PERF_DEBUG === 'true') console.info('[PERF]', JSON.stringify({ requestId, operation: 'proxy', durationMs: duration }));
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
