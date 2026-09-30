import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')]; }));
const fixtureId = '1da8e5db-fd4e-418e-b8c2-546a607d956b';
const ownProjectId = '98caa461-94da-428b-89cd-6bf56e4a63f4';
const ownTaskId = '53a6eeee-fec6-46d0-948d-f3f7851dcffe';
const otherProjectId = '0126118a-5d80-4588-8bc8-c65452414f74';

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: fixture, error: fixtureError } = await service.from('clients').select('email,status').eq('id', fixtureId).single();
if (fixtureError || fixture.status !== 'active') throw fixtureError || new Error('Test fixture is not active.');
const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: 'magiclink', email: fixture.email });
if (linkError || !link?.properties?.hashed_token) throw linkError || new Error('Unable to establish test client session.');
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: authError } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
if (authError) throw authError;

const [bootstrap, ownProject, ownTask, otherProject, otherLinks, otherTasks, otherMessages, otherMeetings, adminOnly] = await Promise.all([
  client.rpc('get_portal_bootstrap'),
  client.from('projects').select('id').eq('id', ownProjectId),
  client.from('project_tasks').select('id').eq('id', ownTaskId),
  client.from('projects').select('id').eq('id', otherProjectId),
  client.from('project_clients').select('project_id').eq('project_id', otherProjectId),
  client.from('project_tasks').select('id').eq('project_id', otherProjectId),
  client.from('project_messages').select('id').eq('project_id', otherProjectId),
  client.from('meetings').select('id').eq('project_id', otherProjectId),
  client.rpc('get_admin_people', { search_query: '', page_limit: 1, page_offset: 0 }),
]);
if (bootstrap.error) throw bootstrap.error;
const payload = bootstrap.data;
const keys = Object.keys(payload || {}).sort();
const viewerKeys = Object.keys(payload?.viewer || {}).sort();
console.log(JSON.stringify({
  bootstrap: {
    topLevelKeys: keys,
    viewerKeys,
    role: payload?.viewer?.role,
    disabled: payload?.authorization?.disabled,
    projectIsOwned: [ownProjectId, '20772d23-1bb3-4123-b129-69bdc949d285', 'f672525d-9c92-4d5a-8a05-f2114f8ba379'].includes(payload?.shell?.primaryProjectId),
    hasAdminOnlyKeys: keys.some((key) => /admin|email|token|setting/i.test(key)),
  },
  own: { projectRows: ownProject.data?.length || 0, taskRows: ownTask.data?.length || 0 },
  crossClient: {
    projectRows: otherProject.data?.length || 0,
    membershipRows: otherLinks.data?.length || 0,
    taskRows: otherTasks.data?.length || 0,
    messageRows: otherMessages.data?.length || 0,
    meetingRows: otherMeetings.data?.length || 0,
  },
  adminOnlyDenied: Boolean(adminOnly.error),
}, null, 2));
