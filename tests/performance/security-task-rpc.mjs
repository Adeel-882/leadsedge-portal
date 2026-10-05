// node --env-file=.env.frankfurt.local tests/performance/security-task-rpc.mjs
// All database test mutations live inside a transaction ending in ROLLBACK.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (ref !== process.env.FRANKFURT_PROJECT_REF || process.env.LEADSEDGE_STAGING_REGION !== 'eu-central-1' || process.env.LEADSEDGE_PERFORMANCE_STAGING !== 'true') throw Error('Frankfurt staging required');
const pooler = new URL(fs.readFileSync('supabase/.temp/pooler-url', 'utf8').trim());
if (!decodeURIComponent(pooler.username).includes(ref) || pooler.hostname !== 'aws-0-eu-central-1.pooler.supabase.com') throw Error('Pooler guard');
const result = spawnSync('work/tools/postgresql-17.11/pgsql/bin/psql.exe', ['-X', '-w', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', 'tests/security/task-rpc-live.sql'], {
  encoding: 'utf8', timeout: 60000,
  env: { ...process.env, PGHOST: pooler.hostname, PGPORT: pooler.port, PGUSER: decodeURIComponent(pooler.username), PGDATABASE: 'postgres', PGPASSWORD: process.env.SUPABASE_DB_PASSWORD, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '12' },
});
if (result.status !== 0) throw Error(`Database regression failed (exit ${result.status}); transaction rolled back on disconnect.`);
const cases = result.stdout.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
assert.equal(cases.length, 25);
for (const row of cases) {
  assert.equal(row.allowed, row.kind === 'cancel_meeting' ? row.case === 'authorized' : row.case === 'valid', `${row.kind}/${row.case}`);
  if (row.case === 'valid') {
    assert.equal(row.duplicateDenied, true);
    assert.equal(row.notifications, 1);
    if (row.kind === 'completion') assert.equal(row.sevenDays, true);
    else assert.equal(row.outbox, 1);
  }
}
fs.writeFileSync('work/security-rpc-regression-result.json', JSON.stringify({ passed: cases.length, cases }, null, 2));
console.log(JSON.stringify({ passed: cases.length, allFixtureMutationsRolledBack: true }));
