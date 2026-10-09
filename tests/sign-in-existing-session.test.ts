import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ viewer: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getViewer: mocks.viewer }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock('@/components/auth/auth-shell', () => ({ AuthShell: () => null }));
vi.mock('@/components/auth/sign-in-form', () => ({ SignInForm: () => null }));
import Page from '@/app/auth/sign-in/page';
beforeEach(() => mocks.viewer.mockReset());
it('reuses an existing client session for a previously sent task email', async () => {
  mocks.viewer.mockResolvedValue({ id: 'client-1', role: 'client' });
  await expect(Page({ searchParams: Promise.resolve({ next: '/portal/tasks/task-1' }) })).rejects.toThrow('REDIRECT:/portal/tasks/task-1');
});
it('renders sign-in for a logged-out task visitor', async () => {
  mocks.viewer.mockResolvedValue(null);
  await expect(Page({ searchParams: Promise.resolve({ next: '/portal/tasks/task-1' }) })).resolves.toBeTruthy();
});
it.each(['https://evil.example', '//evil.example', '/%2f%2fevil.example', '/portal/\\evil', '/admin/settings'])('does not redirect a client to %s', async next => {
  mocks.viewer.mockResolvedValue({ id: 'client-1', role: 'client' });
  await expect(Page({ searchParams: Promise.resolve({ next }) })).rejects.toThrow('REDIRECT:/portal');
});
it('keeps administrator routing role-aware', async () => {
  mocks.viewer.mockResolvedValue({ id: 'admin-1', role: 'admin' });
  await expect(Page({ searchParams: Promise.resolve({ next: '/portal/tasks/task-1' }) })).rejects.toThrow('REDIRECT:/admin');
});
