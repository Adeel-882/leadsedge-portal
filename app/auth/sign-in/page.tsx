import { Brand } from '@/components/brand';
import { SignInForm } from '@/components/auth/sign-in-form';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/admin';
  return <main className="grid min-h-screen place-items-center bg-[#f3f6f9] p-5"><div className="w-full max-w-md rounded-3xl border border-line bg-white p-7 shadow-[0_24px_70px_rgba(14,37,65,.12)] sm:p-9"><Brand /><p className="page-eyebrow mt-10">Secure access</p><h1 className="text-3xl font-bold tracking-[-.035em]">Sign in to your portal</h1><p className="mt-3 text-sm leading-6 text-muted">We’ll email you a short-lived magic link. Clients never need a password.</p><SignInForm nextPath={nextPath} /><p className="mt-6 text-center text-xs leading-5 text-muted">Only invited clients and authorized administrators can enter.</p></div></main>;
}
