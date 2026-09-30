import { CachedTemplates } from '@/components/cache/admin';
import { requireRole } from '@/lib/auth';
import { initialScreen } from '@/lib/screen-data';
export default async function Page() { await requireRole('admin'); return <CachedTemplates initial={await initialScreen('admin','templates')}/>; }