import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('@/components/admin/invite-button',()=>({InviteButton:({projectId}:{projectId:string})=>createElement('button',{'data-project':projectId},'Resend invitation')}));
import {ProjectCreatedNotice} from '@/components/admin/project-created-notice';
import {committedProjectResult,type ProjectCreationResult} from '@/lib/project-creation';
const result:ProjectCreationResult={projectId:'10000000-0000-4000-8000-000000000001',projectName:'Synthetic Long Project Name',invitationStatus:'not_sent',warning:'Tracking unavailable'};
it('shows committed identity, open link and existing resend control on failed delivery',()=>{
 const html=renderToStaticMarkup(createElement(ProjectCreatedNotice,{result}));expect(html).toContain('Project was created');expect(html).toContain('NOT sent');expect(html).toContain(result.projectId);expect(html).toContain('Open project');expect(html).toContain('Resend invitation');expect(html).toContain('sm:flex-row');expect(html).toContain('break-all');
});
it('does not offer a second send while the first request may still be processing',()=>{
 const html=renderToStaticMarkup(createElement(ProjectCreatedNotice,{result:{...result,invitationStatus:'pending'}}));expect(html).not.toContain('Resend invitation');expect(html).toContain('not yet confirmed');
});
it('accepts legacy HTTP201 projectId plus warning as committed success',()=>expect(committedProjectResult({projectId:result.projectId,warning:'No email'})).toMatchObject({projectId:result.projectId,invitationStatus:'unknown'}));
