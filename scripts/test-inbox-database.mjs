// LOCAL ONLY: never reads credentials or .env; creates a disposable database.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
const bin=path.resolve('work/tools/postgresql-17.11/pgsql/bin/psql.exe');
const database='leadsedge_inbox_test_'+Date.now();
const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'55432',PGUSER:'postgres',PGDATABASE:database,PGPASSWORD:'',PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'3'};
function run(sql,db=database){const r=spawnSync(bin,['-X','-w','-A','-t','-v','ON_ERROR_STOP=1'],{env:{...env,PGDATABASE:db},input:sql,encoding:'utf8',timeout:30000});if(r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout.trim();}
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=id(1),B=id(2),C=id(3),P=id(10),T=id(20),CL=id(30);
const session=user=>`set role authenticated; set request.jwt.claim.sub='${user}';`;
const hide=(u,projects=[P],tasks=[],h=true)=>session(u)+`select public.set_own_inbox_visibility(array[${projects.map(x=>`'${x}'`).join(',')}]::uuid[],array[${tasks.map(x=>`'${x}'`).join(',')}]::uuid[],${h});`;
const assert=(condition,label)=>{if(!condition)throw Error(label);console.log('PASS: '+label);};
const count=(u,sql)=>Number(run(session(u)+sql).split('\n').at(-1));
const visible=u=>count(u,'select count(*) from public.message_inbox_visibility where hidden;');
const send=(kind='project',type='user')=>`insert into public.${kind}_messages(${kind}_id,thread_id,sender_id,body,message_type) values('${kind==='project'?P:T}','${kind==='project'?id(11):id(21)}','${C}','Synthetic message','${type}');`;
function concurrent(sql){return new Promise((resolve,reject)=>{const c=spawn(bin,['-X','-w','-v','ON_ERROR_STOP=1'],{env,stdio:['pipe','ignore','pipe']});let err='';c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('exit',n=>n===0?resolve():reject(Error(err)));c.stdin.end(sql);});}
run(`create database ${database};`,'postgres');
try{
run(`create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'); grant usage on schema auth,public to authenticated,anon; create publication supabase_realtime;`);
for(const file of ['202608260001_phase1.sql','202608270001_single_lead_workflow.sql','202608270002_message_read_receipts.sql','202608270003_phase2_automation_and_meetings.sql','202608280001_message_classification_and_feedback_submission.sql','202608290001_harden_client_project_isolation.sql','202609010001_unread_counts_rpc.sql']){
 let sql=fs.readFileSync('supabase/migrations/'+file,'utf8');
 // Local Windows PostgreSQL has no pg_cron. Omit ONLY the unrelated scheduler registration in the historical setup migration.
 if(file==='202608270001_single_lead_workflow.sql')sql=sql.replace(/create extension if not exists pg_cron;[\s\S]*?end \$\$;/,'');
 run(sql);
}
run(`grant select,insert,update,delete on all tables in schema public to authenticated;
insert into auth.users(id,email) values('${A}','a@example.test'),('${B}','b@example.test'),('${C}','c@example.test'); update public.users set role='admin' where id in ('${A}','${B}');
insert into public.clients(id,auth_user_id,full_name,email,status) values('${CL}','${C}','Test Client','c@example.test','active');
insert into public.projects(id,owner_id,project_name) values('${P}','${A}','Test project'); insert into public.project_clients values('${P}','${CL}',true,now());
insert into public.project_tasks(id,project_id,assignee_id,title,status) values('${T}','${P}','${CL}','Test task','active');
insert into public.project_threads(id,project_id) values('${id(11)}','${P}') on conflict(project_id) do update set id=excluded.id;
insert into public.task_threads(id,task_id) values('${id(21)}','${T}') on conflict(task_id) do update set id=excluded.id;`);
run(fs.readFileSync('supabase/migrations/202611110001_message_inbox_visibility.sql','utf8'));
run(send()+send('task'));
const receipts=run('select count(*) from public.message_read_receipts;');const notifications=count(A,'select count(*) from public.notifications where read_at is null;');
run(hide(A,[P],[T]));assert(visible(A)===2,'single and bulk persistence on independent connection');assert(visible(B)===0&&visible(C)===0,'other administrator/client visibility isolation');
assert(count(A,'select public.get_unread_message_count();')===0,'hidden communication excluded from own badge');assert(count(A,'select count(*) from public.notifications where read_at is null;')===notifications,'notification unread unchanged');assert(run('select count(*) from public.message_read_receipts;')===receipts,'receipts preserved');
for(const sql of [hide(C),`set role anon; select public.set_own_inbox_visibility(array['${P}']::uuid[],'{}',true);`,session(A)+`update public.message_inbox_visibility set user_id='${B}';`]){let denied=false;try{run(sql);}catch{denied=true;}assert(denied,'unauthorized write rejected');}
run(hide(A,[P],[T],false));let invalid=false;try{run(hide(A,[P,id(99)]));}catch{invalid=true;}assert(invalid&&visible(A)===0,'invalid bulk request rolls back atomically');
run(hide(A));run(send('project','system'));assert(visible(A)===1,'system messages do not reopen');run(send());assert(visible(A)===0,'incoming user message reopens');assert(count(A,'select public.get_unread_message_count();')===3,'older unread messages count again after reopening');
async function ordered(first, second) {
  let ready; const locked = new Promise(resolve => { ready = resolve; });
  const finished = new Promise((resolve,reject) => {
    const child = spawn(bin, ['-X','-w','-A','-t','-v','ON_ERROR_STOP=1'], { env, stdio:['pipe','pipe','pipe'] });
    let errors=''; child.stdout.on('data', b => { if (b.toString().includes('LOCK_READY')) ready(); });
    child.stderr.on('data', b => errors += b); child.on('error',reject);
    child.on('exit', code => { if(code) reject(Error(errors)); else resolve(); });
    child.stdin.end('begin;'+first+"select 'LOCK_READY';select pg_sleep(2);commit;");
  });
  await Promise.race([locked, finished.then(()=>{throw Error('Lock barrier not reached');})]);
  await Promise.all([finished,concurrent(second)]);
}
await ordered(hide(A),send()); assert(visible(A)===0,'concurrent hide then incoming message reopens');
await ordered(send(),hide(A)); assert(visible(A)===1,'concurrent incoming then hide persists');
assert(count(B,'select count(*) from public.project_messages;')===5&&count(C,'select count(*) from public.project_messages;')===5,'all shared project messages remain accessible');assert(count(C,'select count(*) from public.task_messages;')===1,'task history and client access preserved');assert(run('select count(*) from public.projects;').endsWith('1')&&run('select count(*) from public.project_tasks;').endsWith('1'),'project/task records unchanged');
console.log('INBOX DATABASE TESTS PASSED');
}finally{run(`drop database ${database} with(force);`,'postgres');}
