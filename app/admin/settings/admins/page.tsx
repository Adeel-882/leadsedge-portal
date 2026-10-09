import { requireRole } from '@/lib/auth';
import { Administrators } from '@/components/admin/administrators';

export default async function AdministratorsPage() {
  await requireRole('admin');
  return <Administrators />;
}
