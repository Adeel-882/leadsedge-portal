import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.createClient }));
import { GET } from '@/app/auth/sign-out/route';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe('device-local sign out', () => {
  it('revokes only browser B through the SDK contract and keeps the production redirect HTTPS', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://portal.leadsedge.us');
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ auth: { signOut } });
    const response = await GET(new Request('http://internal:3000/auth/sign-out'));
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(response.headers.get('location')).toBe('https://portal.leadsedge.us/auth/sign-in');
  });
  it('preserves local development and safely handles an absent client', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:3000');
    mocks.createClient.mockResolvedValue(null);
    const response = await GET(new Request('http://127.0.0.1:3000/auth/sign-out'));
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/auth/sign-in');
  });
});
