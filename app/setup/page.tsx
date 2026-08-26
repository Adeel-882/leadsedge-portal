import Link from 'next/link';
import { Brand } from '@/components/brand';
import { SetupAdminForm } from '@/components/setup-admin-form';
import { getViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';

export default async function SetupPage() {
  const viewer = await getViewer();
  return <main className="grid min-h-screen place-items-center bg-[#f3f6f9] p-5"><div className="card w-full max-w-lg p-7 sm:p-9"><Brand /><p className="page-eyebrow mt-9">One-time setup</p><h1 className="text-3xl font-bold tracking-[-.035em]">Create the first administrator</h1><p className="mt-3 text-sm leading-6 text-muted">For safety, first create your own user in Supabase Authentication, sign in with that address, then finish setup here. This route refuses to create another administrator once one exists.</p>{isDemoMode() ? <div className="mt-7 rounded-xl bg-[#fff4df] p-4 text-sm text-[#805c18]">Connect Supabase first. Demo mode already includes a safe placeholder administrator.</div> : viewer ? <SetupAdminForm initialName={viewer.fullName} /> : <Link href="/auth/sign-in?next=/setup" className="button-primary mt-7 w-full">Sign in to continue setup</Link>}</div></main>;
}
