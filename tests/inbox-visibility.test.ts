import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { inboxVisibilitySchema, visibilityKeys, visibilityRequest } from '@/lib/inbox-visibility';
import { retainOpenProjectThreads, emptyAdminProjectThread } from '@/lib/message-workspace';
import type { ProjectSummary } from '@/lib/types';
const mock=vi.hoisted(()=>({role:vi.fn(),rpc:vi.fn(),demo:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireApiRole:mock.role}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:async()=>({rpc:mock.rpc})}));
vi.mock('@/lib/env',()=>({isDemoMode:mock.demo}));
import { POST } from '@/app/api/messages/visibility/route';
const project='10000000-0000-4000-8000-000000000001';
const task='10000000-0000-4000-8000-000000000002';
function request(body:unknown,origin='http://127.0.0.1:3000'){return new NextRequest('http://127.0.0.1:3000/api/messages/visibility',{method:'POST',headers:{host:'127.0.0.1:3000',origin,'content-type':'application/json','sec-fetch-site':'same-origin'},body:JSON.stringify(body)});}
beforeEach(()=>{vi.stubEnv('LEADSEDGE_INBOX_REMOVAL_ENABLED','true');mock.role.mockResolvedValue({id:'viewer',role:'admin'});mock.rpc.mockReset().mockResolvedValue({error:null});mock.demo.mockReturnValue(false);});
afterEach(()=>vi.unstubAllEnvs());
describe('own inbox visibility endpoint',()=>{
 it('persists single and bulk operations without sending a user ID',async()=>{for(const body of [visibilityRequest([`project:${project}`]),visibilityRequest([`project:${project}`,`task:${task}`])]){expect((await POST(request(body))).status).toBe(200);expect(mock.rpc).toHaveBeenLastCalledWith('set_own_inbox_visibility',{project_ids:body.projectIds,task_ids:body.taskIds,hide:true});}});
 it('supports explicit own-inbox restoration',async()=>{expect((await POST(request(visibilityRequest([`project:${project}`],false)))).status).toBe(200);expect(mock.rpc.mock.calls[0][1].hide).toBe(false);});
 it('rejects client/anonymous, cross-origin and forged ownership',async()=>{mock.role.mockResolvedValue(null);expect((await POST(request(visibilityRequest([`project:${project}`])))).status).toBe(403);mock.role.mockResolvedValue({id:'viewer',role:'admin'});expect((await POST(request(visibilityRequest([`project:${project}`]),'https://evil.test'))).status).toBe(403);expect((await POST(request({...visibilityRequest([`project:${project}`]),userId:'another-user'}))).status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();});
 it('fails closed when disabled, demo or persistence fails',async()=>{vi.stubEnv('LEADSEDGE_INBOX_REMOVAL_ENABLED','false');expect((await POST(request(visibilityRequest([`project:${project}`])))).status).toBe(503);vi.stubEnv('LEADSEDGE_INBOX_REMOVAL_ENABLED','true');mock.demo.mockReturnValue(true);expect((await POST(request(visibilityRequest([`project:${project}`])))).status).toBe(503);mock.demo.mockReturnValue(false);mock.rpc.mockResolvedValue({error:{code:'42501'}});expect((await POST(request(visibilityRequest([`project:${project}`])))).status).toBe(403);});
 it('bounds requests and validates resource IDs',()=>{expect(inboxVisibilitySchema.safeParse({projectIds:[],taskIds:[],hide:true}).success).toBe(false);expect(inboxVisibilitySchema.safeParse({projectIds:Array(101).fill(project),taskIds:[],hide:true}).success).toBe(false);expect(inboxVisibilitySchema.safeParse({projectIds:['invalid'],taskIds:[],hide:true}).success).toBe(false);expect(visibilityRequest([`project:${project}`,`project:${project}`]).projectIds).toHaveLength(1);});
 it('does not resurrect hidden project threads during cache reconciliation',()=>{const p={id:project,projectName:'Test',clientName:'Client'} as ProjectSummary;const thread=emptyAdminProjectThread(p);expect(retainOpenProjectThreads({threads:[],projects:[p],hiddenKeys:[thread.key]},{threads:[thread],projects:[p],hiddenKeys:[]}).threads).toHaveLength(0);expect(retainOpenProjectThreads({threads:[],projects:[p],hiddenKeys:[]},{threads:[thread],projects:[p],hiddenKeys:[]}).threads).toHaveLength(1);expect(visibilityKeys([{project_id:project,task_id:null}]).has(thread.key)).toBe(true);});
});
