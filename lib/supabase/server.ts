import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import { cache } from 'react';
import { hasSupabaseEnv } from '../env';
import { createTimedSupabaseFetch } from '../perf';

const getRequestSupabaseClient = cache(async () => {
  if (!hasSupabaseEnv()) return null;
  const cookieStore = await cookies();
  const requestId = (await headers()).get('x-request-id') || 'untracked';
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: createTimedSupabaseFetch(requestId) },
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot always write refreshed cookies. The auth callback can.
          }
        },
      },
    },
  );
});

export async function createSupabaseServerClient() {
  return getRequestSupabaseClient();
}
