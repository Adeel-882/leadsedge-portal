// Explicit live staging regression; not part of npm test. Creates and cleans up
// isolated projects/messages; never prints tokens or invokes an email sender.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (ref !== process.env.FRANKFURT_PROJECT_REF || process.env.LEADSEDGE_STAGING_REGION !== 'eu-central-1' || process.env.LEADSEDGE_PERFORMANCE_STAGING !== 'true') throw Error('Frankfurt staging required');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const fixtures = [];
const sessions = [];
const events = [[], []];
const check = (result) => { if (result.error) throw Error(`Backend failure: ${result.error.code || 'unknown'}`); return result.data; };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let result;
try {
  for (const suffix of ['007', '008']) {
    const client = check(await service.from('clients').select('id,auth_user_id,email,status').eq('id', `71000000-0000-4000-8000-000000000${suffix}`).single());
    if (client.status !== 'active') throw Error('Synthetic client must be active');
    const membership = check(await service.from('project_clients').select('project:projects(owner_id)').eq('client_id', client.id).limit(1).single());
    const fixture = { project: randomUUID(), task: randomUUID(), owner: membership.project.owner_id, user: client.auth_user_id };
    fixtures.push(fixture);
    fs.writeFileSync('work/security-realtime-fixtures.json', JSON.stringify(fixtures));
    check(await service.from('projects').insert({ id: fixture.project, project_name: 'Disposable security Realtime regression', owner_id: fixture.owner }));
    check(await service.from('project_clients').insert({ project_id: fixture.project, client_id: client.id, is_primary: true }));
    check(await service.from('project_tasks').insert({ id: fixture.task, project_id: fixture.project, assignee_id: client.id, title: 'Disposable security task', status: 'active', client_visible: true }));
    fixture.projectThread = check(await service.from('project_threads').upsert({ project_id: fixture.project }, { onConflict: 'project_id' }).select('id').single()).id;
    fixture.taskThread = check(await service.from('task_threads').upsert({ task_id: fixture.task }, { onConflict: 'task_id' }).select('id').single()).id;
    const generated = check(await service.auth.admin.generateLink({ type: 'magiclink', email: client.email }));
    const session = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
    sessions.push(session);
    const verified = check(await session.auth.verifyOtp({ token_hash: generated.properties.hashed_token, type: generated.properties.verification_type }));
    await session.realtime.setAuth(verified.session.access_token);
  }
  for (let i = 0; i < sessions.length; i++) {
    let channel = sessions[i].channel(`security-isolation-${randomUUID()}`);
    // Deliberately NO row/recipient/project filter: RLS must enforce isolation.
    for (const table of ['project_tasks', 'project_messages', 'task_messages', 'message_read_receipts']) {
      channel = channel.on('postgres_changes', { schema: 'public', table, event: table === 'project_tasks' ? 'UPDATE' : 'INSERT' }, (payload) => {
        events[i].push({ table, row: payload.new });
      });
    }
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Realtime subscribe timeout')), 20000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { clearTimeout(timeout); reject(Error(`Realtime ${status}`)); }
      });
    });
  }
  for (const fixture of fixtures) {
    check(await service.from('project_tasks').update({ title: 'Disposable security task updated' }).eq('id', fixture.task));
    check(await service.from('project_messages').insert({ project_id: fixture.project, thread_id: fixture.projectThread, sender_id: fixture.owner, body: 'Disposable security isolation event' }));
    check(await service.from('task_messages').insert({ task_id: fixture.task, thread_id: fixture.taskThread, sender_id: fixture.owner, body: 'Disposable security isolation event' }));
    await delay(8000);
  }
  result = fixtures.map((own, i) => {
    const other = fixtures[1 - i];
    const counts = Object.fromEntries(['project_tasks', 'project_messages', 'task_messages', 'message_read_receipts'].map((table) => [table, events[i].filter((event) => event.table === table && (event.row.id === own.task || event.row.project_id === own.project || event.row.task_id === own.task || event.row.recipient_id === own.user)).length]));
    const foreign = events[i].filter(({ row }) => row.id === other.task || row.project_id === other.project || row.task_id === other.task || row.recipient_id === other.user).length;
    if (foreign) throw Error('Foreign Realtime event delivered; STOP and investigate');
    if (Object.values(counts).some((count) => count === 0)) throw Error('Own-event positive control failed');
    return { client: i === 0 ? 'A' : 'B', ownEvents: counts, foreignEvents: foreign };
  });
} finally {
  for (const session of sessions) { await session.removeAllChannels(); await session.auth.signOut({ scope: 'local' }); session.realtime.disconnect(); }
  for (const fixture of fixtures) {
    check(await service.from('notifications').delete().eq('project_id', fixture.project));
    check(await service.from('projects').delete().eq('id', fixture.project));
  }
}
const summary = { subscriptions: 'real Supabase WebSocket; no row filters', results: result, cleanup: 'temporary projects and dependent rows deleted; local test sessions signed out' };
fs.writeFileSync('work/security-realtime-result.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
