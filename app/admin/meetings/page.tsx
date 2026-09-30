import { CachedMeetings } from '@/components/cache/admin-meetings';
import { requireRole } from '@/lib/auth';
import { initialScreen } from '@/lib/screen-data';
export default async function Page() { await requireRole('admin'); return <CachedMeetings initial={await initialScreen('admin','meetings')}/>; }