import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryObserver, InfiniteQueryObserver } from '@tanstack/react-query';
import { makeQueryClient, queryKeys, freshness, invalidateMutation, readJson } from '@/lib/query-cache';
import { sessionQueryClient } from '@/components/query-provider';
import { appendMessage, removeMessage, flattenMessages, MAX_MESSAGE_PAGES, type MessagePages } from '@/lib/message-cache';
import type { ConversationMessage } from '@/lib/types';
const admin = {id:'admin-a',role:'admin' as const};
const a = {id:'client-a',role:'client' as const};
const b = {id:'client-b',role:'client' as const};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('private browser cache lifecycle and requests',()=>{
  it('uses stable scalar keys scoped to identity and role',()=>{
    expect(queryKeys.data(a,'people','','1')).toEqual(queryKeys.data({...a},'people','','1'));
    expect(queryKeys.data(a,'home')).not.toEqual(queryKeys.data(b,'home'));
    expect(queryKeys.data(a,'home')).not.toEqual(queryKeys.data({...a,role:'admin'},'home'));
  });
  it('creates independent clients for server renders',()=>expect(sessionQueryClient(a)).not.toBe(sessionQueryClient(a)));
  it.each([[admin,a],[a,admin],[a,b]])('clears the old account before using a new browser identity', (first,second)=>{
    vi.stubGlobal('window',{});const old=sessionQueryClient(first);old.setQueryData(queryKeys.data(first,'dashboard'),{private:true});
    expect(sessionQueryClient(first)).toBe(old);
    const next=sessionQueryClient(second);expect(next).not.toBe(old);expect(old.getQueryCache().getAll()).toHaveLength(0);expect(next.getQueryCache().getAll()).toHaveLength(0);next.clear();
  });
  it('clears pending and saved authenticated queries on logout',async()=>{
    const client=makeQueryClient();client.setQueryData(queryKeys.data(admin,'people'),['private']);client.clear();expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
  it('hydrates initial data without an immediate browser fetch',()=>{
    const client=makeQueryClient();const fn=vi.fn(async()=>['network']);const observer=new QueryObserver(client,{queryKey:queryKeys.data(a,'tasks'),queryFn:fn,initialData:['server'],initialDataUpdatedAt:Date.now(),...freshness('tasks')});const un=observer.subscribe(()=>{});expect(observer.getCurrentResult().data).toEqual(['server']);expect(fn).not.toHaveBeenCalled();un();client.clear();
  });
  it.each(['templates','projects','people','tasks','home','dashboard','conversations','meetings'])('reuses fresh %s on a return visit',async resource=>{
    const client=makeQueryClient();const fn=vi.fn(async()=>['loaded']);const options={queryKey:queryKeys.data(a,resource),queryFn:fn,...freshness(resource)};await client.fetchQuery(options);await client.fetchQuery(options);expect(fn).toHaveBeenCalledTimes(1);client.clear();
  });
  it('refetches stale data on remount, preserving cached data during the fetch',async()=>{
    const client=makeQueryClient();const key=queryKeys.data(a,'tasks');client.setQueryData(key,['saved'],{updatedAt:Date.now()-100000});let resolve!:(value:string[])=>void;
    const fn=vi.fn(()=>new Promise<string[]>(r=>{resolve=r}));const observer=new QueryObserver(client,{queryKey:key,queryFn:fn,...freshness('tasks')});const un=observer.subscribe(()=>{});expect(fn).toHaveBeenCalledTimes(1);expect(observer.getCurrentResult().data).toEqual(['saved']);resolve(['new']);await new Promise(r=>setTimeout(r,0));expect(observer.getCurrentResult().data).toEqual(['new']);un();client.clear();
  });
  it('keeps safe existing data when a refresh fails',async()=>{
    const client=makeQueryClient();const key=queryKeys.data(a,'tasks');client.setQueryData(key,['saved']);await expect(client.fetchQuery({queryKey:key,queryFn:async()=>{throw Error('offline')},staleTime:0})).rejects.toThrow('offline');expect(client.getQueryData(key)).toEqual(['saved']);client.clear();
  });
  it('caches task IDs independently and deduplicates concurrent requests',async()=>{
    const client=makeQueryClient();const fn=vi.fn(async()=>({title:'A'}));const options={queryKey:queryKeys.data(a,'task','A'),queryFn:fn,...freshness('task')};await Promise.all([client.fetchQuery(options),client.fetchQuery(options)]);expect(fn).toHaveBeenCalledTimes(1);expect(client.getQueryData(queryKeys.data(a,'task','B'))).toBeUndefined();client.clear();
  });
  it('invalidates only affected task detail, list and summaries',async()=>{
    const client=makeQueryClient();for(const key of [['task','A'],['task','B'],['tasks'],['home'],['templates'],['messages','task','A'],['people']])client.setQueryData(queryKeys.data(a,...key as [string,...string[]]),{});
    await invalidateMutation(client,a,'task','A');
    for(const key of [['task','A'],['tasks'],['home']])expect(client.getQueryState(queryKeys.data(a,...key as [string,...string[]]))?.isInvalidated).toBe(true);
    for(const key of [['task','B'],['templates'],['messages','task','A'],['people']])expect(client.getQueryState(queryKeys.data(a,...key as [string,...string[]]))?.isInvalidated).toBe(false);client.clear();
  });
  it('does not invalidate imported tasks on template edits',async()=>{
    const client=makeQueryClient();client.setQueryData(queryKeys.data(admin,'templates'),[]);client.setQueryData(queryKeys.data(admin,'tasks'),[]);await invalidateMutation(client,admin,'template');expect(client.getQueryState(queryKeys.data(admin,'templates'))?.isInvalidated).toBe(true);expect(client.getQueryState(queryKeys.data(admin,'tasks'))?.isInvalidated).toBe(false);client.clear();
  });
  it('sends identity as a consistency constraint and surfaces denial',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify({error:'denied'}),{status:403}));vi.stubGlobal('fetch',fetch);await expect(readJson('/api/data/client/tasks',a)).rejects.toMatchObject({status:403});expect(fetch.mock.calls[0]).toEqual(['/api/data/client/tasks',expect.objectContaining({headers:{'x-cache-viewer':a.id},cache:'no-store'})]);
  });
});
const message=(id:string):ConversationMessage=>({id,body:id,senderId:a.id,senderName:'A',senderRole:'client',attachmentUrl:null,createdAt:'2026-09-01T00:00:00Z'});
describe('message cache',()=>{
  it('switches A to B to A without refetching A',async()=>{
    const client=makeQueryClient();const fn=vi.fn(async()=>({messages:[message('1')],hasMore:false}));for(const id of ['A','B','A'])await client.fetchQuery({queryKey:queryKeys.messages(a,'project',id),queryFn:fn,...freshness('messages')});expect(fn).toHaveBeenCalledTimes(2);client.clear();
  });
  it('retains bounded earlier pages across observers',async()=>{
    const client=makeQueryClient();const queryKey=queryKeys.messages(a,'task','A');let calls=0;
    const options={queryKey,queryFn:async()=>({messages:[message(String(++calls))],hasMore:true}),initialPageParam:null as string|null,getNextPageParam:(_last:unknown,pages:unknown[])=>pages.length<MAX_MESSAGE_PAGES?String(pages.length):undefined,...freshness('messages')};
    const observer=new InfiniteQueryObserver(client,options);const un=observer.subscribe(()=>{});await observer.refetch();for(let i=1;i<MAX_MESSAGE_PAGES;i++)await observer.fetchNextPage();expect(observer.getCurrentResult().data?.pages).toHaveLength(10);expect(observer.getCurrentResult().hasNextPage).toBe(false);un();const again=new InfiniteQueryObserver(client,options);const un2=again.subscribe(()=>{});expect(again.getCurrentResult().data?.pages).toHaveLength(10);expect(calls).toBe(10);un2();client.clear();
  });
  it('updates only one thread, reconciles a send and rolls back only a failed optimistic item',()=>{
    const client=makeQueryClient();const key=queryKeys.messages(a,'task','A');const other=queryKeys.messages(a,'task','B');const base:MessagePages={pages:[{messages:[message('old')],hasMore:false}],pageParams:[null]};client.setQueryData(key,base);client.setQueryData(other,base);
    client.setQueryData<MessagePages>(key,current=>appendMessage(current,message('pending')));
    client.setQueryData<MessagePages>(key,current=>appendMessage(current,message('incoming')));
    client.setQueryData<MessagePages>(key,current=>removeMessage(current,'pending'));
    expect(flattenMessages(client.getQueryData(key)).map(m=>m.id)).toEqual(['old','incoming']);expect(flattenMessages(client.getQueryData(other)).map(m=>m.id)).toEqual(['old']);client.clear();
  });
});

it('bounds retained history even after a long sending session',()=>{
 let data:MessagePages|undefined;
 for(let index=0;index<600;index++)data=appendMessage(data,message(String(index)));
 expect(data?.pages).toHaveLength(10);
 expect(flattenMessages(data)).toHaveLength(500);
 expect(flattenMessages(data)[0].id).toBe('100');
 expect(flattenMessages(data).at(-1)?.id).toBe('599');
});

it('retains authoritative guards while putting only business data in the cache', async()=>{
 const {readFileSync}=await import('node:fs');
 const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
 for(const [path,role] of [['../app/admin/layout.tsx','admin'],['../app/portal/layout.tsx','client']]) {
  const source=read(path); expect(source.match(/<QueryProvider /g)).toHaveLength(1);expect(source).toContain(`requireBootstrapRole('${role}')`);
 }
 const provider=read('../components/query-provider.tsx');expect(provider).toContain("a[href=\"/auth/sign-out\"]");expect(provider).toContain('client.clear()');expect(provider).not.toContain('localStorage');expect(provider).toContain("if (event.persisted)");
 const loader=read('../lib/screen-data.ts');expect(loader).toContain('getTask(args[0], viewer.id)');expect(loader).toContain('canClientAccessTask(task, project.clientId)');
});

