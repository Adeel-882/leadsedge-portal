import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, type NextResponse } from 'next/server';
import { hasSupabaseEnv } from '../env';
import { createTimedSupabaseFetch } from '../perf';

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

/**
 * Creates a Supabase client for a Route Handler while keeping cookie writes
 * bound to the exact response returned by that handler.
 */
export function createResponseBoundSupabaseClient(request: NextRequest) {
  if (!hasSupabaseEnv()) return null;

  const pendingCookies: PendingCookie[] = [];
  const requestId = request.headers.get('x-request-id') || 'untracked';
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: createTimedSupabaseFetch(requestId) },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          pendingCookies.push(...cookiesToSet);
        },
      },
    },
  );

  function attachCookies<T extends NextResponse>(response: T): T {
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }
    return response;
  }

  return { supabase, attachCookies };
}
