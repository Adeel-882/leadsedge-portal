import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: vi.fn(), access: vi.fn(), initial: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireRole: mocks.role }));
vi.mock('@/lib/client-access', () => ({ getAuthorizedClientTask: mocks.access }));
vi.mock('@/lib/screen-data', () => ({ initialScreen: mocks.initial }));
vi.mock('@/components/cache/task', () => ({ CachedTask: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
import Page from '@/app/portal/tasks/[taskId]/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: 'client-a' });
  mocks.initial.mockResolvedValue(undefined); // Warm navigation: browser owns data.
});

it('checks task authority before returning a warm cached task screen', async () => {
  mocks.access.mockResolvedValue({ id: 'own-task' });
  await expect(Page({ params: Promise.resolve({ taskId: 'own-task' }) })).resolves.toBeTruthy();
  expect(mocks.access).toHaveBeenCalledWith('client-a', 'own-task');
  expect(mocks.initial).toHaveBeenCalledWith('client', 'task', ['own-task']);
});

it('denies a revoked or foreign task even when browser data would still be fresh', async () => {
  mocks.access.mockResolvedValue(null);
  await expect(Page({ params: Promise.resolve({ taskId: 'foreign-task' }) })).rejects.toThrow('NOT_FOUND');
  expect(mocks.access).toHaveBeenCalledWith('client-a', 'foreign-task');
  // Navigation detection runs first, but performs no business read on a warm request.
  expect(mocks.initial).toHaveBeenCalledWith('client', 'task', ['foreign-task']);
});

it('reuses the authorized cold-screen result without a second task access read', async () => {
  mocks.initial.mockResolvedValue({ data: { task: { id: 'own-task' } }, updatedAt: 1 });
  await expect(Page({ params: Promise.resolve({ taskId: 'own-task' }) })).resolves.toBeTruthy();
  expect(mocks.access).not.toHaveBeenCalled();
});

it('denies an unauthorized cold-screen result before rendering', async () => {
  mocks.initial.mockResolvedValue({ data: null, updatedAt: 1 });
  await expect(Page({ params: Promise.resolve({ taskId: 'foreign-task' }) })).rejects.toThrow('NOT_FOUND');
  expect(mocks.access).not.toHaveBeenCalled();
});
