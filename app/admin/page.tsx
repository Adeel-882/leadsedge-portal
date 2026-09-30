import { CachedDashboard } from '@/components/cache/admin';
import { requireRole } from '@/lib/auth';
import { initialScreen } from '@/lib/screen-data';
export default async function Page() { const viewer=await requireRole('admin'); return <CachedDashboard ownerName={viewer.fullName} initial={await initialScreen('admin','dashboard')}/>; }