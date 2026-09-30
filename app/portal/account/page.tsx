import { getViewerWithContact, requireRole } from '@/lib/auth';
import { initials } from '@/lib/format';

export default async function ClientAccountPage() {
  await requireRole('client');
  const viewer = await getViewerWithContact();
  if (!viewer) return null;
  return <div><div className="mb-7"><p className="page-eyebrow">Your profile</p><h1 className="page-title">Account</h1><p className="page-subtitle">Your secure magic-link account details.</p></div><div className="card max-w-xl p-6"><div className="flex items-center gap-4"><span className="avatar h-14 w-14 bg-[#e8f5f2] text-base text-teal">{initials(viewer.fullName)}</span><div><h2 className="text-lg font-bold">{viewer.fullName}</h2><p className="text-sm text-muted">{viewer.email}</p></div></div><div className="mt-6 rounded-xl bg-[#f7f9fb] p-4"><p className="text-sm font-semibold">Passwordless access</p><p className="mt-1 text-xs leading-5 text-muted">You sign in through secure, expiring email links. There is no password to remember.</p></div><a className="button-secondary mt-6 w-full" href="/auth/sign-out">Sign out</a></div></div>;
}
