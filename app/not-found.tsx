import Link from 'next/link';
import { Brand } from '@/components/brand';

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-[#f3f6f9] p-5"><div className="card max-w-md p-8 text-center"><div className="flex justify-center"><Brand /></div><p className="page-eyebrow mt-8">Unavailable</p><h1 className="text-2xl font-bold">This page isn’t available</h1><p className="mt-3 text-sm leading-6 text-muted">The project or task may have been removed, or your account does not have access to it.</p><Link href="/" className="button-primary mt-6">Return to your workspace</Link></div></main>;
}
