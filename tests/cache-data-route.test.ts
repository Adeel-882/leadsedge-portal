import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({viewer:vi.fn(),load:vi.fn()}));
vi.mock('@/lib/auth',()=>({getViewer:mocks.viewer}));
vi.mock('@/lib/screen-data',()=>({allowedScreen:(role:string,screen:string)=>(role==='admin'?['dashboard','templates']:['tasks','task']).includes(screen),loadScreen:mocks.load}));
import { GET } from '@/app/api/data/[role]/[screen]/route';
const request=(id='client-a')=>new Request('http://127.0.0.1:3000/api/data/client/task?id=foreign',{headers:{'x-cache-viewer':id}});
const params=(role='client',screen='task')=>({params:Promise.resolve({role,screen})});
beforeEach(()=>{vi.clearAllMocks();mocks.viewer.mockResolvedValue({id:'client-a',role:'client'});mocks.load.mockResolvedValue([])});
describe('cache read authorization boundary',()=>{
 it('denies a missing/disabled viewer before loading data',async()=>{mocks.viewer.mockResolvedValue(null);expect((await GET(request(),params())).status).toBe(401);expect(mocks.load).not.toHaveBeenCalled()});
 it('denies client-to-admin access',async()=>{expect((await GET(request(),params('admin','dashboard'))).status).toBe(403);expect(mocks.load).not.toHaveBeenCalled()});
 it('denies an account switch response entering the previous account cache',async()=>{expect((await GET(request('client-b'),params())).status).toBe(403);expect(mocks.load).not.toHaveBeenCalled()});
 it('denies an unauthorized resource without caching an empty success',async()=>{mocks.load.mockResolvedValue(null);expect((await GET(request(),params())).status).toBe(404)});
 it('uses session-scoped loader data and private no-store HTTP responses',async()=>{const response=await GET(request(),params('client','tasks'));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(mocks.load).toHaveBeenCalledWith('client','tasks',[])});
 it('surfaces a failed read rather than a false empty state',async()=>{mocks.load.mockRejectedValue(Error('database error'));expect((await GET(request(),params())).status).toBe(500)});
});
