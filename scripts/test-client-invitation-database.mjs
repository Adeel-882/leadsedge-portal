// Synthetic LOCAL PostgreSQL only. Never loads environment files or production data.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const bin = path.resolve('work/tools/postgresql-17.11/pgsql/bin/psql.exe');
const database = 'leadsedge_invitation_test_' + Date.now();
const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55432', PGUSER: 'postgres', PGDATABASE: database, PGPASSWORD: '', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '3' };
function run(sql, db = database) {
  const r = spawnSync(bin, ['-X', '-w', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { env: { ...env, PGDATABASE: db }, input: sql, encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || 'Local PostgreSQL unavailable');
  return r.stdout.trim().split('\n').at(-1);
}
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=id(1),U=id(2),V=id(3),C=id(4),P=id(5),C2=id(6),P2=id(7);
const service = 'set role service_role;';
const auth = u => `set role authenticated; set request.jwt.claim.sub='${u}';`;
function assert(ok,label) { if (!ok) throw new Error(label); console.log('PASS: '+label); }
function denied(sql,label) { let blocked=false; try { run(sql); } catch { blocked=true; } assert(blocked,label); }
run(`create database ${database}`, 'postgres');
try {
  run(`create schema auth; create publication supabase_realtime;
    do $$begin create role anon nologin; exception when duplicate_object then null; end$$;
    do $$begin create role authenticated nologin; exception when duplicate_object then null; end$$;
    do $$begin create role service_role nologin bypassrls; exception when duplicate_object then null; end$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  run(fs.readFileSync('supabase/migrations/202608260001_phase1.sql','utf8'));
  run(`grant all on all tables in schema public to authenticated,service_role;
    insert into auth.users(id,email) values('${A}','admin@example.test'),('${U}','client@example.test'),('${V}','other@example.test');
    update public.users set role='admin' where id='${A}';
    insert into public.clients(id,auth_user_id,full_name,email,status) values('${C}','${U}','Client','client@example.test','active'),('${C2}','${V}','Other','other@example.test','active');
    insert into public.projects(id,owner_id,project_name) values('${P}','${A}','Project'),('${P2}','${A}','Other');
    insert into public.project_clients values('${P}','${C}',true,now()),('${P2}','${C2}',true,now());
    insert into public.email_deliveries(client_id,project_id,email_type,status) values('${C}','${P}','client_invitation','sent');`);
  const snapshot = () => run("select md5(string_agg(payload,'|' order by payload)) from (select row_to_json(c)::text payload from public.clients c union all select row_to_json(p)::text from public.projects p union all select row_to_json(pc)::text from public.project_clients pc union all select row_to_json(u)::text from public.users u union all select row_to_json(d)::text from public.email_deliveries d) rows;");
  const before=snapshot();
  run(fs.readFileSync('supabase/migrations/202611190001_client_invitation_tracking.sql','utf8'));
  assert(before===snapshot(),'migration preserves all preexisting synthetic records');
  const prepare=(fp,client=C,user=U,project=P,issued="clock_timestamp()") => service+`select public.prepare_client_invitation_attempt('${client}','${project}','${user}','${fp}','invite',${issued},86400);`;
  const fp='a'.repeat(64), fp2='b'.repeat(64), fp3='c'.repeat(64);
  const first=run(prepare(fp));
  assert(run(`select extract(epoch from expires_at-issued_at)::integer from public.client_invitation_attempts where id='${first}';`)==='86400','24-hour window persisted');
  const finish=(a,accepted) => service+`select public.finish_client_invitation_delivery('${a}',${accepted},'synthetic-provider');`;
  run(finish(first,true)); run(finish(first,true));
  assert(run('select count(*) from public.email_deliveries;')==='2','delivery retries preserve history without duplicates');
  const success=(fingerprint,user=U)=>service+`select public.record_client_invitation_sign_in('${fingerprint}','${user}');`;
  assert(run(success(fp,V))==='f','another client cannot claim this invitation');
  assert(run(success('d'.repeat(64)))==='f','forged/ordinary-link fingerprint matches no invitation');
  for (const u of [A,U,V]) {
    denied(auth(u)+`select public.record_client_invitation_sign_in('${fp}','${U}');`,'direct browser success RPC denied');
    denied(auth(u)+`update public.client_invitation_attempts set signed_in_at=now();`,'direct status mutation denied');
    denied(auth(u)+`select public.prepare_client_invitation_attempt('${C}','${P}','${U}','${fp2}','invite',now(),86400);`,'direct preparation RPC denied');
  }
  denied('set role anon;select id from public.client_invitation_attempts;','anonymous status access denied');
  assert(run(auth(U)+'select count(id) from public.client_invitation_attempts;')==='0','client cannot read invitation status');
  assert(run(auth(A)+'select count(id) from public.client_invitation_attempts;')==='1','administrator can read status');
  denied(auth(A)+'select credential_fingerprint from public.client_invitation_attempts;','fingerprints not exposed to browser administrators');
  run(`update public.clients set status='disabled' where id='${C}';`);
  assert(run(success(fp))==='f','disabled client success denied');
  run(`update public.clients set status='active' where id='${C}';delete from public.project_clients where client_id='${C}';`);
  assert(run(success(fp))==='f','missing specific project authorization denied');
  run(`insert into public.project_clients values('${P}','${C}',true,now());`);
  denied(prepare(fp2,C,U,P2),'foreign project preparation denied');
  denied(prepare(fp2,C,V,P),'identity mismatch preparation denied');
  const second=run(prepare(fp2)); run(finish(second,true));
  assert(run(success(fp))==='t','older exact invitation can succeed after resend');
  assert(run(`select signed_in_at is null from public.client_invitation_attempts where id='${second}';`)==='t','older use does not mark newest invitation successful');
  const stamp=run(`select signed_in_at from public.client_invitation_attempts where id='${first}';`);
  run(success(fp));
  assert(run(`select signed_in_at from public.client_invitation_attempts where id='${first}';`)===stamp,'first server-generated success timestamp preserved');
  assert(run(success(fp2))==='t','newer invitation success remains independent');
  const failed=run(prepare(fp3)); run(finish(failed,false));
  assert(run(`select delivery_status from public.client_invitation_attempts where id='${failed}';`)==='failed','provider rejection persisted');
  assert(run('select count(*) from public.clients;')==='2'&&run('select count(*) from public.projects;')==='2','no duplicate clients or projects');
  run(fs.readFileSync('docs/client-invitation-tracking-rollback.sql','utf8'));
  assert(run('select count(*) from public.client_invitation_attempts;')==='3','rollback retains invitation audit history');
  console.log('LOCAL INVITATION DATABASE TESTS PASSED');
} finally { run(`drop database ${database} with (force)`, 'postgres'); }
