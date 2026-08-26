import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl, isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({ email: z.string().trim().email(), next: z.string().startsWith('/').refine((value) => !value.startsWith('//')) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ message: 'Demo mode is active. Configure Supabase to send secure sign-in links.' });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
  const redirectTo = `${appUrl()}/auth/callback?next=${encodeURIComponent(parsed.data.next)}`;
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
  if (error) return NextResponse.json({ error: 'We could not send a sign-in link. Confirm that this email has been invited.' }, { status: 400 });
  return NextResponse.json({ message: 'Check your inbox for a secure, expiring sign-in link.' });
}
