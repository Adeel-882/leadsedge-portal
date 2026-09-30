import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envFile = process.env.PERF_ENV_FILE || '.env.frankfurt-staging';
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')]; }));

const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.invalid').hostname.split('.')[0];
if (env.LEADSEDGE_PERFORMANCE_STAGING !== 'true' || env.LEADSEDGE_STAGING_REGION !== 'eu-central-1') throw new Error('Frankfurt staging guard failed.');
if (['llmmtdzlurunphdfrqlg', 'hwzbqmvovbnpuaddzbha'].includes(projectRef)) throw new Error('Refusing to test a production or unrelated project.');

const fixture = {
  client1: '71000000-0000-4000-8000-000000000001',
  client2: '71000000-0000-4000-8000-000000000002',
  disabled: '71000000-0000-4000-8000-000000000003',
  client1Project: '72000000-0000-4000-8000-000000000001',
  client2Project: '72000000-0000-4000-8000-000000000004',
  client1Task: '73000000-0000-4000-8000-000000000001',
  client2Task: '73000000-0000-4000-8000-000000000016',
  client1Meeting: '79000000-0000-4000-8000-000000000001',
  client2Meeting: '79000000-0000-4000-8000-000000000004',
};

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const invalid = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer invalid.jwt.value' } },
});

async function sessionClient(email) {
  const generated = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (generated.error || !generated.data?.properties?.hashed_token) throw generated.error || new Error(`Unable to create supported magic link for ${email}`);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await client.auth.verifyOtp({ token_hash: generated.data.properties.hashed_token, type: 'magiclink' });
  if (verified.error || !verified.data.session) throw verified.error || new Error(`Unable to verify supported magic link for ${email}`);
  return client;
}

function rows(result) { return { rows: result.data?.length || 0, error: result.error?.message || null }; }
function denied(result) { return Boolean(result.error) || result.data === null || (Array.isArray(result.data) && result.data.length === 0); }

const [admin, client1, client2, disabled] = await Promise.all([
  sessionClient('admin.frankfurt@performance.example.com'),
  sessionClient('client-1.frankfurt@performance.example.com'),
  sessionClient('client-2.frankfurt@performance.example.com'),
  sessionClient('client-3.frankfurt@performance.example.com'),
]);

async function projectResources(client, projectId, taskId, meetingId) {
  const [project, membership, task, projectMessage, taskMessage, meeting] = await Promise.all([
    client.from('projects').select('id').eq('id', projectId),
    client.from('project_clients').select('project_id,client_id').eq('project_id', projectId),
    client.from('project_tasks').select('id').eq('id', taskId),
    client.from('project_messages').select('id').eq('project_id', projectId).limit(1),
    client.from('task_messages').select('id').eq('task_id', taskId).limit(1),
    client.from('meetings').select('id').eq('id', meetingId),
  ]);
  return { project: rows(project), membership: rows(membership), task: rows(task), projectMessage: rows(projectMessage), taskMessage: rows(taskMessage), meeting: rows(meeting) };
}

const [anonymousBootstrap, anonymousMembership, invalidBootstrap, invalidMembership, adminPeople, adminMembership, clientAdminPeople, client1Own, client1Cross, client2Own, client2Cross, disabledBootstrap, disabledOwn] = await Promise.all([
  anonymous.rpc('get_portal_bootstrap'),
  anonymous.from('project_clients').select('project_id,client_id').limit(1),
  invalid.rpc('get_portal_bootstrap'),
  invalid.from('project_clients').select('project_id,client_id').limit(1),
  admin.rpc('get_admin_people', { search_text: '', page_number: 1, page_size: 2 }),
  admin.from('project_clients').select('project_id,client_id'),
  client1.rpc('get_admin_people', { search_text: '', page_number: 1, page_size: 2 }),
  projectResources(client1, fixture.client1Project, fixture.client1Task, fixture.client1Meeting),
  projectResources(client1, fixture.client2Project, fixture.client2Task, fixture.client2Meeting),
  projectResources(client2, fixture.client2Project, fixture.client2Task, fixture.client2Meeting),
  projectResources(client2, fixture.client1Project, fixture.client1Task, fixture.client1Meeting),
  disabled.rpc('get_portal_bootstrap'),
  projectResources(disabled, '72000000-0000-4000-8000-000000000005', '73000000-0000-4000-8000-000000000017', '79000000-0000-4000-8000-000000000005'),
]);

const crossDenied = (result) => Object.values(result).every((entry) => entry.rows === 0);
const ownVisible = (result) => result.project.rows === 1 && result.membership.rows === 1 && result.task.rows === 1 && result.meeting.rows === 1;
const checks = {
  anonymousBootstrapDenied: denied(anonymousBootstrap),
  anonymousMembershipDenied: denied(anonymousMembership),
  invalidTokenDenied: denied(invalidBootstrap),
  invalidTokenMembershipDenied: denied(invalidMembership),
  adminPeopleAllowed: !adminPeople.error && (adminPeople.data?.length || 0) > 0,
  adminMembershipsAllowed: !adminMembership.error && adminMembership.data?.length === 10,
  clientAdminRpcDenied: Boolean(clientAdminPeople.error),
  client1OwnVisible: ownVisible(client1Own),
  client1CrossDenied: crossDenied(client1Cross),
  client2OwnVisible: ownVisible(client2Own),
  client2CrossDenied: crossDenied(client2Cross),
  disabledBootstrapDenied: denied(disabledBootstrap),
  disabledProtectedDataDenied: crossDenied(disabledOwn),
};

console.log(JSON.stringify({ projectRef, checks, details: { client1Own, client1Cross, client2Own, client2Cross, disabledOwn } }, null, 2));
if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
