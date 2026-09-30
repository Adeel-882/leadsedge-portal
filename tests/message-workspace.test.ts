import { describe, expect, it } from 'vitest';
import { adminWorkspaceThreads, clientWorkspaceThreads, emptyAdminProjectThread, messageThreadKey, parseMessageThreadKey, resolveMessageThread } from '@/lib/message-workspace';
import type { AdminConversationSummary, ConversationThread, ProjectSummary } from '@/lib/types';

const PROJECT_A = '10000000-0000-4000-8000-000000000001';
const PROJECT_B = '10000000-0000-4000-8000-000000000002';
const TASK_A = '20000000-0000-4000-8000-000000000001';

const projects: ProjectSummary[] = [
  { id: PROJECT_A, projectName: 'Primary Project', ownerName: 'Admin', clientName: 'Client A', clientId: 'client-a', status: 'active', completedTasks: 0, totalTasks: 1, createdAt: '2026-01-01T00:00:00Z', isPrimary: true },
  { id: PROJECT_B, projectName: 'Quiet Project', ownerName: 'Admin', clientName: 'Client B', clientId: 'client-b', status: 'active', completedTasks: 0, totalTasks: 0, createdAt: '2026-01-02T00:00:00Z', isPrimary: false },
];

describe('Messages workspace thread model', () => {
  it('round-trips valid project and task deep links and rejects malformed input', () => {
    expect(parseMessageThreadKey(messageThreadKey('project', PROJECT_A))).toEqual({ kind: 'project', resourceId: PROJECT_A });
    expect(parseMessageThreadKey(messageThreadKey('task', TASK_A))).toEqual({ kind: 'task', resourceId: TASK_A });
    expect(parseMessageThreadKey('project:foreign')).toBeNull();
    expect(parseMessageThreadKey('other:10000000-0000-4000-8000-000000000001')).toBeNull();
  });

  it('selects a valid deep link, then unread, then the primary-ordered first thread', () => {
    const threads = clientWorkspaceThreads([
      { kind: 'project', id: PROJECT_A, title: 'Primary Project', projectId: PROJECT_A, projectName: 'Primary Project', unreadCount: 0, lastMessageAt: null, lastMessagePreview: null },
      { kind: 'task', id: TASK_A, title: 'Lead Assignment', projectId: PROJECT_A, projectName: 'Primary Project', unreadCount: 4, lastMessageAt: '2026-01-03T00:00:00Z', lastMessagePreview: 'Update' },
    ]);
    expect(resolveMessageThread(threads, `project:${PROJECT_A}`)?.key).toBe(`project:${PROJECT_A}`);
    expect(resolveMessageThread(threads, 'task:00000000-0000-4000-8000-000000000099')?.key).toBe(`task:${TASK_A}`);
    expect(resolveMessageThread(threads.map((thread) => ({ ...thread, unreadCount: 0 })), null)?.key).toBe(`project:${PROJECT_A}`);
  });

  it('preserves project/task metadata and unread counts for the client rail', () => {
    const source: ConversationThread[] = [{ kind: 'task', id: TASK_A, title: 'Lead Assignment', projectId: PROJECT_A, projectName: 'Primary Project', unreadCount: 7, lastMessageAt: '2026-01-03T00:00:00Z', lastMessagePreview: 'Latest', lastSenderName: 'Client A' }];
    expect(clientWorkspaceThreads(source)[0]).toMatchObject({ key: `task:${TASK_A}`, title: 'Lead Assignment', projectName: 'Primary Project', senderName: 'Client A', unreadCount: 7 });
  });

  it('adds admin client labels without exposing projects absent from the supplied inventory', () => {
    const conversations: AdminConversationSummary[] = [{ kind: 'project', resourceId: PROJECT_A, projectId: PROJECT_A, projectName: 'Primary Project', taskTitle: null, senderName: 'Client A', preview: 'Hello', lastMessageAt: '2026-01-03T00:00:00Z', unreadCount: 2, href: '/unused' }];
    expect(adminWorkspaceThreads(conversations, projects)[0]).toMatchObject({ clientName: 'Client A', title: 'Primary Project', unreadCount: 2 });
  });

  it('represents an authorized zero-message admin project as an empty thread', () => {
    expect(emptyAdminProjectThread(projects[1])).toMatchObject({ key: `project:${PROJECT_B}`, preview: null, unreadCount: 0, clientName: 'Client B' });
  });
});
