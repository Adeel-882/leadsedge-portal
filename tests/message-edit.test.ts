import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MessageBody } from '@/components/message-body';
import { messageEditSchema, newestMessage, canMutateMessage, DELETED_MESSAGE } from '@/lib/message-edit';
import { appendMessage, mergeNewest, mergeGap, reconcileMessagePages, flattenMessages } from '@/lib/message-cache';
import { makeQueryClient, queryKeys } from '@/lib/query-cache';
import { RealtimeSync } from '@/lib/realtime-sync';
import type { ConversationMessage } from '@/lib/types';
const mock = vi.hoisted(() => ({ viewer: vi.fn(), rpc: vi.fn(), demo: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getViewer: mock.viewer }));
vi.mock('@/lib/env', () => ({ isDemoMode: mock.demo }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: mock.rpc }) }));
import { PATCH } from '@/app/api/messages/[kind]/[resourceId]/[messageId]/route';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const viewer = {id:id(1),fullName:'Sender',role:'admin'};
const base: ConversationMessage = {id:id(2),senderId:id(1),senderName:'Sender',senderRole:'admin',body:'Original',createdAt:'2026-11-12T00:00:00Z',attachmentUrl:null,version:0,messageType:'user'};
const changed = {...base,body:'Updated\nhttps://example.com',version:1,editedAt:'2026-11-12T01:00:00Z'};
const deleted = {...changed,body:DELETED_MESSAGE,version:2,deletedAt:'2026-11-12T02:00:00Z'};
function req(body: unknown, origin='http://127.0.0.1:3000') { return new NextRequest(`http://127.0.0.1:3000/api/messages/project/${id(3)}/${id(2)}`,{method:'PATCH',headers:{origin,host:'127.0.0.1:3000','sec-fetch-site':'same-origin','content-type':'application/json','x-cache-viewer':id(1)},body:JSON.stringify(body)}); }
const params = (kind='project') => Promise.resolve({kind,resourceId:id(3),messageId:id(2)});
beforeEach(() => {mock.viewer.mockResolvedValue(viewer);mock.demo.mockReturnValue(false);mock.rpc.mockReset().mockResolvedValue({data:{id:id(2),sender_id:id(1),body:'Updated',created_at:base.createdAt,message_version:1,message_type:'user'},error:null});});
afterEach(() => vi.restoreAllMocks());
describe('authenticated message mutations', () => {
  it.each(['project','task'])('uses session RPC for own %s message, never caller ownership', async kind => {
    expect((await PATCH(req({operation:'edit',version:0,body:'Line 1\nLine 2'}),{params:params(kind)})).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith('mutate_own_message',{target_kind:kind,target_resource_id:id(3),target_message_id:id(2),operation:'edit',expected_version:0,new_body:'Line 1\nLine 2'});
  });
  it('accepts authenticated clients and maps ownership, conflict and provider failures', async () => {
    mock.viewer.mockResolvedValue({...viewer,role:'client'});
    for(const [code,status] of [['42501',403],['40001',409],['22023',400],['other',503]] as const){ mock.rpc.mockResolvedValue({error:{code}});expect((await PATCH(req({operation:'delete',version:0}),{params:params()})).status).toBe(status); }
  });
  it('rejects anonymous, foreign origins, demo, forged payloads and account changes', async () => {
    mock.viewer.mockResolvedValue(null);expect((await PATCH(req({operation:'delete',version:0}),{params:params()})).status).toBe(401);
    mock.viewer.mockResolvedValue(viewer);expect((await PATCH(req({operation:'delete',version:0},'https://evil.test'),{params:params()})).status).toBe(403);
    expect((await PATCH(req({operation:'delete',version:0,userId:id(9)}),{params:params()})).status).toBe(400);
    mock.viewer.mockResolvedValue({...viewer,id:id(9)});expect((await PATCH(req({operation:'delete',version:0}),{params:params()})).status).toBe(403);
    mock.viewer.mockResolvedValue(viewer);mock.demo.mockReturnValue(true);expect((await PATCH(req({operation:'delete',version:0}),{params:params()})).status).toBe(503);expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('returns no deleted content or attachment even if provider row is malformed', async () => {
    mock.rpc.mockResolvedValue({data:{id:id(2),sender_id:id(1),body:'Secret old body',attachment_url:'https://example.com/private',deleted_at:deleted.deletedAt,message_version:2}});
    const r=await PATCH(req({operation:'delete',version:1}),{params:params()});const result=await r.json();expect(result.message.body).toBe('');expect(result.message.attachmentUrl).toBeNull();expect(r.headers.get('cache-control')).toBe('no-store');
  });
});
it('validates length/whitespace and preserves intentional newlines', () => {
  for(const body of ['', ' \n\t', 'x'.repeat(5001)]) expect(messageEditSchema.safeParse({operation:'edit',version:0,body}).success).toBe(false);
  expect(messageEditSchema.parse({operation:'edit',version:0,body:' \nText\n ' })).toMatchObject({body:' \nText\n '});
});
it('only exposes actions for persisted own user messages', () => {
  expect(canMutateMessage(base,id(1))).toBe(true);
  for(const msg of [deleted,{...base,messageType:'system'},{...base,id:'pending-a'},{...base,version:undefined}])expect(canMutateMessage(msg,id(1))).toBe(false);
  expect(canMutateMessage(base,id(9))).toBe(false);
});
it('safe URL rendering escapes HTML and preserves line breaks', () => {
  const html=renderToStaticMarkup(createElement(MessageBody,{body:'<script>alert(1)</script>\nhttps://example.com?a=1&b=2'}));
  expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('\n');expect(html).toContain('rel="noopener noreferrer"');
});
it('stale edit/query/page responses cannot restore a tombstone or reorder rows', () => {
  const current=appendMessage(undefined,deleted);
  expect(newestMessage(deleted,changed)).toEqual(deleted);
  for(const result of [appendMessage(current,base),mergeNewest(current,{messages:[base],hasMore:false}),mergeGap(current,{messages:[base],hasMore:false}),reconcileMessagePages(current,appendMessage(undefined,base))])expect(flattenMessages(result)).toEqual([deleted]);
});
it('an UPDATE arriving before an older page prevents that page restoring deleted content', () => {
  const client=makeQueryClient();const identity={id:id(1),role:'admin' as const};const sync=new RealtimeSync(client,identity);
  client.setQueryData(queryKeys.messages(identity,'project',id(3)),appendMessage(undefined,{...base,id:id(4)}));
  sync.event('project_messages','UPDATE',{id:base.id,project_id:id(3),sender_id:base.senderId,created_at:base.createdAt,message_type:'user',body:DELETED_MESSAGE,deleted_at:deleted.deletedAt,message_version:2});
  expect(flattenMessages(sync.reconcileHistory('project',id(3),appendMessage(undefined,base)))[0].body).toBe('');
  expect(flattenMessages(sync.reconcileHistory('project',id(9),appendMessage(undefined,base)))[0].body).toBe('Original');
  sync.stop();client.clear();
});
it.each(['project','task'])('%s UPDATE reconciles older history and preview without reopening or reading receipts', async kind => {
  const client=makeQueryClient();const identity={id:id(1),role:'admin' as const,inboxRemoval:true};const sync=new RealtimeSync(client,identity);
  const key=queryKeys.messages(identity,kind,id(3));client.setQueryData(key,appendMessage(undefined,base));
  const inventoryKey=queryKeys.data(identity,'conversations');client.setQueryData(inventoryKey,{threads:[{kind,resourceId:id(3),lastMessageAt:base.createdAt,preview:base.body}],hiddenKeys:['project:'+id(9)]});
  client.setQueryData(queryKeys.data(identity,'unread'),{messages:7});
  const read=vi.fn(async()=>0);sync.register(kind,id(3),{read,refresh:vi.fn(async()=>{})});await new Promise(r=>setTimeout(r,250));read.mockClear();
  sync.event(kind+'_messages','UPDATE',{id:base.id,[kind+'_id']:id(3),sender_id:base.senderId,created_at:base.createdAt,message_type:'user',body:'old secret',deleted_at:deleted.deletedAt,message_version:2});
  expect(flattenMessages(client.getQueryData(key))[0].body).toBe('');
  expect(client.getQueryData(inventoryKey)).toMatchObject({hiddenKeys:['project:'+id(9)],threads:[{preview:null,lastMessageAt:null}]});
  expect(client.getQueryData(queryKeys.data(identity,'unread'))).toEqual({messages:7});await new Promise(r=>setTimeout(r,250));expect(read).not.toHaveBeenCalled();
  sync.event(kind+'_messages','UPDATE',{id:base.id,[kind+'_id']:id(3),sender_id:base.senderId,created_at:base.createdAt,message_type:'user',body:'stale',message_version:1});expect(flattenMessages(client.getQueryData(key))[0].body).toBe('');
  sync.stop();client.clear();
});
