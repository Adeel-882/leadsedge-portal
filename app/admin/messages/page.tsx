import { CachedMessages } from '@/components/cache/messages';
import { requireRole } from '@/lib/auth';
import { initialScreen, getTaskMessages, getProjectMessages } from '@/lib/screen-data';
import { resolveMessageThread } from '@/lib/message-workspace';
export default async function Page({searchParams}:{searchParams:Promise<{thread?:string}>}) {
 await requireRole('admin'); const {thread}=await searchParams;
 const initial=await initialScreen('admin','conversations');
 const selected=initial && resolveMessageThread(initial.data.threads,thread);
 const initialMessages=selected ? selected.kind==='task' ? await getTaskMessages(selected.resourceId) : await getProjectMessages(selected.resourceId) : undefined;
 return <div className="page-wrap messages-page"><div className="mb-5 messages-page-heading"><p className="page-eyebrow">Communication</p><h1 className="page-title">Messages</h1></div><CachedMessages initial={initial} requested={thread} initialMessages={initialMessages} initialKey={selected?.key}/></div>;
}
