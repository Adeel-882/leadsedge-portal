import { redirect } from 'next/navigation';
import { demoAdmin, demoClientViewer } from './demo-data';
import { isDemoMode } from './env';
import { createSupabaseServerClient } from './supabase/server';
import type { Role, Viewer } from './types';

export async function getViewer(): Promise<Viewer | null> {
  if (isDemoMode()) return demoAdmin;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data: profile } = await supabase.from('users').select('id,email,role,full_name,avatar_url').eq('id', authData.user.id).maybeSingle();
  if (!profile) return null;
  let fullName = profile.full_name;
  if (profile.role === 'admin') {
    const { data: settings } = await supabase.from('admin_settings').select('display_name').eq('user_id', profile.id).maybeSingle();
    fullName = settings?.display_name || fullName;
  }
  return { id: profile.id, email: profile.email, role: profile.role as Role, fullName, avatarUrl: profile.avatar_url };
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
