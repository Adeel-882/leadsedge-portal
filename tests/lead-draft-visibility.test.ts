import { expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({status:'draft'}));
vi.mock('react',()=>({cache:<T>(fn:T)=>fn}));
vi.mock('@/lib/env',()=>({isDemoMode:()=>false}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:async()=>({from:()=>{
 const filters:Array<[string,unknown]>=[];
 const q={select:()=>q,eq:()=>q,is:()=>q,neq:(key:string,value:unknown)=>{filters.push([key,value]);return q;},maybeSingle:async()=>({data:filters.some(([key,value])=>key==='status'&&value===state.status)?null:{id:'task',project_id:'project',assignee_id:'client',status:state.status},error:null})};return q;
}})}));
import { getAuthorizedClientTask } from '@/lib/client-access';
it('keeps an assigned client-visible draft inaccessible until activation',async()=>{state.status='draft';expect(await getAuthorizedClientTask('client','task')).toBeNull();state.status='active';expect(await getAuthorizedClientTask('client','task')).toMatchObject({id:'task',status:'active'});});
