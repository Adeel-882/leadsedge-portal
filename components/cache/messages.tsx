'use client';
import { CachedScreen } from '../cached-screen';
import { MessagesWorkspace } from '../messages-workspace';
import { useCacheIdentity } from '../query-provider';
import { resolveMessageThread, parseMessageThreadKey, emptyAdminProjectThread } from '@/lib/message-workspace';
import type { ScreenData } from '@/lib/screen-data';
import type { ConversationMessage } from '@/lib/types';
export function CachedMessages({initial,requested,initialMessages,initialKey}:{initial?:{data:ScreenData<'conversations'>;updatedAt:number};requested?:string;initialMessages?:ConversationMessage[];initialKey?:string}) {
 const identity=useCacheIdentity();
 return <CachedScreen screen="conversations" initial={initial}>{data=>{
  const threads=[...data.threads]; const parsed=parseMessageThreadKey(requested);
  if(identity.role==='admin' && parsed?.kind==='project' && !threads.some(t=>t.key===requested)) {const project=data.projects.find(p=>p.id===parsed.resourceId);if(project) threads.push(emptyAdminProjectThread(project));}
  const selected=resolveMessageThread(threads,requested);
  return <MessagesWorkspace role={identity.role} viewerId={identity.id} initialThreads={threads} projects={data.projects} initialSelectedKey={selected?.key || null} initialMessages={selected?.key===initialKey ? initialMessages : undefined} initialMobileConversation={Boolean(requested && threads.some(t=>t.key===requested))}/>;
 }}</CachedScreen>;
}
