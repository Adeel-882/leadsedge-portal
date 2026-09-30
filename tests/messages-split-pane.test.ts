import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = read('../components/messages-workspace.tsx');
const conversation = read('../components/conversation.tsx');
const cachedMessages = read('../components/cache/messages.tsx');
const adminPage = read('../app/admin/messages/page.tsx');
const clientPage = read('../app/portal/messages/page.tsx');
const inboxRoute = read('../app/api/messages/inbox/route.ts');
const messageRoute = read('../app/api/messages/[kind]/[resourceId]/route.ts');
const styles = read('../app/globals.css');
const queries = read('../lib/queries.ts');

describe('shared split-pane Messages experience', () => {
  it('renders the shared conversation rail and pane for admin and client', () => {
    expect(adminPage).toContain('<CachedMessages');
    expect(cachedMessages).toContain('<MessagesWorkspace role={identity.role}');
    expect(clientPage).toContain('<CachedMessages');
    expect(workspace).toContain('<aside className="messages-rail"');
    expect(workspace).toContain('<section className="messages-pane"');
  });

  it('switches project and task conversations locally while keeping the rail mounted', () => {
    expect(workspace).toContain('setSelectedKey(thread.key)');
    expect(conversation).toContain('queryKeys.messages(identity, kind, resourceId)');
    expect(workspace).toContain('<Conversation key={selected.key} kind={selected.kind}');
    expect(workspace).not.toContain('router.push');
  });

  it('syncs deep links with browser history and restores Back/Forward selection', () => {
    expect(workspace).toContain('window.history.pushState');
    expect(workspace).toContain("window.addEventListener('popstate'");
    expect(adminPage).toContain('resolveMessageThread(initial.data.threads,thread)');
    expect(clientPage).toContain('resolveMessageThread(initial.data.threads,thread)');
  });

  it('resolves requested IDs only against role-authorized server inventories', () => {
    expect(cachedMessages).toContain('threads.some(t=>t.key===requested)');
    expect(cachedMessages).toContain('data.projects.find(p=>p.id===parsed.resourceId)');
    expect(messageRoute).toContain("viewer.role === 'client' && !await clientCanAccess(viewer.id, kind, resourceId)");
  });

  it('loads only selected history and preserves newest-50 pagination', () => {
    expect(clientPage).toContain('getTaskMessages(selected.resourceId)');
    expect(adminPage).toContain('getProjectMessages(selected.resourceId)');
    expect(conversation).toContain('initialMessages.length === 50');
    expect(conversation).toContain('Load earlier messages');
    expect(conversation).toContain('?before=');
    expect(queries).toContain('.limit(CONVERSATION_ACTIVITY_SAMPLE)');
    expect(queries).toContain("project_message:project_messages(project_id,message_type,body,created_at");
    expect(queries).toContain("task_message:task_messages(task_id,message_type,body,created_at");
    expect(queries).toContain('unreadProjectLatest');
    expect(queries).toContain('unreadTaskLatest');
  });

  it('keeps message sending and per-conversation read updates in the reused Conversation', () => {
    expect(conversation).toContain("method: 'POST'");
    expect(conversation).toContain("method: 'PATCH'");
    expect(workspace).toContain('thread.key === selectedKey');
    expect(workspace).toContain('Math.max(0, thread.unreadCount - readMessages)');
  });

  it('delegates subscriptions to the centralized manager', () => {
    expect(conversation).toContain('sync.register(kind, resourceId');
    expect(conversation).not.toContain('.channel(');
    expect(workspace).not.toContain('.channel(');
    expect(conversation).not.toContain('setInterval');
    expect(workspace).not.toContain('setInterval');
    expect(inboxRoute).toContain("viewer.role === 'client'");
  });

  it('offers task context and Open lead for both roles', () => {
    expect(workspace).toContain('Task conversation');
    expect(workspace).toContain('Open lead');
    expect(workspace).toContain("`/admin/projects/${selected.projectId}/tasks/${selected.resourceId}`");
    expect(workspace).toContain("`/portal/tasks/${selected.resourceId}`");
  });

  it('uses list-detail navigation on mobile and split panes on tablet/desktop', () => {
    expect(workspace).toContain("window.matchMedia('(min-width: 768px)')");
    expect(workspace).toContain('messages-mobile-back');
    expect(styles).toContain('.mobile-conversation-open .messages-rail { display: none; }');
    expect(styles).toContain('grid-template-columns: minmax(260px, 310px) minmax(0, 1fr)');
  });

  it('does not mount a hidden mobile conversation on the Messages root', () => {
    expect(workspace).toContain('desktop || mobileConversation ? <Conversation');
    expect(cachedMessages).toContain('initialMobileConversation={Boolean(requested && threads.some(t=>t.key===requested))}');
  });

  it('keeps the admin project-chat action inside the rail header', () => {
    const header = workspace.slice(workspace.indexOf('<header className="messages-rail-header">'), workspace.indexOf('</header>'));
    expect(header).toContain("role === 'admin'");
    expect(header).toContain('Start or open project chat');
  });
});
