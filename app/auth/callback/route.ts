import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const requestedNext = url.searchParams.get('next') || '/portal';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/portal';
  const supabase = await createSupabaseServerClient();
  if (!code || !supabase) return NextResponse.redirect(new URL('/auth/error', url.origin));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/auth/error', url.origin));
  await supabase.rpc('activate_current_client');
  return NextResponse.redirect(new URL(next, url.origin));
}
