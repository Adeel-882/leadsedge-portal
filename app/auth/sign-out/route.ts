import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { externalRequestUrl } from '@/lib/app-origin';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  // Each device owns an independent session. The SDK default is global.
  if (supabase) await supabase.auth.signOut({ scope: 'local' });
  return NextResponse.redirect(new URL('/auth/sign-in', externalRequestUrl(request)));
}
