import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { destinationForRole } from './auth-flow';
import { cache } from 'react';
import { demoAdmin, demoClientViewer } from './demo-data';
import { isDemoMode } from './env';
import { getPortalBootstrap, type PortalBootstrap } from './bootstrap';
import { createSupabaseAdminClient } from './supabase/admin';
import { createSupabaseServerClient } from './supabase/server';
import type { Role, Viewer } from './types';
import { measureServerOperation } from './perf';

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

const profileColumns = 'id,email,role,full_name,avatar_url,admin_settings(display_name)';

function selectProfile(supabase: SupabaseServerClient, userId: string) {
  return supabase.from('users').select(profileColumns).eq('id', userId).maybeSingle();
}

const getRequestBootstrap = cache(async (): Promise<PortalBootstrap | null> => {
  if (isDemoMode()) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: claimsData } = await measureServerOperation('auth.getClaims', () => supabase.auth.getClaims());
  if (typeof claimsData?.claims?.sub !== 'string') return null;
  return getPortalBootstrap();
});

export async function getViewer(): Promise<Viewer | null> {
  if (isDemoMode()) return demoAdmin;
  return (await getRequestBootstrap())?.viewer || null;
}

export const getViewerWithContact = cache(async (): Promise<Viewer | null> => {
  if (isDemoMode()) return demoAdmin;
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: profile } = await measureServerOperation('profile.select.contact', () => selectProfile(supabase, viewer.id));
  if (!profile || profile.id !== viewer.id || profile.role !== viewer.role) return null;
  return { ...viewer, email: profile.email, avatarUrl: profile.avatar_url };
});

export async function requireBootstrapRole(role: Role): Promise<PortalBootstrap> {
  if (isDemoMode()) return {
    viewer: role === 'admin' ? demoAdmin : demoClientViewer,
    authorization: { disabled: false },
    shell: { primaryProjectId: null, projectName: null },
    unread: { messages: 0, notifications: 0 },
  };
  const bootstrap = await getRequestBootstrap();
  if (!bootstrap) {
    const pathname = (await headers()).get('x-leadsedge-pathname');
    const next = destinationForRole(role, pathname);
    redirect(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  }
  if (bootstrap.viewer.role !== role) redirect(bootstrap.viewer.role === 'admin' ? '/admin' : '/portal');
  return bootstrap;
}

export async function requireRole(role: Role): Promise<Viewer> {
  return (await requireBootstrapRole(role)).viewer;
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
