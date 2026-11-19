import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ role:vi.fn(), ready:vi.fn(), send:vi.fn(), generate:vi.fn(), serverRpc:vi.fn(), serverFrom:vi.fn(), adminFrom:vi.fn() }));
vi.mock('@/lib/auth',()=>({requireApiRole:mocks.role}));
vi.mock('@/lib/project-creation-readiness',()=>({projectCreationReady:mocks.ready}));
vi.mock('@/lib/client-invitation-tracking',()=>({sendTrackedClientInvitation:mocks.send}));
vi.mock('@/lib/env',()=>({appUrl:()=> 'https://portal.example.test',isDemoMode:()=>false}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:async()=>({rpc:mocks.serverRpc,from:mocks.serverFrom})}));
vi.mock('@/lib/supabase/admin',()=>({createSupabaseAdminClient:()=>({auth:{admin:{generateLink:mocks.generate}},from:mocks.adminFrom})}));
import {POST} from '@/app/api/admin/projects/route';
import {committedProjectResult} from '@/lib/project-creation';
import {projectCreationRequestKey} from '@/lib/project-creation-request';
const project='10000000-0000-4000-8000-000000000001', client='10000000-0000-4000-8000-000000000002',user='10000000-0000-4000-8000-000000000003',key='10000000-0000-4000-8000-000000000004';
const body={projectName:'Synthetic',client:{mode:'new',fullName:'Synthetic Client',email:'synthetic@example.test',company:''}};
const request=(value:unknown=body,id=key)=>new Request('https://portal.example.test/api/admin/projects',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(value)});
let claimed:boolean, committed:boolean, saved:unknown;
beforeEach(()=>{
 vi.clearAllMocks();claimed=false;committed=false;saved=null;
 mocks.role.mockResolvedValue({id:'admin',role:'admin'});mocks.ready.mockResolvedValue(true);mocks.send.mockResolvedValue({ok:true,id:'provider'});
 mocks.generate.mockResolvedValue({data:{user:{id:user},properties:{hashed_token:'a'.repeat(56)}},error:null});
 const profile={select:()=>profile,eq:()=>profile,maybeSingle:async()=>({data:{role:'client'}})};mocks.adminFrom.mockReturnValue(profile);
 const existing={select:()=>existing,eq:()=>existing,single:async()=>({data:{auth_user_id:user,full_name:'Existing',email:'existing@example.test',company:''}})};mocks.serverFrom.mockReturnValue(existing);
 mocks.serverRpc.mockImplementation((name,args)=>{
  if(name==='claim_project_creation'){const acquired=!claimed;claimed=true;return Promise.resolve({data:{acquired,projectId:committed?project:null,result:saved}});}
  if(name==='create_project_bundle_once'){committed=true;return {single:async()=>({data:{project_id:project,client_id:client}})};}
  if(name==='finish_project_creation'){saved=args.result_input;return Promise.resolve({error:null});}
  throw new Error('Unexpected RPC '+name);
 });
});
it.each(['missing table','missing function','missing permission','stale cache'])('rejects %s readiness before any side effect',async()=>{
 mocks.ready.mockResolvedValue(false);const response=await POST(request());expect(response.status).toBe(503);expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.serverRpc).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
it('requires admin access and a stable request ID',async()=>{
 mocks.role.mockResolvedValueOnce(null);expect((await POST(request())).status).toBe(403);
 expect((await POST(request(body,''))).status).toBe(400);expect(mocks.generate).not.toHaveBeenCalled();
});
it('creates once and sends once on a normal new-client request',async()=>{
 const response=await POST(request());expect(response.status).toBe(201);expect(await response.json()).toMatchObject({projectId:project,invitationStatus:'sent'});
 expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.generate).toHaveBeenCalledTimes(1);
 expect(mocks.serverRpc.mock.calls.map(c=>c[0])).toEqual(['claim_project_creation','create_project_bundle_once','finish_project_creation']);
});
it.each(['provider rejection','tracking preparation failure'])('returns committed partial success on %s',async()=>{
 mocks.send.mockResolvedValue({ok:false,deliveryState:'not_sent',error:'No email was sent'});
 const response=await POST(request());const result=await response.json();expect(response.status).toBe(201);expect(result).toMatchObject({projectId:project,invitationStatus:'not_sent'});expect(committedProjectResult(result)?.projectId).toBe(project);
});
it('does not turn an unknown email transport result into failed creation',async()=>{
 mocks.send.mockRejectedValue(new Error('network'));const response=await POST(request());expect(response.status).toBe(201);expect(await response.json()).toMatchObject({projectId:project,invitationStatus:'unknown'});
});
it('replays the same committed response without repeating Auth, creation or mail',async()=>{
 const first=await (await POST(request())).json();const second=await (await POST(request())).json();expect(second).toEqual(first);
 expect(mocks.generate).toHaveBeenCalledTimes(1);expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.serverRpc.mock.calls.filter(c=>c[0]==='create_project_bundle_once')).toHaveLength(1);
});
it('returns pending on an in-flight duplicate without generating another link',async()=>{
 claimed=true;expect((await POST(request())).status).toBe(409);expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
it('returns the committed identity even if delivery response was never recorded',async()=>{
 claimed=true;committed=true;const response=await POST(request());expect(await response.json()).toMatchObject({projectId:project,invitationStatus:'pending'});expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
it('recovers a committed bundle after a lost network response without sending twice',async()=>{
 const normal=mocks.serverRpc.getMockImplementation()!;
 mocks.serverRpc.mockImplementation((name,args)=>name==='create_project_bundle_once'?(committed=true,{single:async()=>({error:{code:'network'}})}):normal(name,args));
 const result=await (await POST(request())).json();expect(result).toMatchObject({projectId:project,invitationStatus:'not_sent'});expect(mocks.send).not.toHaveBeenCalled();
});
it('preserves existing-client selection without Auth or email provisioning',async()=>{
 const response=await POST(request({projectName:'Existing Project',client:{mode:'existing',clientId:client}}));expect(await response.json()).toMatchObject({invitationStatus:'not_requested'});expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
it('does not lose the project response if final result persistence fails',async()=>{
 const normal=mocks.serverRpc.getMockImplementation()!;mocks.serverRpc.mockImplementation((name,args)=>name==='finish_project_creation'?Promise.reject(new Error('network')):normal(name,args));
 expect(await (await POST(request())).json()).toMatchObject({projectId:project,invitationStatus:'sent'});
});
it('keeps a request key across clicks/reloads without storing client data',async()=>{
 const entries=new Map<string,string>();const storage={getItem:(k:string)=>entries.get(k)||null,setItem:(k:string,v:string)=>{entries.set(k,v);}};
 const first=await projectCreationRequestKey(JSON.stringify(body),storage);expect(await projectCreationRequestKey(JSON.stringify(body),storage)).toBe(first);
 expect(await projectCreationRequestKey(JSON.stringify({...body,projectName:'Different'}),storage)).not.toBe(first);
 expect(JSON.stringify([...entries])).not.toContain(body.client.email);
});
