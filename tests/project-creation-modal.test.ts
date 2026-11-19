import {beforeEach,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({slots:[] as unknown[],cursor:0,fetch:vi.fn(),invalidate:vi.fn(),key:vi.fn()}));
vi.mock('react',async original=>({
 ...await original<typeof import('react')>(),
 useState:(initial:unknown)=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]=initial;return [h.slots[i],(value:unknown)=>{h.slots[i]=typeof value==='function'?value(h.slots[i]):value;}];},
 useRef:(initial:unknown)=>{const i=h.cursor++;if(!(i in h.slots))h.slots[i]={current:initial};return h.slots[i];},
 useMemo:(compute:()=>unknown)=>compute(),
}));
vi.mock('@/components/cached-screen',()=>({useCacheMutation:()=>h.invalidate}));
vi.mock('@/lib/project-creation-request',()=>({projectCreationRequestKey:h.key}));
import {DashboardClient} from '@/components/admin/dashboard-client';
import {ProjectCreatedNotice} from '@/components/admin/project-created-notice';
type Element={type:unknown;props:Record<string,unknown>};
function tree(value:unknown):Element[]{if(Array.isArray(value))return value.flatMap(tree);if(!value||typeof value!=='object'||!('props'in value))return [];const node=value as Element;return [node,...tree(node.props.children)];}
function render(){h.cursor=0;return tree(DashboardClient({projects:[],clients:[],ownerName:'Synthetic Admin',upcomingMeeting:null}));}
function click(element:Element){return (element.props.onClick as ()=>Promise<void>|void)();}
function button(label:string){const found=render().find(n=>n.type==='button'&&JSON.stringify(n.props.children).includes(label));if(!found)throw Error('Missing button '+label);return found;}
function field(label:string,value:string){const found=render().find(n=>n.props.label===label);if(!found)throw Error('Missing field '+label);(found.props.onChange as (v:string)=>void)(value);}
async function form(){await click(button('New project'));field('Project name','Synthetic Project');await click(button('Continue'));field('Full name','Synthetic Client');field('Email','synthetic@example.test');}
const projectId='10000000-0000-4000-8000-000000000001';
beforeEach(()=>{h.slots=[];h.cursor=0;vi.clearAllMocks();vi.stubGlobal('fetch',h.fetch);h.key.mockResolvedValue('same-key');h.invalidate.mockResolvedValue(undefined);});
it('closes the modal and shows the existing project even when HTTP201 contains a warning',async()=>{
 h.fetch.mockResolvedValue({ok:true,status:201,json:async()=>({projectId,warning:'No email was sent',invitationStatus:'not_sent'})});
 await form();await click(button('Create project'));
 const nodes=render();expect(nodes.some(n=>n.props.role==='dialog')).toBe(false);
 expect(nodes.find(n=>n.type===ProjectCreatedNotice)?.props.result).toMatchObject({projectId,invitationStatus:'not_sent'});
 expect(nodes.some(n=>n.type==='button'&&n.props.children==='Create project')).toBe(false);
});
it('blocks rapid repeated clicks before React rerenders',async()=>{
 let release:()=>void=()=>{};h.fetch.mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({ok:true,status:201,json:async()=>({projectId,invitationStatus:'sent'})});}));
 await form();const submit=button('Create project');const first=click(submit);await Promise.resolve();await click(submit);
 expect(h.fetch).toHaveBeenCalledTimes(1);release();await first;
});
it('retains an uncertain request and reuses its identity after a network timeout',async()=>{
 h.fetch.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ok:true,status:200,json:async()=>({projectId,invitationStatus:'pending'})});
 await form();await click(button('Create project'));
 expect(render().find(n=>n.type==='fieldset')?.props.disabled).toBe(true);
 await click(button('Check same request'));
 expect(h.fetch.mock.calls[0][1]).toEqual(h.fetch.mock.calls[1][1]);
 expect(render().some(n=>n.props.role==='dialog')).toBe(false);
});
it('cache refresh failure cannot turn a committed project back into a creation form',async()=>{
 h.fetch.mockResolvedValue({ok:true,status:201,json:async()=>({projectId,invitationStatus:'sent'})});h.invalidate.mockRejectedValue(new Error('cache'));
 await form();await click(button('Create project'));expect(render().some(n=>n.props.role==='dialog')).toBe(false);
 expect(render().some(n=>n.type===ProjectCreatedNotice)).toBe(true);
});
