import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ calls: [] as {method:string;args:unknown[]}[], task: null as Record<string,unknown>|null, viewer:vi.fn(), projects:vi.fn(), messages:vi.fn() }));
vi.mock('@/lib/env', () => ({ isDemoMode:()=>false }));
vi.mock('@/lib/auth', () => ({ getViewer:mocks.viewer, requireRole:mocks.viewer }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient:async()=>({from:(table:string)=>{
  mocks.calls.push({method:'from',args:[table]});
  const chain:Record<string,unknown>={then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:mocks.task,error:null}).then(resolve)};
  for(const method of ['select','eq','neq','is','maybeSingle'])chain[method]=(...args:unknown[])=>{mocks.calls.push({method,args});return chain;};
  return chain;
}}) }));
import { getTask } from '@/lib/queries';
beforeEach(()=>{mocks.calls=[];mocks.task={id:'task-a',project_id:'project-a',title:'Lead',description:'<p>Details</p>',task_type:'standard',status:'active',client_visible:true,requires_completion:true,assignee_id:'client-a',assignee:{full_name:'Client'},form_schema:null,feedback_enabled:true,feedback_delay_value:7,feedback_delay_unit:'days',feedback_state:'waiting',completed_at:'2026-09-10T12:00:00Z',feedback_scheduled_for:'2026-09-17T12:00:00Z'};});
it('combines the full task with the same explicit client access predicates',async()=>{
 const task=await getTask('task-a','viewer-a');
 expect(mocks.calls.filter(c=>c.method==='from')).toHaveLength(1);
 for(const [method,args] of [['eq',['assignee.auth_user_id','viewer-a']],['neq',['assignee.status','disabled']],['eq',['client_visible',true]],['neq',['status','draft']],['is',['archived_at',null]],['eq',['id','task-a']]] as const)expect(mocks.calls).toContainEqual({method,args});
 expect(mocks.calls.find(c=>c.method==='select')?.args[0]).toContain('assignee:clients!inner(full_name)');
 expect(task?.feedbackScheduledFor).toBe('2026-09-17T12:00:00Z');
 expect(task?.completedAt).toBe('2026-09-10T12:00:00Z');
});
it('returns no task when the database filters a foreign or disabled-client row',async()=>{mocks.task=null;expect(await getTask('foreign','viewer-a')).toBeNull();});
it('preserves unassigned task support for existing admin callers',async()=>{
 mocks.task!.assignee=null;mocks.task!.assignee_id=null;
 expect((await getTask('task-a'))?.assigneeName).toBeNull();
 expect(mocks.calls.find(c=>c.method==='select')?.args[0]).toContain('assignee:clients(full_name)');
 expect(mocks.calls.some(c=>c.args[0]==='assignee.auth_user_id')).toBe(false);
});
