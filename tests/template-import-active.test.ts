import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({role:vi.fn(),rpc:vi.fn(),queue:vi.fn(),deliver:vi.fn(),updates:[] as unknown[], readError:false, saveError:false, rows:[] as Record<string,unknown>[]}));
vi.mock('@/lib/auth',()=>({requireApiRole:mocks.role}));
vi.mock('@/lib/env',()=>({isDemoMode:()=>false}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:async()=>({rpc:mocks.rpc,from:()=>{
 let updating=false;
 const q={select:()=>q,in:()=>q,eq:()=>q,update:(v:unknown)=>{updating=true;mocks.updates.push(v);return q;},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:updating?null:mocks.rows,error:(updating?mocks.saveError:mocks.readError)?{message:'failed'}:null}).then(resolve)};return q;
}})}));
vi.mock('@/lib/assignment-email',()=>({queueAssignmentEmails:mocks.queue,deliverAssignmentEmails:mocks.deliver}));
vi.mock('next/server',()=>({NextResponse:{json:(data:unknown,init?:ResponseInit)=>Response.json(data,init)}}));
import {POST} from '@/app/api/admin/tasks/import/route';
const payload={projectId:'10000000-0000-4000-8000-000000000001',templateId:'20000000-0000-4000-8000-000000000001',templateTaskIds:['30000000-0000-4000-8000-000000000001'],initialStatus:'active'};
const request=()=>new Request('http://127.0.0.1/api/admin/tasks/import',{method:'POST',body:JSON.stringify(payload)});
beforeEach(()=>{vi.clearAllMocks();mocks.updates=[];mocks.readError=false;mocks.saveError=false;mocks.rows=[{id:'copied-task',description:'',template:{template:{name:'Lead Assignment'}}}];mocks.role.mockResolvedValue({role:'admin'});mocks.rpc.mockResolvedValue({data:['copied-task'],error:null});});
it('forces draft even for an old active request, initializes actual default text and never queues delivery',async()=>{
 const response=await POST(request());
 expect(response.status).toBe(201);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('import_template_tasks',{target_project_id:payload.projectId,target_template_id:payload.templateId,selected_template_task_ids:payload.templateTaskIds,initial_task_status:'draft'});
 expect(mocks.updates).toEqual([{description:'<p>Lead Detail</p>'}]);expect(mocks.queue).not.toHaveBeenCalled();expect(mocks.deliver).not.toHaveBeenCalled();expect(await response.json()).toEqual({imported:1});
});
it('preserves template content that already contains real information',async()=>{mocks.rows[0].description='<p><strong>Client:</strong> Example</p>';await POST(request());expect(mocks.updates).toEqual([]);});
it('does not initialize other workflow categories',async()=>{mocks.rows[0].template={template:{name:'Other'}};await POST(request());expect(mocks.updates).toEqual([]);});
it('rejects unauthorized imports before any write',async()=>{mocks.role.mockResolvedValue(null);expect((await POST(request())).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
it('keeps failed imports out of the notification pipeline',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{message:'denied'}});expect((await POST(request())).status).toBe(500);expect(mocks.queue).not.toHaveBeenCalled();});
it('reports committed drafts without inviting duplicate imports if default initialization fails',async()=>{mocks.saveError=true;const response=await POST(request());expect(response.status).toBe(201);expect(await response.json()).toMatchObject({imported:1,warning:expect.stringContaining('do not import again')});expect(mocks.queue).not.toHaveBeenCalled();});
