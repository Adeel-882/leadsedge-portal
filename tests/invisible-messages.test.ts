import {describe,it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MessageActions} from '@/components/message-actions';
import {visibleActivity} from '@/lib/message-visibility';
import {appendMessage,visibleMessages,mergeNewest,reconcileMessagePages} from '@/lib/message-cache';
import {messageTimeline} from '@/lib/message-time';
import {filterMessageThreads} from '@/lib/message-workspace';
import {makeQueryClient,queryKeys} from '@/lib/query-cache';
import {RealtimeSync} from '@/lib/realtime-sync';
import type {ConversationMessage,MessageWorkspaceThread} from '@/lib/types';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const message=(n:number):ConversationMessage=>({id:id(n),senderId:id(1),senderName:'Sender',senderRole:'admin',body:'Text '+n,createdAt:`2026-11-${String(n).padStart(2,'0')}T10:00:00Z`,attachmentUrl:null,messageType:'user',version:0});
const deleted={...message(2),deletedAt:'2026-11-12T00:00:00Z',version:1,body:''};
it('previously deleted rows leave no body, avatar, timestamp or date separator',()=>{
 const data=appendMessage(appendMessage(undefined,message(1)),deleted);
 expect(visibleMessages(data)).toEqual([message(1)]);
 expect(messageTimeline(visibleMessages(data),'Asia/Karachi',new Date('2026-11-12'))).toHaveLength(1);
 expect(renderToStaticMarkup(createElement(MessageActions,{message:deleted,viewerId:id(1),kind:'project',resourceId:id(9),saved:()=>{},conflicted:()=>{}}))).toBe('');
 expect(visibleMessages(appendMessage(undefined,deleted))).toEqual([]);
});
it('edited content has no edited label and preserves chronology',()=>{
 const edited={...message(1),body:'Latest text',editedAt:'2026-11-12T00:00:00Z',version:1};
 const html=renderToStaticMarkup(createElement(MessageActions,{message:edited,viewerId:id(3),kind:'task',resourceId:id(9),saved:()=>{},conflicted:()=>{}}));
 expect(html).toContain('Latest text');expect(html).not.toMatch(/Edited|Message edited/);
 expect(visibleMessages(reconcileMessagePages(appendMessage(undefined,edited),appendMessage(undefined,message(1))))[0]).toEqual(edited);
});
it('authoritative reconnect removes missing deleted rows but retains pending sends',()=>{
 let data=appendMessage(appendMessage(undefined,message(1)),message(2));
 data=appendMessage(data,{...message(3),id:'pending-send'});
 expect(visibleMessages(mergeNewest(data,{messages:[message(1)],hasMore:false})).map(x=>x.id)).toEqual([id(1),'pending-send']);
 expect(visibleMessages(mergeNewest(appendMessage(undefined,message(1)),{messages:[],hasMore:false}))).toEqual([]);
});
it('refresh of newest page preserves genuinely older pages',()=>{
 const rows=[message(1),message(2),message(3)];let data=appendMessage(undefined,rows[0]);for(const m of rows.slice(1))data=appendMessage(data,m);
 expect(visibleMessages(mergeNewest(data,{messages:[message(3)],hasMore:true}))).toEqual(rows);
});
it('tombstones block stale responses while remaining invisible',()=>{
 const data=appendMessage(undefined,deleted);
 expect(visibleMessages(reconcileMessagePages(data,appendMessage(undefined,message(2))))).toEqual([]);
 expect(visibleMessages(mergeNewest(data,{messages:[message(2)],hasMore:false}))).toEqual([]);
});
describe('previews and conversation existence',()=>{
 const row=(resource:string,body:string,deleted_at:string|null=null)=>({resource,body,created_at:'2026-11-12',deleted_at,sender:{full_name:'Sender'}});
 it('uses last remaining visible message, without another query when sample contains it',async()=>{
  const fetch=vi.fn();const rows=await visibleActivity([row('p','removed','now'),row('p','previous')],r=>r.resource,fetch,400);
  expect(rows[0].body).toBe('previous');expect(fetch).not.toHaveBeenCalled();
 });
 it('finds older visible previews beyond deletion-heavy samples in batches',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce([row('p','previous')]);
  expect((await visibleActivity([row('p','deleted','now')],r=>r.resource,fetch,400))[0].body).toBe('previous');
  expect(fetch).toHaveBeenCalledWith(['p'],0);
 });
 it('retains an empty thread with no deleted content or timestamp',async()=>{
  const rows=await visibleActivity([row('p','secret','now')],r=>r.resource,async()=>[],400);
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({body:'',created_at:'',sender:null});
 });
});
it.each(['admin','client'] as const)('%s session receives deletion, stale UPDATE cannot restore it or reopen hidden chat',async role=>{
 const client=makeQueryClient();const identity={id:id(1),role};const sync=new RealtimeSync(client,identity);
 const key=queryKeys.messages(identity,'project',id(9));client.setQueryData(key,appendMessage(appendMessage(undefined,message(1)),message(2)));
 const thread:MessageWorkspaceThread={key:'project:'+id(9),kind:'project',resourceId:id(9),projectId:id(9),title:'Project',projectName:'Project',clientName:null,senderName:'Sender',preview:'Text 2',lastMessageAt:message(2).createdAt,unreadCount:1};
 const inventory={threads:[thread],hiddenKeys:['task:'+id(8)]};client.setQueryData(queryKeys.data(identity,'conversations'),inventory);
 const unreadKey=queryKeys.data(identity,'unread');client.setQueryData(unreadKey,{messages:1});
 sync.event('project_messages','UPDATE',{id:deleted.id,project_id:id(9),sender_id:deleted.senderId,created_at:deleted.createdAt,message_type:'user',body:'old body',deleted_at:deleted.deletedAt,message_version:1});
 expect(visibleMessages(client.getQueryData(key))).toEqual([message(1)]);
 const next=sync.reconcileInventory(inventory);expect(next.threads[0].preview).toBe('Text 1');expect(next.hiddenKeys).toEqual(inventory.hiddenKeys);
 expect(filterMessageThreads(next.threads,'Text 2','all')).toEqual([]);
 sync.event('project_messages','UPDATE',{id:deleted.id,project_id:id(9),sender_id:deleted.senderId,created_at:deleted.createdAt,message_type:'user',body:'stale edit',message_version:1});
 expect(visibleMessages(client.getQueryData(key))).toEqual([message(1)]);
 await new Promise(r=>setTimeout(r,250));expect(client.getQueryState(unreadKey)?.isInvalidated).toBe(true);
 sync.stop();client.clear();
});
it('a stale refresh cannot erase messages received after the request started',()=>{
 const observed=appendMessage(appendMessage(undefined,message(1)),message(2));
 const current=appendMessage(observed,message(3));
 expect(visibleMessages(mergeNewest(current,{messages:[message(1)],hasMore:false},observed))).toEqual([message(1),message(3)]);
});
