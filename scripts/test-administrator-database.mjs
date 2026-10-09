// Deliberately never loads .env files. Refuses any non-loopback database target.
// Prerequisite: disposable PostgreSQL cluster with postgres owner on 127.0.0.1:55432.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
const bin = process.env.LOCAL_PG_BIN || 'work/tools/postgresql-17.11/pgsql/bin';
const psql = path.join(bin, process.platform === 'win32' ? 'psql.exe' : 'psql');
const database = 'leadsedge_admin_test_' + Date.now();
const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55432', PGUSER: 'postgres', PGDATABASE: 'postgres', PGPASSWORD: '', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '3' };
function run(args, db = database) {
  const result = spawnSync(psql, ['-X','-w','-v','ON_ERROR_STOP=1', ...args], { env: { ...env, PGDATABASE: db }, encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Local database test failed');
  return result.stdout;
}
function concurrent(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, ['-X','-w','-v','ON_ERROR_STOP=1','-c',statement], { env: { ...env, PGDATABASE: database }, stdio: ['ignore','ignore','pipe'] });
    let error=''; child.stderr.on('data',chunk=>{error+=chunk;});
    child.on('error',reject); child.on('close',code=>resolve({code,error}));
  });
}
run(['-c',`create database ${database}`], 'postgres');
try {
  run(['-f','tests/security/administrator-fixture.sql']);
  run(['-f','supabase/migrations/202610090001_simple_admin_invitations.sql']);
  const result = run(['-f','tests/security/administrator-invitations.sql']);
  if (!result.includes('DIRECT DATABASE AUTHORIZATION TESTS PASSED')) throw new Error('Assertions did not finish');
  const adminSession="set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';";
  const created=await Promise.all([concurrent(adminSession+"select public.prepare_administrator_invitation('Race Admin','race@example.test');"),concurrent(adminSession+"select public.prepare_administrator_invitation('Race Admin','race@example.test');")]);
  if(created.filter(r=>r.code===0).length!==1)throw Error('Concurrent creation must produce exactly one invitation');
  const invitation=run(['-A','-t','-c',"select id from public.administrator_invitations where email='race@example.test'"]).trim();
  run(['-c',`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('10000000-0000-4000-8000-000000000005','race@example.test',now(),jsonb_build_object('administrator_invitation','${invitation}')); set role service_role; set request.jwt.claim.role='service_role'; select public.bind_administrator_invitation('${invitation}','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001');`]);
  const accept="set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='10000000-0000-4000-8000-000000000005';select public.accept_administrator_invitation('"+invitation+"');";
  const accepted=await Promise.all([concurrent(accept),concurrent(accept)]);
  if(accepted.filter(r=>r.code===0).length!==1)throw Error('Concurrent acceptance must succeed exactly once');
  console.log('PASS: local PostgreSQL invitation lifecycle, direct role escalation, RLS, replay, expiry, revoke/resend, admin chaining, concurrent duplicate creation and concurrent acceptance.');
} finally { run(['-c',`drop database ${database} with (force)`], 'postgres'); }
