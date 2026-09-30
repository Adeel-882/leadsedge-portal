import { CachedTasks } from '@/components/cache/tasks';
import { requireRole } from '@/lib/auth';
import { initialScreen } from '@/lib/screen-data';
export default async function Page() { await requireRole('client'); return <CachedTasks initial={await initialScreen('client','tasks')}/>; }