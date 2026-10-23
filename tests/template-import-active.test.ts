import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({role:vi.fn(),rpc:vi.fn(),queue:vi.fn(),deliver:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireApiRole:mocks.role}));
vi.mock('@/lib/env',()=>({isDemoMode:()=>false}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:async()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/assignment-email',()=>({queueAssignmentEmails:mocks.queue,deliverAssignmentEmails:mocks.deliver}));
vi.mock('next/server',()=>({NextResponse:{json:(data:unknown,init?:ResponseInit)=>Response.json(data,init)},after:vi.fn()}));
import {POST} from '@/app/api/admin/tasks/import/route';
const payload={projectId:'10000000-0000-4000-8000-000000000001',templateId:'20000000-0000-4000-8000-000000000001',templateTaskIds:['30000000-0000-4000-8000-000000000001'],initialStatus:'active'};
beforeEach(()=>{vi.clearAllMocks();mocks.role.mockResolvedValue({role:'admin'});mocks.rpc.mockResolvedValue({data:['copied-task'],error:null});mocks.queue.mockResolvedValue(['queued-email']);});
it('imports active once using the existing RPC and notification pipeline with exact project/template association',async()=>{
 const response=await POST(new Request('http://127.0.0.1/api/admin/tasks/import',{method:'POST',body:JSON.stringify(payload)}));
 expect(response.status).toBe(201);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('import_template_tasks',{target_project_id:payload.projectId,target_template_id:payload.templateId,selected_template_task_ids:payload.templateTaskIds,initial_task_status:'active'});
 expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(['copied-task']);expect(await response.json()).toEqual({imported:1});
});
it('rejects unauthorized imports before any write',async()=>{mocks.role.mockResolvedValue(null);expect((await POST(new Request('http://127.0.0.1',{method:'POST',body:JSON.stringify(payload)}))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
it('keeps failed imports out of the notification pipeline',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{message:'denied'}});expect((await POST(new Request('http://127.0.0.1',{method:'POST',body:JSON.stringify(payload)}))).status).toBe(500);expect(mocks.queue).not.toHaveBeenCalled();});
