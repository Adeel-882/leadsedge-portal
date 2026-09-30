import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareClientProjects, orderClientProjects } from '@/lib/project-order';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const queries = read('../lib/queries.ts');
const cachedMessages = read('../components/cache/messages.tsx');
const loaders = read('../lib/screen-data.ts');
const messagesPage = read('../app/portal/messages/page.tsx');
const messagesWorkspace = read('../components/messages-workspace.tsx');
const conversation = read('../components/conversation.tsx');
const messagesApi = read('../app/api/messages/[kind]/[resourceId]/route.ts');
const bootstrapRpc = read('../supabase/migrations/202609030001_portal_bootstrap_prototype.sql');
const unreadRpc = read('../supabase/migrations/202608280001_message_classification_and_feedback_submission.sql');
const readReceipts = read('../supabase/migrations/202608270002_message_read_receipts.sql');
const seed = read('../scripts/seed-frankfurt-performance.mjs');

describe('client project ordering', () => {
  it('puts the primary membership first, then oldest created', () => {
    const ordered = orderClientProjects([
      { id: 'c', isPrimary: false, createdAt: '2026-01-03T00:00:00Z' },
      { id: 'a', isPrimary: true, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', isPrimary: false, createdAt: '2026-01-02T00:00:00Z' },
    ]);

    expect(ordered.map((project) => project.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks ties on created order rather than input order', () => {
    const ordered = orderClientProjects([
      { id: 'newer', isPrimary: true, createdAt: '2026-02-01T00:00:00Z' },
      { id: 'older', isPrimary: true, createdAt: '2026-01-01T00:00:00Z' },
    ]);

    expect(ordered.map((project) => project.id)).toEqual(['older', 'newer']);
    expect(compareClientProjects({ isPrimary: true, createdAt: 'x' }, { isPrimary: true, createdAt: 'x' })).toBe(0);
  });

  it('does not mutate its input', () => {
    const input = [
      { id: 'b', isPrimary: false, createdAt: '2026-01-02T00:00:00Z' },
      { id: 'a', isPrimary: true, createdAt: '2026-01-01T00:00:00Z' },
    ];
    orderClientProjects(input);

    expect(input.map((project) => project.id)).toEqual(['b', 'a']);
  });

  // The portal and the RPC previously disagreed: getClientProjects() ordered by
  // created_at desc while get_portal_bootstrap() takes the first primary
  // membership, so the shell and /portal/messages pointed at different projects.
  it('matches the ordering get_portal_bootstrap uses for the default project', () => {
    expect(bootstrapRpc).toContain('order by project_clients.is_primary desc, project_clients.created_at');
    expect(queries).toContain('orderClientProjects(');
    expect(queries).not.toContain(".order('created_at', { ascending: false })\n  if (error) throw new Error('Unable to load your projects.')");
  });

  it('reads this client own membership flag rather than another client primary link', () => {
    expect(queries).toContain('project_clients!inner(is_primary,client:clients!inner(id,full_name,auth_user_id,status))');
    expect(queries).toContain('isPrimary: Boolean(link?.is_primary)');
  });
});

describe('messages inbox reachability', () => {
  it('lists every project the client is authorised to see, not just the first', () => {
    expect(loaders).toContain('getClientConversationThreads()');
    expect(messagesPage).not.toContain('projects[0]');
    expect(queries).toContain('const projectThreads: ConversationThread[] = projects.map((project) => ({');
  });

  it('renders zero-message projects as selectable threads', () => {
    // Project threads are built from the project list, not from the message
    // sample, so a project with no conversation still gets a row.
    const threadBlock = queries.slice(queries.indexOf('const projectThreads: ConversationThread[]'));
    expect(threadBlock).toContain('unreadCount: unreadByProject.get(project.id) || 0');
    expect(threadBlock).toContain('lastMessageAt: projectLatest.get(project.id)?.createdAt || null');
  });

  it('surfaces task comment threads, which the badge also counts', () => {
    expect(queries).toContain('const taskThreads: ConversationThread[] = tasks');
    expect(queries).toContain('unreadByTask.get(task.id) || 0) > 0 || taskLatest.has(task.id)');
    expect(messagesWorkspace).toContain("thread.kind === 'task' ? 'Task' : 'Project'");
  });

  it('shows task title, project, unread count and last activity on each thread', () => {
    expect(messagesWorkspace).toContain('{thread.title}');
    expect(messagesWorkspace).toContain('thread.projectName');
    expect(messagesWorkspace).toContain('thread.unreadCount > 0');
    expect(messagesWorkspace).toContain('formatTime(thread.lastMessageAt)');
  });

  it('reuses the existing conversation component and links to the task page', () => {
    expect(messagesWorkspace).toContain('<Conversation key={selected.key}');
    expect(messagesWorkspace).toContain("`/portal/tasks/${selected.resourceId}`");
    expect(messagesPage).toContain('getTaskMessages(selected.resourceId)');
  });

  it('keeps a single-thread client in the same clean split-pane workspace', () => {
    expect(cachedMessages).toContain('<MessagesWorkspace role={identity.role}');
    expect(messagesWorkspace).toContain('threads.length === 1');
    expect(messagesWorkspace).toContain('Conversation list');
  });

  it('falls back to the default thread instead of trusting a supplied identifier', () => {
    expect(cachedMessages).toContain('resolveMessageThread(threads,requested)');
    expect(cachedMessages).toContain('threads.some(t=>t.key===requested)');
  });
});

describe('unread accounting', () => {
  it('counts unread from this viewer own receipts, which row level security scopes', () => {
    expect(readReceipts).toContain('create policy "users read own message receipts" on public.message_read_receipts');
    expect(readReceipts).toContain('for select using (recipient_id = auth.uid())');
    expect(queries).toContain(".from('message_read_receipts')");
    expect(queries).toContain(".is('read_at', null)");
  });

  it('counts the same set as the badge: user messages only, nothing inaccessible', () => {
    expect(unreadRpc).toContain("pm.message_type = 'user' and public.is_project_member(pm.project_id)");
    expect(unreadRpc).toContain("tm.message_type = 'user' and public.can_access_task(tm.task_id)");
    expect(queries).toContain("projectMessage.message_type === 'user'");
    expect(queries).toContain("taskMessage.message_type === 'user'");
  });

  it('never derives unread counts from the bounded preview sample', () => {
    expect(queries).toContain('const CONVERSATION_ACTIVITY_SAMPLE');
    const receiptBlock = queries.slice(queries.indexOf('const unreadByProject'), queries.indexOf('const projectThreads'));
    expect(receiptBlock).not.toContain('CONVERSATION_ACTIVITY_SAMPLE');
  });

  it('keeps the navigation badge global rather than scoping it to the open thread', () => {
    const shell = read('../components/portal/portal-shell.tsx');
    expect(shell).toContain('unread.messages > 0');
    expect(messagesPage).not.toContain('messageUnreadCount');
  });
});

describe('read state', () => {
  it('marks read per conversation, so opening one project leaves the others unread', () => {
    expect(readReceipts).toContain('and receipt.project_message_id in (select id from public.project_messages where project_id = target_resource_id)');
    expect(readReceipts).toContain('and receipt.task_message_id in (select id from public.task_messages where task_id = target_resource_id)');
    expect(conversation).toContain("'/api/messages/' + kind + '/' + resourceId, { method: 'PATCH'");
  });

  it('only marks the selected thread read, never the whole inbox', () => {
    // A single Conversation is mounted for the selected thread, so nothing else
    // issues a mark-read on load.
    expect(messagesWorkspace.match(/<Conversation /g)?.length).toBe(1);
    expect(messagesWorkspace).not.toContain('threads.map((thread) => <Conversation');
  });

  it('delegates receipt convergence to the central manager without route refresh', () => {
    expect(conversation).toContain('sync.withRead(');
    expect(conversation).not.toContain('router.refresh()');
    expect(conversation).toContain("thread.key === kind+':'+resourceId");
    expect(messagesWorkspace).toContain('Math.max(0, thread.unreadCount - readMessages)');
  });

  it('checks authorization before marking a conversation read', () => {
    expect(messagesApi).toContain("viewer.role === 'client' && !await clientCanAccess(viewer.id, kind, resourceId)");
    expect(readReceipts).toContain('if not public.can_access_task(target_resource_id) then raise exception');
    expect(readReceipts).toContain('if not public.is_project_member(target_resource_id) then raise exception');
  });
});

describe('foreign conversation access', () => {
  it('resolves task and project conversations through the client access checks', () => {
    expect(queries).toContain('getClientTaskList()');
    const threadFn = queries.slice(queries.indexOf('export async function getClientConversationThreads'));
    expect(threadFn).toContain("if (!viewer || viewer.role !== 'client') return [];");
    expect(threadFn).toContain(".eq('project.project_clients.client.auth_user_id', viewer.id)");
    expect(threadFn).toContain(".eq('task.assignee.auth_user_id', viewer.id)");
    expect(threadFn).toContain(".is('task.archived_at', null)");
  });

  it('drops a receipt whose message row level security hid', () => {
    expect(queries).toContain('// A receipt whose message is null was filtered out by row level security, and');
    expect(queries).toContain('if (projectMessage?.project_id &&');
  });
});

describe('frankfurt fixture', () => {
  it('marks exactly one membership primary per client', () => {
    expect(seed).toContain('is_primary: index < 3 ? index === 0 : true,');
    expect(seed).not.toContain('  is_primary: true,\n}));');
  });
});
