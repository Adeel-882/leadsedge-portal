import { requireRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
export default async function Page() { await requireRole('client'); redirect('/portal'); }
