import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { personUpdateSchema } from '@/lib/validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (viewer.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const { clientId } = await params;
  const parsed = personUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid person details.' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  const { data: current, error: currentError } = await supabase.from('clients').select('id,auth_user_id,full_name,company,title,phone').eq('id', clientId).maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });
  const changes = { full_name: parsed.data.fullName, company: parsed.data.company || null, title: parsed.data.title || null, phone: parsed.data.phone || null };
  const { error: clientError } = await supabase.from('clients').update(changes).eq('id', clientId);
  if (clientError) return NextResponse.json({ error: 'Person details could not be updated.' }, { status: 500 });
  if (current.auth_user_id) {
    const { error: profileError } = await supabase.from('users').update({ full_name: parsed.data.fullName }).eq('id', current.auth_user_id);
    if (profileError) {
      await supabase.from('clients').update({ full_name: current.full_name, company: current.company, title: current.title, phone: current.phone }).eq('id', clientId);
      return NextResponse.json({ error: 'The linked portal profile could not be synchronized. No changes were retained.' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
