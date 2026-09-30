import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const envFile = process.env.PERF_ENV_FILE || '.env.frankfurt.local';
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map((line) => {
    const at = line.indexOf('=');
    return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')];
  }));

const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.invalid').hostname.split('.')[0];
if (env.LEADSEDGE_PERFORMANCE_STAGING !== 'true' || env.LEADSEDGE_STAGING_REGION !== 'eu-central-1') {
  throw new Error('Frankfurt staging guard failed.');
}
if (['llmmtdzlurunphdfrqlg', 'hwzbqmvovbnpuaddzbha'].includes(projectRef)) {
  throw new Error('Refusing to test a production or unrelated project.');
}

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const generated = await service.auth.admin.generateLink({
  type: 'magiclink',
  email: 'client-1.frankfurt@performance.example.com',
});
if (generated.error || !generated.data?.properties?.hashed_token) {
  throw generated.error || new Error('Unable to create the staging Realtime session.');
}

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const verified = await client.auth.verifyOtp({
  token_hash: generated.data.properties.hashed_token,
  type: 'magiclink',
});
if (verified.error || !verified.data.session) {
  throw verified.error || new Error('Unable to verify the staging Realtime session.');
}

async function subscribeOnce(realtimeClient, label) {
  const channel = realtimeClient.channel(`phase5-${label}-${randomUUID()}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'task_messages',
    }, () => undefined);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} subscription timed out.`)), 15_000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve();
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        clearTimeout(timeout);
        reject(new Error(`${label} subscription failed: ${status}`));
      }
    });
  });

  await realtimeClient.removeChannel(channel);
}

await subscribeOnce(client, 'initial');
client.realtime.disconnect();

const reconnectedClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await reconnectedClient.realtime.setAuth(verified.data.session.access_token);
await subscribeOnce(reconnectedClient, 'reconnect');
reconnectedClient.realtime.disconnect();

console.log(JSON.stringify({
  projectRef,
  initialSubscription: true,
  reconnectSubscription: true,
  dataMutations: 0,
}, null, 2));
