import { redirect } from 'next/navigation';
import { cache } from 'react';
import { demoAdmin, demoClientViewer } from './demo-data';
import { isDemoMode } from './env';
import { createSupabaseAdminClient } from './supabase/admin';
import { createSupabaseServerClient } from './supabase/server';
import type { Role, Viewer } from './types';

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

const profileColumns = 'id,email,role,full_name,avatar_url,admin_settings(display_name)';

function selectProfile(supabase: SupabaseServerClient, userId: string) {
  return supabase.from('users').select(profileColumns).eq('id', userId).maybeSingle();
}

const getRequestViewer = cache(async (): Promise<Viewer | null> => {
  if (isDemoMode()) return demoAdmin;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  // getUser() validates the session against the auth server and remains the only
  // thing authorization depends on. The profile row is keyed by the same subject
  // id that the stored session already carries, so it is fetched concurrently
  // rather than waiting a full round trip for getUser() to return first. Any
  // result that does not belong to the verified user is discarded and refetched.
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = sessionData.session?.user?.id;
  const [{ data: authData }, speculativeProfile] = await Promise.all([
    supabase.auth.getUser(),
    sessionUserId ? selectProfile(supabase, sessionUserId) : Promise.resolve(null),
  ]);
  if (!authData.user) return null;

  const speculative = speculativeProfile?.data;
  const profile = speculative && speculative.id === authData.user.id
    ? speculative
    : (await selectProfile(supabase, authData.user.id)).data;
  if (!profile) return null;

  const settings = Array.isArray(profile.admin_settings) ? profile.admin_settings[0] : profile.admin_settings;
  const fullName = profile.role === 'admin' ? settings?.display_name || profile.full_name : profile.full_name;
  return { id: profile.id, email: profile.email, role: profile.role as Role, fullName, avatarUrl: profile.avatar_url };
});

export async function getViewer(): Promise<Viewer | null> {
  return getRequestViewer();
}

export async function requireRole(role: Role): Promise<Viewer> {
  if (isDemoMode()) return role === 'admin' ? demoAdmin : demoClientViewer;
  const viewer = await getViewer();
  if (!viewer) redirect(`/auth/sign-in?next=${role === 'admin' ? '/admin' : '/portal'}`);
  if (viewer.role !== role) redirect(viewer.role === 'admin' ? '/admin' : '/portal');
  return viewer;
}

export async function requireApiRole(role: Role) {
  if (isDemoMode()) return role === 'admin' ? demoAdmin : demoClientViewer;
  const viewer = await getViewer();
  if (!viewer || viewer.role !== role) return null;
  return viewer;
}

export async function administratorExists(): Promise<boolean | null> {
  if (isDemoMode()) return true;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { count, error } = await admin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin');
  if (error) return null;
  return (count || 0) > 0;
}
