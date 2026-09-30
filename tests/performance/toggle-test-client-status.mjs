import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const fixtureId = '1da8e5db-fd4e-418e-b8c2-546a607d956b';
const action = process.argv[2];
if (!['status', 'disable', 'restore'].includes(action)) throw new Error('Expected status, disable, or restore.');

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')]; }));
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: before, error: readError } = await service.from('clients').select('id,status,full_name').eq('id', fixtureId).single();
if (readError || before.full_name !== 'test 3') throw readError || new Error('Fixture identity mismatch.');
if (action !== 'status') {
  const expected = action === 'disable' ? 'active' : 'disabled';
  const next = action === 'disable' ? 'disabled' : 'active';
  if (before.status !== expected) throw new Error(`Refusing transition from unexpected status ${before.status}.`);
  const { error } = await service.from('clients').update({ status: next }).eq('id', fixtureId).eq('status', expected);
  if (error) throw error;
}
const { data: after, error: verifyError } = await service.from('clients').select('status').eq('id', fixtureId).single();
if (verifyError) throw verifyError;
console.log(JSON.stringify({ fixture: 'test 3', before: before.status, after: after.status }));
