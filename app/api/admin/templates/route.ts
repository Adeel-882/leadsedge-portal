import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000) });
export async function POST(request: Request) {
  const viewer = await requireApiRole('admin');
  if (!viewer) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid template name.' }, { status: 400 });
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID() }, { status: 201 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase!.from('templates').insert({ ...parsed.data, created_by: viewer.id }).select('id').single();
  if (error) return NextResponse.json({ error: 'Template could not be created.' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
