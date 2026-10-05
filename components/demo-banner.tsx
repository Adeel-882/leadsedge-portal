import { hasEmailEnv, isDemoMode } from '@/lib/env';

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return <div className="border-b border-line bg-info-soft px-4 py-2 text-center text-xs font-medium text-info">Interactive demo mode. Records are temporary and are not read from Supabase.</div>;
}

export function EmailConfigurationBanner() {
  if (isDemoMode() || hasEmailEnv()) return null;
  return <div className="border-b border-warning-border bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning">Email delivery is not configured. Database-backed work remains available; invitations can be resent after Resend is connected.</div>;
}
