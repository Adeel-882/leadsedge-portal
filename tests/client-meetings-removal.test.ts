import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { clientNotificationDestination } from '../lib/client-navigation';
const mocks = vi.hoisted(() => ({ requireRole: vi.fn(async () => ({ role: 'client' })), redirect: vi.fn((path: string) => { throw new Error('REDIRECT:' + path); }) }));
vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
import Meetings from '../app/portal/meetings/page';
import Meeting from '../app/portal/meetings/[meetingId]/page';

describe('client Meetings retirement', () => {
  it.each([Meetings, Meeting])('redirects client list and detail routes after authorization', async route => {
    await expect(route()).rejects.toThrow('REDIRECT:/portal');
    expect(mocks.requireRole).toHaveBeenCalledWith('client');
  });
  it('redirects historical client meeting links without changing task/message destinations', () => {
    for (const path of ['/portal/meetings', '/portal/meetings/123?cancelled=true']) expect(clientNotificationDestination(path)).toBe('/portal');
    expect(clientNotificationDestination('/portal/tasks/123')).toBe('/portal/tasks/123');
    expect(clientNotificationDestination('/portal/messages?thread=project%3A123')).toBe('/portal/messages?thread=project%3A123');
    expect(clientNotificationDestination('https://external.test')).toBe('/portal');
  });
  it('removes shared client navigation and home booking shortcuts while retaining admin Meetings', () => {
    const read = (path: string) => readFileSync(path, 'utf8');
    expect(read('components/portal/portal-shell.tsx')).not.toContain('/portal/meetings');
    expect(read('components/cache/home.tsx')).not.toMatch(/\/portal\/meetings|nextMeeting|Book a meeting/);
    expect(read('components/admin/admin-shell.tsx')).toContain('/admin/meetings');
    expect(read('app/admin/meetings/page.tsx')).not.toContain("redirect('/portal')");
  });
});
