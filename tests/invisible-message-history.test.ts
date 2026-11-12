import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({rows:[] as Array<Record<string,unknown>>}));
vi.mock('@/lib/env',async original=>({...await original<typeof import('@/lib/env')>(),isDemoMode:()=>false}));
vi.mock('@/lib/auth',()=>({getViewer:async()=>({id:'viewer',role:'admin'})}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:async()=>({from:()=>{
 let rows=[...mock.rows];let limit=Infinity;
 const chain={select:()=>chain,eq:(k:string,v:unknown)=>{rows=rows.filter(r=>r[k]===v);return chain;},is:(k:string,v:unknown)=>{rows=rows.filter(r=>r[k]===v);return chain;},lt:(k:string,v:string)=>{rows=rows.filter(r=>String(r[k])<v);return chain;},order:()=>{rows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));return chain;},limit:(n:number)=>{limit=n;return chain;},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:rows.slice(0,limit),error:null}).then(resolve)};return chain;
}})}));
import {getProjectMessages,getTaskMessages} from '@/lib/queries';
beforeEach(()=>{mock.rows=Array.from({length:100},(_,i)=>({id:String(i),project_id:'p',task_id:'t',sender_id:'viewer',message_type:'user',body:'message '+i,created_at:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),edited_at:null,deleted_at:i%3===0?'2026-11-12':null,message_version:0,attachment_url:null,sender:{full_name:'Sender',role:'admin'}}));});
it.each(['project','task'])('%s history fills pages with visible rows and paginates without deleted content',async kind=>{
 const get=kind==='project'?getProjectMessages:getTaskMessages;const resource=kind==='project'?'p':'t';
 const first=await get(resource);expect(first).toHaveLength(50);expect(first.every(m=>!m.deletedAt)).toBe(true);
 const second=await get(resource,first[0].createdAt);expect(second).toHaveLength(16);
 expect(new Set([...second,...first].map(m=>m.id)).size).toBe(66);
 expect([...second,...first].map(m=>m.createdAt)).toEqual([...second,...first].map(m=>m.createdAt).sort());
});
it('all deleted history returns the normal empty conversation dataset',async()=>{
 mock.rows.forEach(r=>r.deleted_at='2026-11-12');expect(await getProjectMessages('p')).toEqual([]);expect(await getTaskMessages('t')).toEqual([]);
});
