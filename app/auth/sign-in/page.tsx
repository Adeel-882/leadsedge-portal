import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/admin';
  return <AuthShell eyebrow="Secure access" title="Sign in to your portal" description="Enter your authorized email address. We will send a short-lived sign-in link, so you never need a password."><SignInForm nextPath={nextPath} /><p className="mt-6 text-xs leading-5 text-muted">Only invited clients and authorized administrators can enter.</p></AuthShell>;
}
