import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const envFile = process.env.PERF_ENV_FILE || '.env.frankfurt-staging';
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')]; }));
const baseUrl = process.env.PERF_BASE_URL || 'http://127.0.0.1:3000';
const iterations = Math.max(50, Number(process.env.PERF_ITERATIONS || 100));
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.invalid').hostname.split('.')[0];
if (env.LEADSEDGE_PERFORMANCE_STAGING !== 'true' || env.LEADSEDGE_STAGING_REGION !== 'eu-central-1') throw new Error('Frankfurt staging guard failed.');
if (['llmmtdzlurunphdfrqlg', 'hwzbqmvovbnpuaddzbha'].includes(projectRef)) throw new Error('Refusing to benchmark a production or unrelated project.');

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
function percentile(sorted, fraction) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))]; }
function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / sorted.length;
  return { samples: sorted.length, min: sorted[0], p50: percentile(sorted, .5), p75: percentile(sorted, .75), p90: percentile(sorted, .9), p95: percentile(sorted, .95), mean: Math.round(mean * 10) / 10, standardDeviation: Math.round(Math.sqrt(variance) * 10) / 10, max: sorted.at(-1) };
}

async function createSession(email) {
  const generated = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (generated.error || !generated.data?.properties?.hashed_token) throw generated.error || new Error('Unable to create supported magic link.');
  const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const verified = await auth.auth.verifyOtp({ token_hash: generated.data.properties.hashed_token, type: 'magiclink' });
  if (verified.error || !verified.data.session) throw verified.error || new Error('Unable to establish supported benchmark session.');
  return verified.data.session;
}
function sessionCookie(session) { return `sb-${projectRef}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`; }

async function sample(label, operation) {
  await operation();
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    const result = await operation();
    if (result?.error) throw new Error(`${label}: ${result.error.message}`);
    values.push(Math.round((performance.now() - started) * 10) / 10);
  }
  return summarize(values);
}

async function route(path, cookie) {
  const operation = async () => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie, 'x-request-id': crypto.randomUUID() }, redirect: 'manual' });
    await response.arrayBuffer();
    if (response.status >= 400) throw new Error(`${path} returned ${response.status}`);
    return response;
  };
  await operation();
  const durations = []; const serverTiming = [];
  let status = 0;
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now(); const response = await operation(); status = response.status;
    durations.push(Math.round((performance.now() - started) * 10) / 10);
    const timing = response.headers.get('server-timing'); if (timing) serverTiming.push(timing);
  }
  return { status, ...summarize(durations), serverTiming };
}

const [adminSession, clientSession] = await Promise.all([
  createSession('admin.frankfurt@performance.example.com'),
  createSession('client-1.frankfurt@performance.example.com'),
]);
const adminCookie = sessionCookie(adminSession); const clientCookie = sessionCookie(clientSession);
const authenticated = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${clientSession.access_token}` } },
});

const primitive = {
  trivialAuthenticatedRead: await sample('trivial authenticated read', () => authenticated.from('users').select('id').eq('id', clientSession.user.id).single()),
  bootstrapRpc: await sample('bootstrap RPC', () => authenticated.rpc('get_portal_bootstrap')),
  unreadRpc: await sample('unread RPC', () => authenticated.rpc('get_unread_counts')),
  taskQuery: await sample('task query', () => authenticated.from('project_tasks').select('id,title,status,project_id').eq('id', '73000000-0000-4000-8000-000000000001').single()),
  messagesQuery: await sample('messages query', () => authenticated.from('task_messages').select('id,body,created_at,sender_id').eq('task_id', '73000000-0000-4000-8000-000000000001').order('created_at', { ascending: false }).limit(50)),
};

const routes = {
  admin: ['/admin', adminCookie],
  adminMessages: ['/admin/messages', adminCookie],
  adminMeetings: ['/admin/meetings', adminCookie],
  portal: ['/portal', clientCookie],
  portalTask: ['/portal/tasks/73000000-0000-4000-8000-000000000001', clientCookie],
  portalMessages: ['/portal/messages', clientCookie],
  portalMeetings: ['/portal/meetings', clientCookie],
};
const routeResults = {};
for (const [name, [path, cookie]] of Object.entries(routes)) routeResults[name] = { path, ...(await route(path, cookie)) };

const result = {
  capturedAt: new Date().toISOString(),
  environment: { name: process.env.PERF_ENVIRONMENT_NAME || 'FRANKFURT STAGING', baseUrl, supabaseHost: new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, iterations, node: process.version },
  primitiveOrigin: 'benchmark runner to Supabase',
  primitive,
  routes: routeResults,
};
if (process.env.PERF_OUTPUT_FILE) {
  fs.writeFileSync(process.env.PERF_OUTPUT_FILE, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ...result,
    routes: Object.fromEntries(Object.entries(result.routes).map(([name, routeResult]) => [name, { ...routeResult, serverTiming: `${routeResult.serverTiming.length} captured samples` }])),
  }, null, 2));
} else {
  console.log(JSON.stringify(result, null, 2));
}
