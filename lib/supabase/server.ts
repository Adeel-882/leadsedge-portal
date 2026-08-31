import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { hasSupabaseEnv } from '../env';

const getRequestSupabaseClient = cache(async () => {
  if (!hasSupabaseEnv()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
