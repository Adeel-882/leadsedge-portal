import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envFile = process.env.PERF_ENV_FILE || '.env.frankfurt.local';
const baseUrl = process.env.PERF_BASE_URL || 'http://127.0.0.1:3000';
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')]; }));

const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.invalid').hostname.split('.')[0];
if (env.LEADSEDGE_PERFORMANCE_STAGING !== 'true' || env.LEADSEDGE_STAGING_REGION !== 'eu-central-1') throw new Error('Frankfurt staging guard failed.');
if (['llmmtdzlurunphdfrqlg', 'hwzbqmvovbnpuaddzbha'].includes(projectRef)) throw new Error('Refusing to test a production or unrelated project.');

const fixture = {
  project: '72000000-0000-4000-8000-000000000001',
  task: '73000000-0000-4000-8000-000000000001',
  crossTask: '73000000-0000-4000-8000-000000000016',
};

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function createSession(email) {
  const generated = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (generated.error || !generated.data?.properties?.hashed_token) throw generated.error || new Error(`Unable to create staging login for ${email}`);
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await auth.auth.verifyOtp({ token_hash: generated.data.properties.hashed_token, type: 'magiclink' });
  if (verified.error || !verified.data.session) throw verified.error || new Error(`Unable to verify staging login for ${email}`);
  return verified.data.session;
}

function sessionCookie(session) {
  return `sb-${projectRef}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

async function request(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { Cookie: cookie } : undefined,
    redirect: 'manual',
  });
  const body = await response.text();
  return { response, body };
}

function locationEndsWith(response, expected) {
  const location = response.headers.get('location');
  return Boolean(location && new URL(location, baseUrl).pathname === expected);
}

const [adminSession, clientSession, logoutSession] = await Promise.all([
  createSession('admin.frankfurt@performance.example.com'),
  createSession('client-1.frankfurt@performance.example.com'),
  createSession('client-2.frankfurt@performance.example.com'),
]);
const adminCookie = sessionCookie(adminSession);
const clientCookie = sessionCookie(clientSession);
const logoutCookie = sessionCookie(logoutSession);

const adminPaths = [
  '/admin',
  '/admin/messages',
  '/admin/meetings',
  '/admin/notifications',
  '/admin/people?q=client&page=1',
  `/admin/projects/${fixture.project}`,
  `/admin/projects/${fixture.project}/tasks`,
  `/admin/projects/${fixture.project}/tasks/${fixture.task}`,
];
const clientPaths = [
  '/portal',
  '/portal/tasks',
  `/portal/tasks/${fixture.task}`,
  '/portal/messages',
  '/portal/meetings',
  '/portal/notifications',
  '/portal/account',
];

const adminResults = await Promise.all(adminPaths.map(async (path) => ({ path, ...(await request(path, adminCookie)) })));
const clientResults = await Promise.all(clientPaths.map(async (path) => ({ path, ...(await request(path, clientCookie)) })));
const [anonymousAdmin, anonymousPortal, adminToPortal, clientToAdmin, manipulatedTask] = await Promise.all([
  request('/admin'),
  request('/portal'),
  request('/portal', adminCookie),
  request('/admin', clientCookie),
  request(`/portal/tasks/${fixture.crossTask}`, clientCookie),
]);

const firstPage = await request(`/api/messages/task/${fixture.task}`, clientCookie);
const firstPayload = JSON.parse(firstPage.body);
const secondPage = await request(`/api/messages/task/${fixture.task}?before=${encodeURIComponent(firstPayload.messages?.[0]?.createdAt || '')}`, clientCookie);
const secondPayload = JSON.parse(secondPage.body);
const thirdPage = await request(`/api/messages/task/${fixture.task}?before=${encodeURIComponent(secondPayload.messages?.[0]?.createdAt || '')}`, clientCookie);
const thirdPayload = JSON.parse(thirdPage.body);

const transitionAdminBefore = await request('/admin', adminCookie);
const transitionClient = await request('/admin', clientCookie);
const transitionAdminAfter = await request('/admin', adminCookie);
const logout = await request('/auth/sign-out', logoutCookie);

const checks = {
  adminPagesLoad: adminResults.every(({ response }) => response.status === 200),
  clientPagesLoad: clientResults.every(({ response }) => response.status === 200),
  anonymousAdminDenied: anonymousAdmin.response.status === 307 && locationEndsWith(anonymousAdmin.response, '/auth/sign-in'),
  anonymousPortalDenied: anonymousPortal.response.status === 307 && locationEndsWith(anonymousPortal.response, '/auth/sign-in'),
  adminRedirectedFromPortal: adminToPortal.response.status === 307 && locationEndsWith(adminToPortal.response, '/admin'),
  clientRedirectedFromAdmin: clientToAdmin.response.status === 307 && locationEndsWith(clientToAdmin.response, '/portal'),
  manipulatedTaskDenied: manipulatedTask.response.status === 404
    || (manipulatedTask.response.status === 200 && /404|not found/i.test(manipulatedTask.body)),
  messagePagination: firstPage.response.status === 200 && firstPayload.messages?.length === 50 && firstPayload.hasMore === true
    && secondPage.response.status === 200 && secondPayload.messages?.length === 50 && secondPayload.hasMore === true
    && thirdPage.response.status === 200 && thirdPayload.messages?.length === 20 && thirdPayload.hasMore === false,
  adminClientAdminTransition: transitionAdminBefore.response.status === 200
    && transitionClient.response.status === 307 && locationEndsWith(transitionClient.response, '/portal')
    && transitionAdminAfter.response.status === 200,
  logoutClearsSession: logout.response.status === 307 && locationEndsWith(logout.response, '/auth/sign-in')
    && (logout.response.headers.get('set-cookie') || '').includes('Max-Age=0'),
};

console.log(JSON.stringify({
  projectRef,
  checks,
  pages: {
    admin: adminResults.map(({ path, response }) => ({ path, status: response.status })),
    client: clientResults.map(({ path, response }) => ({ path, status: response.status })),
  },
  pagination: [firstPayload.messages?.length, secondPayload.messages?.length, thirdPayload.messages?.length],
  manipulatedTask: {
    status: manipulatedTask.response.status,
    renderedNotFound: /404|not found/i.test(manipulatedTask.body),
  },
}, null, 2));

if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
