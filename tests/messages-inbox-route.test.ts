import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT = '10000000-0000-4000-8000-000000000001';
const mocks = vi.hoisted(() => ({
  viewer: null as null | { id: string; role: 'admin' | 'client'; fullName: string },
  getClientConversationThreads: vi.fn(),
  getAdminMessageInbox: vi.fn(),
  getAdminProjects: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getViewer: async () => mocks.viewer }));
vi.mock('@/lib/queries', () => ({
  getClientConversationThreads: mocks.getClientConversationThreads,
  getAdminMessageInbox: mocks.getAdminMessageInbox,
  getAdminProjects: mocks.getAdminProjects,
}));

import { GET } from '@/app/api/messages/inbox/route';

describe('role-specific Messages inbox metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer = null;
    mocks.getClientConversationThreads.mockResolvedValue([]);
    mocks.getAdminMessageInbox.mockResolvedValue([]);
    mocks.getAdminProjects.mockResolvedValue([]);
  });

  it('requires authentication', async () => {
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.getClientConversationThreads).not.toHaveBeenCalled();
    expect(mocks.getAdminMessageInbox).not.toHaveBeenCalled();
  });

  it('returns only the client-authorized inventory for a client', async () => {
    mocks.viewer = { id: 'client-user', role: 'client', fullName: 'Client' };
    mocks.getClientConversationThreads.mockResolvedValue([{ kind: 'project', id: PROJECT, title: 'Own Project', projectId: PROJECT, projectName: 'Own Project', unreadCount: 3, lastMessageAt: null, lastMessagePreview: null }]);

    const response = await GET();
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.threads).toEqual([expect.objectContaining({ key: `project:${PROJECT}`, title: 'Own Project', unreadCount: 3 })]);
    expect(mocks.getAdminMessageInbox).not.toHaveBeenCalled();
    expect(mocks.getAdminProjects).not.toHaveBeenCalled();
  });

  it('uses the admin inventory and project metadata for an admin', async () => {
    mocks.viewer = { id: 'admin-user', role: 'admin', fullName: 'Admin' };
    mocks.getAdminProjects.mockResolvedValue([{ id: PROJECT, projectName: 'Project', ownerName: 'Admin', clientName: 'Frankfurt Client', clientId: 'client', status: 'active', completedTasks: 0, totalTasks: 1, createdAt: '2026-01-01T00:00:00Z', isPrimary: true }]);
    mocks.getAdminMessageInbox.mockResolvedValue([{ kind: 'project', resourceId: PROJECT, projectId: PROJECT, projectName: 'Project', taskTitle: null, senderName: 'Frankfurt Client', preview: 'Update', lastMessageAt: '2026-01-02T00:00:00Z', unreadCount: 4, href: '/unused' }]);

    const response = await GET();
    const result = await response.json();

    expect(result.threads).toEqual([expect.objectContaining({ key: `project:${PROJECT}`, clientName: 'Frankfurt Client', unreadCount: 4 })]);
    expect(mocks.getClientConversationThreads).not.toHaveBeenCalled();
  });
});
