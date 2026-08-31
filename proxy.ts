import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasSupabaseEnv } from '@/lib/env';

export async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // This proxy exists only to keep the session cookie fresh. It is deliberately
  // NOT an authorization boundary: every route resolves the viewer through
  // requireRole()/getViewer(), which call the authoritative auth.getUser().
  //
  // getSession() reads the session from the request cookies with no network
  // call, and refreshes through the refresh token when the access token is at
  // or near expiry. Both outcomes are persisted the same way getUser() would
  // persist them, because @supabase/ssr writes cookies from the TOKEN_REFRESHED
  // and SIGNED_OUT events rather than from any particular auth method. Dropping
  // getUser() here removes a redundant round trip to the auth server that every
  // request paid before rendering, without changing what refreshes or when.
  await supabase.auth.getSession();
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
