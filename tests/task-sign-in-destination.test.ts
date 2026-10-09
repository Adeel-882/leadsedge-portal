import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  pathname: '/portal/tasks/task-1', authenticated: false,
  bootstrap: null as null | { viewer: { id: string; role: string } },
  claims: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-leadsedge-pathname': state.pathname }) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock('@/lib/env', () => ({ isDemoMode: () => false }));
vi.mock('@/lib/bootstrap', () => ({ getPortalBootstrap: async () => state.bootstrap }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => null }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getClaims: state.claims } }) }));
import { requireBootstrapRole } from '@/lib/auth';

beforeEach(() => {
  state.pathname = '/portal/tasks/task-1';
  state.bootstrap = null;
  state.claims.mockResolvedValue({ data: { claims: null } });
});
it('sends a logged-out task visitor to sign-in with the exact task destination', async () => {
  await expect(requireBootstrapRole('client')).rejects.toThrow('REDIRECT:/auth/sign-in?next=%2Fportal%2Ftasks%2Ftask-1');
});
it('reuses valid client claims and bootstrap without redirecting to login', async () => {
  state.claims.mockResolvedValue({ data: { claims: { sub: 'client-1' } } });
  state.bootstrap = { viewer: { id: 'client-1', role: 'client' } };
  expect(await requireBootstrapRole('client')).toBe(state.bootstrap);
});
it('keeps an administrator on the existing admin path', async () => {
  state.claims.mockResolvedValue({ data: { claims: { sub: 'admin-1' } } });
  state.bootstrap = { viewer: { id: 'admin-1', role: 'admin' } };
  await expect(requireBootstrapRole('client')).rejects.toThrow('REDIRECT:/admin');
});
it.each(['https://evil.example', '//evil.example', '/%2f%2fevil.example', '/portal/\\evil', '/admin/settings'])('rejects an unsafe or cross-role destination %s', async path => {
  state.pathname = path;
  await expect(requireBootstrapRole('client')).rejects.toThrow('REDIRECT:/auth/sign-in?next=%2Fportal');
});
