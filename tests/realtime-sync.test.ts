import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {QueryObserver} from '@tanstack/react-query';
import type {SupabaseClient} from '@supabase/supabase-js';
import {RealtimeSync} from '@/lib/realtime-sync';
import {makeQueryClient,queryKeys} from '@/lib/query-cache';
import {appendMessage,removeMessage,flattenMessages,mergeNewest,mergeGap,type MessagePages} from '@/lib/message-cache';
import {retainOpenProjectThreads} from '@/lib/message-workspace';
import type {ConversationMessage,MessageWorkspaceThread} from '@/lib/types';
const id=(n:number)=>`71000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const identity={id:id(1),role:'client' as const};
const message=(n:number,sender=id(2)):ConversationMessage=>({id:id(n),senderId:sender,senderName:'Member',senderRole:'client',body:'Test',attachmentUrl:null,createdAt:new Date(1700000000000+n*1000).toISOString()});
const row=(n:number,kind='project',resource=id(3),sender=id(2))=>({id:id(n),[kind+'_id']:resource,sender_id:sender,message_type:'user',body:'Test',created_at:message(n).createdAt});
const thread=(kind='project',resource=id(3)):MessageWorkspaceThread=>({key:kind+':'+resource,kind:kind as 'project'|'task',resourceId:resource,projectId:id(3),title:'Known',projectName:'Known',clientName:null,senderName:null,preview:null,lastMessageAt:null,unreadCount:20});
let client:ReturnType<typeof makeQueryClient>;
let sync:RealtimeSync;
const key=(name:string,...args:string[])=>queryKeys.data(identity,name,...args);
const history=(kind='project',resource=id(3))=>queryKeys.messages(identity,kind,resource);
function seed(kind='project',resource=id(3)) {
 client.setQueryData(history(kind,resource),{pages:[{messages:[message(10)],hasMore:false}],pageParams:[null]});
 client.setQueryData(key('conversations'),{threads:[thread(kind,resource),thread('project',id(4))],projects:[]});
 client.setQueryData(key('unread'),{messages:80,notifications:5});
}
function transport(viewerId=identity.id) {
 const callbacks:Array<{config:Record<string,string>;callback:(p:{new:Record<string,unknown>})=>void}>=[];
 let status:(value:string)=>void=()=>{};
 const channel={on:vi.fn((_type:string,config:Record<string,string>,callback:(p:{new:Record<string,unknown>})=>void)=>{callbacks.push({config,callback});return channel;}),subscribe:vi.fn((callback:(s:string)=>void)=>{status=callback;return channel;})};
 const value={channel:vi.fn(()=>channel),removeChannel:vi.fn(async()=> 'ok'),auth:{getSession:vi.fn(async()=>({data:{session:{user:{id:viewerId},access_token:'test-session-token'}}}))},realtime:{setAuth:vi.fn(async()=>{})}};
 return {value,callbacks,status:(s:string)=>status(s),client:value as unknown as SupabaseClient};
}
beforeEach(()=>{vi.useFakeTimers();client=makeQueryClient();sync=new RealtimeSync(client,identity);});
afterEach(()=>{sync.stop();client.clear();vi.useRealTimers();});

it('owns one channel with eight explicitly bounded registrations and no DELETE',async()=>{
 const t=transport();await sync.start(t.client);await sync.start(t.client);
 expect(t.value.channel).toHaveBeenCalledTimes(1);expect(t.callbacks).toHaveLength(8);
 expect(t.callbacks.filter(x=>x.config.table==='project_tasks').map(x=>x.config.event)).toEqual(['INSERT','UPDATE']);
 expect(t.callbacks.some(x=>['*','DELETE'].includes(x.config.event))).toBe(false);
 expect(t.callbacks.filter(x=>x.config.table==='message_read_receipts').every(x=>x.config.filter===`recipient_id=eq.${identity.id}`)).toBe(true);
});
it('thread switching registers callbacks without creating channels',async()=>{
 const t=transport();await sync.start(t.client);for(let n=3;n<10;n++){const off=sync.register('project',id(n),{read:vi.fn(async()=>0),refresh:vi.fn(async()=>{})});off();}
 expect(t.value.channel).toHaveBeenCalledOnce();
});
it('logout removes the channel and ignores late callbacks',async()=>{
 seed();const t=transport();await sync.start(t.client);sync.stop();t.callbacks[0].callback({new:row(11)});expect(flattenMessages(client.getQueryData(history()))).toHaveLength(1);expect(t.value.removeChannel).toHaveBeenCalledOnce();
});
it('an account replacement waits for old channel removal',async()=>{
 const t=transport();await sync.start(t.client);let done!:(v:string)=>void;t.value.removeChannel.mockImplementationOnce(()=>new Promise(r=>{done=r}));sync.stop();
 const nextClient=makeQueryClient();const next=new RealtimeSync(nextClient,{id:id(99),role:'admin'});const t2=transport(id(99));const starting=next.start(t2.client);await Promise.resolve();expect(t2.value.channel).not.toHaveBeenCalled();done('ok');await starting;expect(t2.value.channel).toHaveBeenCalledOnce();next.stop();nextClient.clear();
});
it.each(['project','task'])('%s INSERT updates only its existing history and preview',kind=>{
 seed(kind);client.setQueryData(history('project',id(4)),{pages:[{messages:[message(10)],hasMore:false}],pageParams:[null]});
 sync.event(kind+'_messages','INSERT',row(11,kind));
 expect(flattenMessages(client.getQueryData(history(kind)))).toHaveLength(2);
 expect(flattenMessages(client.getQueryData(history('project',id(4))))).toHaveLength(1);
 expect(client.getQueryData<{threads:MessageWorkspaceThread[]}>(key('conversations'))?.threads[0].lastMessageAt).toBe(message(11).createdAt);
 expect(client.getQueryData(key('unread'))).toEqual({messages:80,notifications:5});
});
it('a background thread event does not read or refresh the selected thread',async()=>{
 seed();const read=vi.fn(async()=>0),refresh=vi.fn(async()=>{});sync.register('project',id(3),{read,refresh});await vi.advanceTimersByTimeAsync(250);read.mockClear();
 sync.event('project_messages','INSERT',row(11,'project',id(4)));await vi.advanceTimersByTimeAsync(250);expect(read).not.toHaveBeenCalled();expect(refresh).not.toHaveBeenCalled();
});
it('selected incoming events request one scoped read without a history GET',async()=>{
 seed();const read=vi.fn(async()=>0),refresh=vi.fn(async()=>{});sync.register('project',id(3),{read,refresh});await vi.advanceTimersByTimeAsync(250);read.mockClear();sync.event('project_messages','INSERT',row(11));sync.event('project_messages','INSERT',row(12));await vi.advanceTimersByTimeAsync(250);expect(read).toHaveBeenCalledOnce();expect(refresh).not.toHaveBeenCalled();
});
it('repeated delivery deduplicates by stable server ID',()=>{seed();sync.event('project_messages','INSERT',row(11));sync.event('project_messages','INSERT',row(11));expect(flattenMessages(client.getQueryData(history()))).toHaveLength(2);});
it.each(['event-first','response-first'])('optimistic send converges without duplicates: %s',order=>{
 seed();const temp={...message(11,identity.id),id:'pending-one'};sync.beginSend('project',id(3),temp.id);client.setQueryData<MessagePages>(history(),data=>appendMessage(data,temp));
 const response=()=>{client.setQueryData<MessagePages>(history(),data=>appendMessage(removeMessage(data,temp.id),message(11,identity.id)));sync.finishSend('project',id(3),temp.id);};
 if(order==='event-first'){sync.event('project_messages','INSERT',row(11,'project',id(3),identity.id));expect(flattenMessages(client.getQueryData(history()))).toHaveLength(2);response();}else{response();sync.event('project_messages','INSERT',row(11,'project',id(3),identity.id));}
 expect(flattenMessages(client.getQueryData(history())).map(m=>m.id)).toEqual([id(10),id(11)]);
});
it('failed optimistic send preserves a received same-account message from another tab',()=>{
 seed();sync.beginSend('project',id(3),'pending-one');sync.event('project_messages','INSERT',row(11,'project',id(3),identity.id));sync.finishSend('project',id(3),'pending-one');expect(flattenMessages(client.getQueryData(history())).map(m=>m.id)).toEqual([id(10),id(11)]);
});
it('receipts reconcile authoritative counts without double subtraction or unrelated invalidation',async()=>{
 seed();client.setQueryData(key('templates'),[]);sync.event('message_read_receipts','UPDATE',{id:id(20),recipient_id:identity.id,read_at:'now'});sync.event('message_read_receipts','UPDATE',{id:id(21),recipient_id:identity.id,read_at:'now'});await vi.advanceTimersByTimeAsync(250);
 expect(client.getQueryState(key('unread'))?.isInvalidated).toBe(true);expect(client.getQueryState(key('conversations'))?.isInvalidated).toBe(true);expect(client.getQueryState(key('templates'))?.isInvalidated).toBe(false);expect(client.getQueryData(key('unread'))).toEqual({messages:80,notifications:5});
});
it('foreign recipients and system messages never change unread or history',async()=>{
 seed();sync.event('message_read_receipts','INSERT',{id:id(20),recipient_id:id(99)});sync.event('notifications','INSERT',{id:id(21),user_id:id(99)});sync.event('project_messages','INSERT',{...row(11),message_type:'system'});await vi.advanceTimersByTimeAsync(250);expect(client.getQueryState(key('unread'))?.isInvalidated).toBe(false);expect(flattenMessages(client.getQueryData(history()))).toHaveLength(1);
});
it('foreign project/task message hints never populate cache',()=>{
 seed();sync.event('project_messages','INSERT',row(11,'project',id(99)));sync.event('task_messages','INSERT',row(12,'task',id(98)));expect(client.getQueryData(history('project',id(99)))).toBeUndefined();expect(client.getQueryData(history('task',id(98)))).toBeUndefined();
});
it('twenty events coalesce into one active unread fetch',async()=>{
 seed();const fetch=vi.fn(async()=>({messages:60,notifications:5}));const observer=new QueryObserver(client,{queryKey:key('unread'),queryFn:fetch,staleTime:120000});const unsubscribe=observer.subscribe(()=>{});
 for(let i=0;i<20;i++)sync.event('message_read_receipts','UPDATE',{id:id(100+i),recipient_id:identity.id});await vi.advanceTimersByTimeAsync(500);expect(fetch).toHaveBeenCalledOnce();expect(client.getQueryData(key('unread'))).toEqual({messages:60,notifications:5});unsubscribe();
});
it('pending read cancels old count fetch and reconciles only after acknowledgment',async()=>{
 seed();let release!:()=>void;const read=sync.withRead(()=>new Promise<void>(r=>{release=r}));await Promise.resolve();await Promise.resolve();sync.communicationChanged();await vi.advanceTimersByTimeAsync(250);expect(client.getQueryState(key('unread'))?.isInvalidated).toBe(false);release();await read;await vi.advanceTimersByTimeAsync(250);expect(client.getQueryState(key('unread'))?.isInvalidated).toBe(true);
});
it('task changes invalidate only exact task, list, summaries and relevant rail',async()=>{
 seed('task',id(5));client.setQueryData(key('home'),{projects:[{id:id(3),clientId:id(6)}]});for(const resource of [['task',id(5)],['task',id(7)],['tasks'],['templates'],['meetings'],['people']])client.setQueryData(key(resource[0],...resource.slice(1)),{});
 sync.event('project_tasks','UPDATE',{id:id(5),project_id:id(3),assignee_id:id(6),client_visible:true,status:'completed',feedback_scheduled_for:'2030-01-08T00:00:00Z'});await vi.advanceTimersByTimeAsync(250);
 expect(client.getQueryState(key('task',id(5)))?.isInvalidated).toBe(true);expect(client.getQueryData(key('task',id(5)))).toEqual({});
 for(const resource of [['task',id(7)],['templates'],['meetings'],['people']])expect(client.getQueryState(key(resource[0],...resource.slice(1)))?.isInvalidated).toBe(false);
});
it('foreign task payload is never trusted or copied, even with a known project',async()=>{
 client.setQueryData(key('home'),{projects:[{id:id(3),clientId:id(6)}]});sync.event('project_tasks','UPDATE',{id:id(99),project_id:id(3),assignee_id:id(98),client_visible:true,status:'active',description:'foreign'});await vi.advanceTimersByTimeAsync(250);expect(client.getQueryData(key('task',id(99)))).toBeUndefined();expect(client.getQueryState(key('home'))?.isInvalidated).toBe(false);
});
it('does not process task DELETE or meeting events',async()=>{
 seed();const spy=vi.spyOn(client,'invalidateQueries');sync.event('project_tasks','DELETE',{id:id(5)});sync.event('meetings','UPDATE',{id:id(5)});await vi.advanceTimersByTimeAsync(250);expect(spy).not.toHaveBeenCalled();
});
it('reconnect fetches only selected newest history and no unrelated queries',async()=>{
 seed();client.setQueryData(key('templates'),[]);const refresh=vi.fn(async()=>{}),read=vi.fn(async()=>0);sync.register('project',id(3),{read,refresh});const t=transport();await sync.start(t.client);t.status('CHANNEL_ERROR');expect(sync.getStatus()).toBe('degraded');t.status('SUBSCRIBED');await vi.advanceTimersByTimeAsync(500);expect(refresh).toHaveBeenCalledOnce();expect(client.getQueryState(key('templates'))?.isInvalidated).toBe(false);
});
it('idle manager generates no recurring refresh work',async()=>{
 seed();const spy=vi.spyOn(client,'invalidateQueries');await vi.advanceTimersByTimeAsync(180000);expect(spy).not.toHaveBeenCalled();
});
it('retains earlier history and enforces 500 with incoming events',()=>{
 seed();for(let n=11;n<=620;n++)sync.event('project_messages','INSERT',row(n));const data=client.getQueryData<MessagePages>(history());expect(data?.pages).toHaveLength(10);expect(flattenMessages(data)).toHaveLength(500);expect(flattenMessages(data).at(-1)?.id).toBe(id(620));
});
it('newest-page reconciliation retains loaded earlier messages and sorts delayed events',()=>{
 let data:MessagePages|undefined;for(let n=1;n<=100;n++)data=appendMessage(data,message(n));const merged=mergeNewest(data,{messages:[message(101),message(102)],hasMore:true});expect(flattenMessages(merged)).toHaveLength(102);const delayed=appendMessage(merged,message(99));expect(flattenMessages(delayed).at(-1)?.id).toBe(id(102));
});
it('never joins with a different browser session identity',async()=>{
 const t=transport(id(99));await sync.start(t.client);expect(t.value.channel).not.toHaveBeenCalled();expect(sync.getStatus()).toBe('degraded');
});
it('binds the current authenticated token before subscribing',async()=>{
 const t=transport();await sync.start(t.client);expect(t.value.realtime.setAuth).toHaveBeenCalledWith('test-session-token');expect(t.value.realtime.setAuth.mock.invocationCallOrder[0]).toBeLessThan(t.value.channel.mock.invocationCallOrder[0]);
});
it('retains an opened empty admin project only while still authorized',()=>{
 const project={id:id(3),projectName:'Allowed',clientName:'Client'} as import('@/lib/types').ProjectSummary;
 const previous={threads:[thread()],projects:[project]};
 expect(retainOpenProjectThreads({threads:[],projects:[project]},previous).threads).toHaveLength(1);
 expect(retainOpenProjectThreads({threads:[],projects:[]},previous).threads).toHaveLength(0);
});
it('makes a multi-page reconnect gap loadable without discarding retained earlier history',()=>{
 let data:MessagePages|undefined;for(let n=1;n<=100;n++)data=appendMessage(data,message(n));
 const newest=Array.from({length:50},(_,i)=>message(201+i));
 const withGap=mergeNewest(data,{messages:newest,hasMore:true});expect(withGap.pages[0].gap).toEqual({before:message(201).createdAt,until:message(100).createdAt});
 const partial=mergeGap(withGap,{messages:Array.from({length:50},(_,i)=>message(151+i)),hasMore:true});expect(partial.pages[0].gap?.before).toBe(message(151).createdAt);
 const connected=mergeGap(partial,{messages:Array.from({length:51},(_,i)=>message(100+i)),hasMore:true});expect(connected.pages[0].gap).toBeUndefined();expect(flattenMessages(connected)).toHaveLength(250);expect(flattenMessages(connected)[0].id).toBe(id(1));
});
it('refreshes the active task badge from the authorized list after Realtime hints',async()=>{
 const {countTaskAttention}=await import('@/lib/task-attention');
 let tasks=[{id:id(8),projectId:id(3),status:'active',requiresCompletion:true}];
 const counts:number[]=[];
 const observer=new QueryObserver(client,{queryKey:key('tasks'),queryFn:async()=>tasks,initialData:tasks});
 const unsubscribe=observer.subscribe(result=>{if(result.data)counts.push(countTaskAttention(result.data as import('@/lib/types').ClientTaskSummary[]));});
 await vi.advanceTimersByTimeAsync(1);
 tasks=[...tasks,{id:id(9),projectId:id(3),status:'active',requiresCompletion:true}];
 sync.event('project_tasks','INSERT',{id:id(9),project_id:id(3),status:'active',client_visible:true});
 await vi.advanceTimersByTimeAsync(250);
 expect(counts.at(-1)).toBe(2);
 tasks=tasks.map(t=>t.id===id(9)?{...t,status:'completed'}:t);
 sync.event('project_tasks','UPDATE',{id:id(9),project_id:id(3),status:'completed',client_visible:true});
 await vi.advanceTimersByTimeAsync(250);
 expect(counts.at(-1)).toBe(1);
 unsubscribe();
});
it('targets the cached admin project timeline for task and project message changes',async()=>{
 sync.stop();const admin={id:id(2),role:'admin' as const};sync=new RealtimeSync(client,admin);
 const own=queryKeys.data(admin,'project-activity',id(3));const other=queryKeys.data(admin,'project-activity',id(4));
 client.setQueryData(own,{pages:[]});client.setQueryData(other,{pages:[]});
 sync.event('project_tasks','UPDATE',{id:id(8),project_id:id(3),status:'active'});
 await vi.advanceTimersByTimeAsync(250);
 expect(client.getQueryState(own)?.isInvalidated).toBe(true);
 expect(client.getQueryState(other)?.isInvalidated).toBe(false);
});
