import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_LEAD_DETAILS, initialLeadDetails, leadDetailsEditorValue, hasMeaningfulLeadDetails } from '@/lib/lead-details-copy';
const mocks=vi.hoisted(()=>({role:vi.fn(),queue:vi.fn(),deliver:vi.fn(),current:{} as Record<string,unknown>,updates:[] as Record<string,unknown>[],notifications:[] as unknown[],conflict:false}));
vi.mock('@/lib/auth',()=>({requireApiRole:mocks.role}));
vi.mock('@/lib/env',()=>({isDemoMode:()=>false}));
vi.mock('@/lib/queries',async()=>({sanitizeTaskDescription:(await import('@/lib/rich-text')).sanitizeTaskDescription}));
vi.mock('@/lib/assignment-email',()=>({queueAssignmentEmails:mocks.queue,deliverAssignmentEmails:mocks.deliver}));
vi.mock('next/server',()=>({NextResponse:{json:(data:unknown,init?:ResponseInit)=>Response.json(data,init)},after:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:async()=>({from:(table:string)=>{
 let update:Record<string,unknown>|undefined;
 const q={select:()=>q,eq:()=>q,is:()=>q,single:()=>q,maybeSingle:()=>q,update:(v:Record<string,unknown>)=>{update=v;return q;},insert:(v:unknown)=>{if(table==='notifications')mocks.notifications.push(v);return q;},then:(resolve:(v:unknown)=>unknown)=>{
 let data:unknown=table==='project_tasks'?{...mocks.current}:table==='clients'?{auth_user_id:'user'}:{client_id:'client'};
 if(update){if(mocks.conflict)data=null;else{mocks.updates.push(update);Object.assign(mocks.current,update);data={id:'task'};}}
 return Promise.resolve({data,error:null}).then(resolve);
 }};return q;
}})}));
import { PATCH } from '@/app/api/admin/tasks/[taskId]/route';
const payload={title:'Renamed lead',description:DEFAULT_LEAD_DETAILS,clientVisible:true,requiresCompletion:true,assigneeId:'10000000-0000-4000-8000-000000000001',status:'draft',feedback:{enabled:true,delayValue:7,delayUnit:'days',formSchema:[{id:'notes',label:'Notes',type:'text',required:true}]}};
const patch=(changes:Record<string,unknown>={})=>PATCH(new Request('http://127.0.0.1/api/admin/tasks/task',{method:'PATCH',body:JSON.stringify({...payload,...changes})}),{params:Promise.resolve({taskId:'task'})});
beforeEach(()=>{vi.clearAllMocks();mocks.updates=[];mocks.notifications=[];mocks.conflict=false;mocks.role.mockResolvedValue({id:'admin'});mocks.queue.mockResolvedValue(['outbox']);mocks.current={project_id:'project',status:'draft',assignee_id:payload.assigneeId,client_visible:true,requires_completion:true,feedback_state:'pending',template:{template:{name:'Lead Assignment'}}};});
it.each(['','<p><br></p>','<p>Lead Detail</p>','<strong>Lead Details</strong>','<p>&nbsp;&#8203;</p>','<script>real looking content</script>','<h2>Lead details</h2><p>Add the lead information here before activating this task.</p>'])('blocks empty/default activation server-side: %s',async description=>{expect((await patch({status:'active',description})).status).toBe(400);expect(mocks.updates).toHaveLength(0);expect(mocks.queue).not.toHaveBeenCalled();});
it('allows repeated draft saves, including clearing the text, without notifications',async()=>{expect((await patch()).status).toBe(200);expect((await patch({description:''})).status).toBe(200);expect(hasMeaningfulLeadDetails(String(mocks.current.description))).toBe(false);expect(mocks.current.description).not.toContain('Lead Detail');expect(mocks.queue).not.toHaveBeenCalled();expect(mocks.notifications).toEqual([]);});
it('activates a populated renamed imported lead once and retains mixed formatting',async()=>{const description='<p><b>Name:</b> Example Buyer<br>Call Tuesday</p>';expect((await patch({status:'active',description})).status).toBe(200);expect(mocks.current).toMatchObject({status:'active',description:'<p><strong>Name:</strong> Example Buyer<br />Call Tuesday</p>'});expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(['task']);expect((await patch({status:'active',description})).status).toBe(200);expect(mocks.queue).toHaveBeenCalledTimes(1);expect(mocks.notifications).toEqual([]);});
it('does not emit events if a competing transition already won',async()=>{mocks.conflict=true;expect((await patch({status:'active',description:'Real lead details'})).status).toBe(409);expect(mocks.queue).not.toHaveBeenCalled();expect(mocks.notifications).toEqual([]);});
it('does not impose the lead content rule on other workflows',async()=>{mocks.current.template={template:{name:'Other workflow'}};expect((await patch({status:'active',description:''})).status).toBe(200);});
it('rejects non-admin updates',async()=>{mocks.role.mockResolvedValue(null);expect((await patch()).status).toBe(403);expect(mocks.updates).toHaveLength(0);});
it('initializes only once and preserves cleared and existing rich descriptions on reopen',()=>{expect(initialLeadDetails('')).toBe(DEFAULT_LEAD_DETAILS);expect(initialLeadDetails(DEFAULT_LEAD_DETAILS)).toBe(DEFAULT_LEAD_DETAILS);expect(leadDetailsEditorValue('')).toBe('');expect(initialLeadDetails('<p><strong>Actual</strong> details</p>')).toBe('<p><strong>Actual</strong> details</p>');expect(hasMeaningfulLeadDetails(DEFAULT_LEAD_DETAILS)).toBe(false);expect(hasMeaningfulLeadDetails('<p>Name: Example Buyer</p>')).toBe(true);});
