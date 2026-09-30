import { CachedPeople } from '@/components/cache/admin';
import { requireRole } from '@/lib/auth';
import { initialScreen } from '@/lib/screen-data';
export default async function Page({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}) { await requireRole('admin'); const params=await searchParams; const search=(params.q||'').trim().slice(0,160); const page=Math.max(1,Math.min(10000,Number.parseInt(params.page||'1',10)||1)); return <CachedPeople search={search} page={page} initial={await initialScreen('admin','people',[search,String(page)])}/>; }