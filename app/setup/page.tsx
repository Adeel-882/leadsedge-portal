import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { SetupAdminForm } from '@/components/setup-admin-form';
import { administratorExists, getViewerWithContact } from '@/lib/auth';
import { getServerEnvironmentStatus } from '@/lib/env';

export default async function SetupPage() {
  const environment = getServerEnvironmentStatus();
  const [viewer, adminExists] = environment.demoMode || !environment.supabaseConfigured
    ? [null, environment.demoMode ? true : null]
    : await Promise.all([getViewerWithContact(), administratorExists()]);

  let content: React.ReactNode;
  if (environment.demoMode) {
    content = <div className="mt-7 rounded-xl bg-[#fff4df] p-4 text-sm text-[#805c18]">Demo mode is enabled. Disable it and connect Supabase before administrator setup.</div>;
  } else if (!environment.supabaseConfigured) {
    content = <div className="mt-7 rounded-xl bg-[#fff0f0] p-4 text-sm text-[#9c3434]">Supabase server configuration is incomplete. Add the missing environment variables and restart the application.</div>;
  } else if (adminExists === null) {
    content = <div className="mt-7 rounded-xl bg-[#fff0f0] p-4 text-sm text-[#9c3434]">The application could not verify administrator setup. Check the Supabase connection and try again.</div>;
  } else if (adminExists) {
    content = <div className="mt-7 space-y-4"><div className="rounded-xl bg-[#eef7f5] p-4 text-sm text-[#116b63]">Administrator setup is already complete. This one-time route is now locked.</div><Link href={viewer?.role === 'admin' ? '/admin' : '/auth/sign-in?next=/admin'} className="button-primary w-full">{viewer?.role === 'admin' ? 'Open admin dashboard' : 'Sign in as administrator'}</Link></div>;
  } else if (viewer) {
    content = <SetupAdminForm initialName={viewer.fullName} />;
  } else {
    content = <Link href="/auth/sign-in?next=/setup" className="button-primary mt-7 w-full">Sign in to continue setup</Link>;
  }

  return <AuthShell eyebrow="One-time setup" title="Create the first administrator" description="Create your user in Supabase Authentication, sign in with that address, then finish setup here. This route locks as soon as an administrator exists.">{content}</AuthShell>;
}
