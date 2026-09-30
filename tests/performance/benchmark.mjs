import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const baseUrl = process.env.PERF_BASE_URL || 'http://127.0.0.1:3000';
const iterations = Math.max(3, Number(process.env.PERF_ITERATIONS || 10));
const envFile = process.env.PERF_ENV_FILE || '.env.local';
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith('#') && line.includes('=')).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')]; }));
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

function sessionCookie(session) {
  return `sb-${projectRef}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

async function createSession(email) {
  const generated = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (generated.error || !generated.data?.properties?.hashed_token) throw generated.error || new Error('Unable to create benchmark session');
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await auth.auth.verifyOtp({ token_hash: generated.data.properties.hashed_token, type: 'magiclink' });
  if (verified.error || !verified.data.session) throw verified.error || new Error('Unable to verify benchmark session');
  return verified.data.session;
}

function percentile(sorted, value) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(value * sorted.length) - 1))];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + ((value - average) ** 2), 0) / sorted.length;
  return {
    min: sorted[0], p50: percentile(sorted, 0.5), p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9), p95: percentile(sorted, 0.95), max: sorted.at(-1),
    average: Math.round(average), standardDeviation: Math.round(Math.sqrt(variance)), samples,
  };
}

async function timedFetch(path, cookie) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' });
  await response.arrayBuffer();
  return { status: response.status, duration: Math.round(performance.now() - started), serverTiming: response.headers.get('server-timing') };
}

async function benchmarkRoute(path, cookie) {
  await timedFetch(path, cookie);
  const samples = []; let status = 0; const serverTiming = [];
  for (let index = 0; index < iterations; index += 1) {
    const result = await timedFetch(path, cookie); status = result.status; samples.push(result.duration);
    if (result.serverTiming) serverTiming.push(result.serverTiming);
  }
  return { status, ...summarize(samples), serverTiming };
}

async function benchmarkAuth(session) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
  const operations = {
    getClaims: () => client.auth.getClaims(session.access_token),
    getUser: () => client.auth.getUser(session.access_token),
    profile: () => client.from('users').select('id,role,full_name').eq('id', session.user.id).maybeSingle(),
    unreadRpc: () => client.rpc('get_unread_counts'),
  };
  const results = {};
  for (const [name, operation] of Object.entries(operations)) {
    const samples = [];
    for (let index = 0; index < iterations; index += 1) { const started = performance.now(); const result = await operation(); if (result.error) throw result.error; samples.push(Math.round(performance.now() - started)); }
    results[name] = summarize(samples);
  }
  return results;
}

const [{ data: admin }, { data: clients }] = await Promise.all([
  service.from('users').select('id,email').eq('role', 'admin').limit(1).single(),
  service.from('clients').select('id,email,auth_user_id').eq('status', 'active').not('auth_user_id', 'is', null).limit(20),
]);
if (!admin || !clients?.length) throw new Error('Existing benchmark users are unavailable');
const client = clients[0];
const [{ data: membership }, { data: task }] = await Promise.all([
  service.from('project_clients').select('project_id').eq('client_id', client.id).limit(1).single(),
  service.from('project_tasks').select('id,project_id').eq('assignee_id', client.id).is('archived_at', null).limit(1).single(),
]);
if (!membership || !task) throw new Error('Existing representative project/task data is unavailable');
const [adminSession, clientSession] = await Promise.all([createSession(admin.email), createSession(client.email)]);
const adminCookie = sessionCookie(adminSession); const clientCookie = sessionCookie(clientSession);

const routes = {
  adminDashboard: ['/admin', adminCookie],
  adminProject: [`/admin/projects/${membership.project_id}`, adminCookie],
  adminMessages: ['/admin/messages', adminCookie],
  adminMeetings: ['/admin/meetings', adminCookie],
  portalHome: ['/portal', clientCookie],
  portalTask: [`/portal/tasks/${task.id}`, clientCookie],
  portalMessages: ['/portal/messages', clientCookie],
  portalMeetings: ['/portal/meetings', clientCookie],
  unreadCounts: ['/api/unread-counts', clientCookie],
};
const routeResults = {};
const selectedRoutes = new Set((process.env.PERF_ROUTES || '').split(',').map((value) => value.trim()).filter(Boolean));
for (const [name, [path, cookie]] of Object.entries(routes)) {
  if (selectedRoutes.size && !selectedRoutes.has(name)) continue;
  routeResults[name] = { path, ...(await benchmarkRoute(path, cookie)) };
}

console.log(JSON.stringify({
  capturedAt: new Date().toISOString(), environment: { kind: process.env.PERF_ENVIRONMENT_NAME || 'LOCAL MACHINE TEST', baseUrl, envFile, iterations, node: process.version, supabaseHost: new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname },
  routes: routeResults, auth: process.env.PERF_SKIP_AUTH === 'true' ? null : await benchmarkAuth(clientSession),
}, null, 2));
