import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/env', () => ({ hasSupabaseEnv: () => true }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: null } }) } }) }));
import { proxy } from '@/proxy';
it('overwrites a forged destination with the actual request path', async () => {
  const response = await proxy(new NextRequest('https://portal.leadsedge.us/portal/tasks/task-1', {
    headers: { 'x-leadsedge-pathname': '/portal/tasks/foreign-task' },
  }));
  expect(response.headers.get('x-middleware-request-x-leadsedge-pathname')).toBe('/portal/tasks/task-1');
});
