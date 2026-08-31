import Link from 'next/link';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { AuthShell } from '@/components/auth/auth-shell';

const messages = {
  expired: 'This link has expired or has already been used. Ask your administrator to resend the invitation.',
  invalid: 'This invitation link is incomplete or invalid. Ask your administrator to send a new one.',
  unauthorized: 'This account is not linked to an authorized Leadsedge Portal workspace.',
  configuration: 'Authentication is temporarily unavailable. Please try again later.',
} as const;

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = messages[reason as keyof typeof messages] || 'It may have expired or already been used. Request a new secure link to continue.';
  return <AuthShell eyebrow="Access link unavailable" title="This sign-in link cannot be used" description={message}><div className="mt-8 rounded-lg border border-[#ead1d1] bg-[#fbf2f2] p-4"><div className="flex gap-3"><WarningCircle className="mt-0.5 flex-none text-[#963d3d]" size={19} aria-hidden /><p className="text-sm leading-6 text-[#6f4848]">For security, invitation and sign-in links expire and can only be used once.</p></div></div><Link href="/auth/sign-in" className="button-primary mt-6 w-full">Request a new link</Link></AuthShell>;
}
