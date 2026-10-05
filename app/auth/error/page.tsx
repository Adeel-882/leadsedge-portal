import Link from 'next/link';
import { WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { AuthShell } from '@/components/auth/auth-shell';

const messages = {
  expired: 'This link has expired or has already been used. Request a new secure sign-in link to continue.',
  invalid: 'This sign-in link is incomplete or invalid. Request a new secure link to continue.',
  unauthorized: 'This account is not linked to an authorized Leadsedge Portal workspace.',
  configuration: 'Authentication is temporarily unavailable. Please try again later.',
  different_device: 'This link must be opened in the same browser that requested it. Request a new link and open it on this device.',
} as const;

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = messages[reason as keyof typeof messages] || 'It may have expired or already been used. Request a new secure link to continue.';
  return <AuthShell eyebrow="Access link unavailable" title="This sign-in link cannot be used" description={message}><div className="mt-8 rounded-lg border border-danger-border bg-danger-soft p-4"><div className="flex gap-3"><WarningCircle className="mt-0.5 flex-none text-danger" size={19} aria-hidden /><p className="text-sm leading-6 text-danger">For security, invitation and sign-in links expire and can only be used once.</p></div></div><Link href="/auth/sign-in" className="button-primary mt-6 w-full">Request a new link</Link></AuthShell>;
}
