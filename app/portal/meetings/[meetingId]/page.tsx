import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';

export default async function PortalMeetingPage() {
  await requireRole('client');
  redirect('/portal');
}
