import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { resolveRequestOrigin } from '@/lib/request-origin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { messageEditSchema } from '@/lib/message-edit';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ kind: string; resourceId: string; messageId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (request.headers.get('x-cache-viewer') !== viewer.id) return NextResponse.json({ error: 'Account changed. Reload this page.' }, { status: 403 });
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (!origin || origin !== resolveRequestOrigin(request) || (site && site !== 'same-origin') || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ error: 'Message changes require a live account.' }, { status: 503 });
  const target = z.object({ kind: z.enum(['project', 'task']), resourceId: z.string().uuid(), messageId: z.string().uuid() }).safeParse(await params);
  const text = await request.text();
  if (text.length > 32000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  let body: unknown; try { body = JSON.parse(text); } catch { body = null; }
  const parsed = messageEditSchema.safeParse(body);
  if (!target.success || !parsed.success) return NextResponse.json({ error: 'Write a message between 1 and 5,000 characters.' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Messaging is unavailable.' }, { status: 503 });
  const { data, error } = await supabase.rpc('mutate_own_message', {
    target_kind: target.data.kind, target_resource_id: target.data.resourceId, target_message_id: target.data.messageId,
    operation: parsed.data.operation, expected_version: parsed.data.version, new_body: parsed.data.operation === 'edit' ? parsed.data.body : null,
  });
  if (error || !data) {
    const status = error?.code === '42501' ? 403 : error?.code === '40001' ? 409 : error?.code === '22023' ? 400 : 503;
    return NextResponse.json({ error: status === 409 ? 'This message changed on another device. Cancel and reopen the editor to use the latest version.' : 'Unable to change this message.' }, { status });
  }
  return NextResponse.json({ message: { id: data.id, senderId: data.sender_id, senderName: viewer.fullName, senderRole: viewer.role, body: data.deleted_at ? '' : data.body, attachmentUrl: data.deleted_at ? null : data.attachment_url, createdAt: data.created_at, editedAt: data.edited_at, deletedAt: data.deleted_at, version: data.message_version, messageType: data.message_type } }, { headers: { 'Cache-Control': 'no-store' } });
}
