import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';
import { destinationForRole, safeInternalPath } from '@/lib/auth-flow';
import { getViewer } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const nextPath = safeInternalPath(params.next ?? null, '/admin');
  // Older task emails link here. Reuse the browser's session; destination
  // routes still enforce assignment, membership, visibility, and RLS.
  if (params.next) {
    const viewer = await getViewer();
    if (viewer) redirect(destinationForRole(viewer.role, nextPath));
  }
  return <AuthShell eyebrow="Secure access" title="Sign in to your portal" description="Enter your authorized email address. We will send a short-lived sign-in link, so you never need a password."><SignInForm nextPath={nextPath} /><p className="mt-6 text-xs leading-5 text-muted">Only invited clients and authorized administrators can enter.</p></AuthShell>;
}
