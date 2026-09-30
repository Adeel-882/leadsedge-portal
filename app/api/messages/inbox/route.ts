import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { adminWorkspaceThreads, clientWorkspaceThreads } from '@/lib/message-workspace';
import { getAdminMessageInbox, getAdminProjects, getClientConversationThreads } from '@/lib/queries';

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  if (viewer.role === 'client') {
    return NextResponse.json({ threads: clientWorkspaceThreads(await getClientConversationThreads()) });
  }

  const [conversations, projects] = await Promise.all([getAdminMessageInbox(), getAdminProjects()]);
  return NextResponse.json({ threads: adminWorkspaceThreads(conversations, projects) });
}
