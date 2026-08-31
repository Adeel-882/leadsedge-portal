import { hasEmailEnv, isDemoMode } from '@/lib/env';

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return <div className="border-b border-[#bde4dd] bg-[#e9f8f5] px-4 py-2 text-center text-xs font-medium text-[#09675e]">Interactive demo mode. Records are temporary and are not read from Supabase.</div>;
}

export function EmailConfigurationBanner() {
  if (isDemoMode() || hasEmailEnv()) return null;
  return <div className="border-b border-[#f0d9a8] bg-[#fff7e7] px-4 py-2 text-center text-xs font-medium text-[#805c18]">Email delivery is not configured. Database-backed work remains available; invitations can be resent after Resend is connected.</div>;
}
