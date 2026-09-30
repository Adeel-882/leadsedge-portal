import { CachedMeetings } from '@/components/cache/client-meetings';
import { requireRole } from '@/lib/auth';
import { initialScreen } from '@/lib/screen-data';
export default async function Page() { await requireRole('client'); return <CachedMeetings initial={await initialScreen('client','meetings')}/>; }