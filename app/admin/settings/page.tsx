import { requireRole } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/components/settings-form';

export default async function AdminSettingsPage() {
  const viewer = await requireRole('admin');
  let timezone = 'Asia/Karachi';
  if (!isDemoMode()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase!.from('admin_settings').select('timezone').eq('user_id', viewer.id).maybeSingle();
    timezone = data?.timezone || 'UTC';
  }
  return <div className="page-wrap"><div className="mb-8"><p className="page-eyebrow">Administrator</p><h1 className="page-title">Profile settings</h1><p className="page-subtitle">Control the name and timezone clients see.</p></div><SettingsForm displayName={viewer.fullName} timezone={timezone} /></div>;
}
