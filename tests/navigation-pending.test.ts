import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const state=vi.hoisted(()=>({pending:false}));
vi.mock('next/link',()=>({useLinkStatus:()=>({pending:state.pending})}));
import { NavigationPending } from '@/components/navigation-pending';

it('adds no indicator or status announcement when the router is idle',()=>{
  state.pending=false;
  expect(NavigationPending()).toBeNull();
});
it('exposes accessible, nonblocking feedback only while the router is pending',()=>{
  state.pending=true;
  const markup=renderToStaticMarkup(NavigationPending());
  expect(markup).toContain('role="status"');
  expect(markup).toContain('Loading page');
  expect(markup).toContain('pointer-events-none');
  state.pending=false;
  expect(NavigationPending()).toBeNull();
});
