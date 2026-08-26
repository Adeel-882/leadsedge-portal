import { isDemoMode } from '@/lib/env';

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return <div className="border-b border-[#bde4dd] bg-[#e9f8f5] px-4 py-2 text-center text-xs font-medium text-[#09675e]">Interactive demo mode — connect Supabase and Resend to persist data and send invitations.</div>;
}
