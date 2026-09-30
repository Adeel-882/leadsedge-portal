import { CachedHome } from '@/components/cache/home';
import { requireBootstrapRole } from '@/lib/auth';
import { initialScreen } from '@/lib/screen-data';
export default async function Page() { const {viewer,unread}=await requireBootstrapRole('client'); return <CachedHome viewer={viewer} unread={unread} initial={await initialScreen('client','home')}/>; }