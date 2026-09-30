import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')]; }));

function outcome(error, data) {
  return {
    denied: Boolean(error) || data === null,
    code: error?.code || null,
    status: error?.status || null,
    returnedData: data !== null && data !== undefined,
  };
}

const anonymous = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const invalid = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: 'Bearer invalid.jwt.value' } },
});

const [anonymousResult, invalidResult] = await Promise.all([
  anonymous.rpc('get_portal_bootstrap'),
  invalid.rpc('get_portal_bootstrap'),
]);

console.log(JSON.stringify({
  anonymous: outcome(anonymousResult.error, anonymousResult.data),
  invalidAuth: outcome(invalidResult.error, invalidResult.data),
}, null, 2));
