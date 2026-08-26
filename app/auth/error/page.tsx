import Link from 'next/link';
import { Brand } from '@/components/brand';

export default function AuthErrorPage() {
  return <main className="grid min-h-screen place-items-center bg-[#f3f6f9] p-5"><div className="card w-full max-w-md p-8 text-center"><div className="flex justify-center"><Brand /></div><h1 className="mt-8 text-2xl font-bold">This sign-in link is unavailable</h1><p className="mt-3 text-sm leading-6 text-muted">It may have expired or already been used. Request a new secure link to continue.</p><Link href="/auth/sign-in" className="button-primary mt-6">Request a new link</Link></div></main>;
}
