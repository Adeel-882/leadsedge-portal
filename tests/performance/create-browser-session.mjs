import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const role = process.argv[2];
const destination = process.argv[3];
if (!['admin', 'client'].includes(role) || !destination) throw new Error('Usage: node create-browser-session.mjs <admin|client> <output-file>');
// Prefer the environment the process was actually started with (for example
// `node --env-file=.env.frankfurt.local`). Falling back to .env.local silently
// pointed this helper at the retired Seoul project while the server under test
// was running Frankfurt.
const env = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? process.env
  : Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, "")]; }));
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const table = role === 'admin' ? 'users' : 'clients';
let query = service.from(table).select('email');
query = role === 'admin' ? query.eq('role', 'admin') : query.eq('status', 'active').not('auth_user_id', 'is', null);
if (role === 'client' && process.env.PERF_CLIENT_ID) query = query.eq('id', process.env.PERF_CLIENT_ID);
const { data: identity, error: identityError } = await query.limit(1).single();
if (identityError || !identity?.email) throw identityError || new Error('No benchmark identity available');
const { data, error } = await service.auth.admin.generateLink({ type: 'magiclink', email: identity.email });
if (error || !data?.properties?.hashed_token) throw error || new Error('Unable to create benchmark sign-in');
const next = role === 'admin' ? '/admin' : '/portal';
fs.writeFileSync(destination, `http://127.0.0.1:3000/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(next)}`, { encoding: 'utf8', mode: 0o600 });
