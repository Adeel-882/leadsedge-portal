import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeQueryClient, queryKeys, freshness, readJson } from '@/lib/query-cache';
const state = vi.hoisted(() => ({ client: null as unknown, identity: { id:'viewer-a', role:'admin' as 'admin'|'client' } }));
vi.mock('next/link', () => ({ default:'a' }));
vi.mock('@tanstack/react-query', async original => ({ ...await original<object>(), useQueryClient:()=>state.client }));
vi.mock('@/components/query-provider', () => ({ useCacheIdentity:()=>state.identity }));
import { CacheLink } from '@/components/cache-link';
import { screenUrl } from '@/components/cached-screen';
let client: ReturnType<typeof makeQueryClient>;
const event = (overrides = {}) => ({ button:0, defaultPrevented:false, currentTarget:{ target:'',hasAttribute:()=>false }, ...overrides });
beforeEach(()=>{ client=makeQueryClient(); state.client=client; state.identity={id:'viewer-a',role:'admin'}; });
afterEach(()=>{client.clear();vi.unstubAllGlobals();});
it.each([['/admin','dashboard',[]],['/admin/people','people',['','1']],['/admin/templates','templates',[]],['/portal','home',[]],['/portal/tasks','tasks',[]]] as const)('starts %s data before route arrival and shares the in-flight request',async(href,screen,args)=>{
  state.identity.role=href.startsWith('/portal')?'client':'admin';
  let resolve!:(r:Response)=>void;
  const fetch=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetch);
  const link=CacheLink({href}); link.props.onClick(event());
  expect(fetch).toHaveBeenCalledExactlyOnceWith(screenUrl(state.identity.role,screen,[...args]),expect.objectContaining({cache:'no-store',headers:{'x-cache-viewer':'viewer-a'}}));
  link.props.onMouseEnter({}); link.props.onFocus({});
  const mounted=client.fetchQuery({queryKey:queryKeys.data(state.identity,screen,...args),queryFn:()=>readJson(screenUrl(state.identity.role,screen,[...args]),state.identity),...freshness(screen)});
  expect(fetch).toHaveBeenCalledTimes(1);
  resolve(new Response('{}')); await mounted;
  link.props.onClick(event()); expect(fetch).toHaveBeenCalledTimes(1);
  expect(link.props.prefetch).toBe(false);
});
it.each([{defaultPrevented:true},{button:1},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{currentTarget:{target:'_blank',hasAttribute:()=>false}},{currentTarget:{target:'',hasAttribute:()=>true}}])('does not start data for a cancelled/native browser action %j',overrides=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);CacheLink({href:'/admin/people'}).props.onClick(event(overrides));expect(fetch).not.toHaveBeenCalled();
});
it('calls the supplied handler first and honors its cancellation',()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const onClick=vi.fn(e=>{e.defaultPrevented=true;});
  CacheLink({href:'/admin/people',onClick}).props.onClick(event());
  expect(onClick).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
});
it.each(['/auth/sign-out','https://external.example','/admin/messages','/portal/tasks/foreign'])('leaves unmapped destination %s alone',href=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);CacheLink({href}).props.onClick(event());expect(fetch).not.toHaveBeenCalled();
});
it('does not convert a denied prefetch into cached private data',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'Denied'}),{status:403})));
  CacheLink({href:'/portal/tasks'}).props.onClick(event());
  const key=queryKeys.data(state.identity,'tasks');
  await vi.waitFor(()=>expect(client.getQueryState(key)?.status).toBe('error'));
  expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getQueryState(key)?.error).toMatchObject({status:403});
});
it('does not reuse another account cache',async()=>{
  client.setQueryData(queryKeys.data({id:'other',role:'admin'},'people','','1'),{private:true});
  const fetch=vi.fn(async()=>new Response('{}'));vi.stubGlobal('fetch',fetch);
  CacheLink({href:'/admin/people'}).props.onClick(event());
  await vi.waitFor(()=>expect(client.getQueryState(queryKeys.data(state.identity,'people','','1'))?.status).toBe('success'));
  expect(fetch).toHaveBeenCalledOnce();expect(client.getQueryData(queryKeys.data(state.identity,'people','','1'))).toEqual({});
});
