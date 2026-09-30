import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envFile = process.env.PERF_ENV_FILE || '.env.frankfurt-staging';
const env = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, '')];
    }),
);

const blockedProjectRefs = new Set([
  'llmmtdzlurunphdfrqlg', // Leadsedge Seoul
  'hwzbqmvovbnpuaddzbha', // unrelated Tokyo project
]);
const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.invalid').hostname.split('.')[0];

if (env.LEADSEDGE_PERFORMANCE_STAGING !== 'true') {
  throw new Error('Refusing to seed without LEADSEDGE_PERFORMANCE_STAGING=true.');
}
if (env.LEADSEDGE_STAGING_REGION !== 'eu-central-1') {
  throw new Error('Refusing to seed a project outside eu-central-1.');
}
if (!projectRef || projectRef === 'invalid' || blockedProjectRefs.has(projectRef)) {
  throw new Error('Refusing to seed a production or unrelated Supabase project.');
}
if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing staging service-role key.');

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ids = {
  clients: Array.from({ length: 8 }, (_, index) => `71000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
  projects: Array.from({ length: 10 }, (_, index) => `72000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
  tasks: Array.from({ length: 20 }, (_, index) => `73000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
};

const identities = [
  { key: 'admin', email: 'admin.frankfurt@performance.example.com', fullName: 'Frankfurt Performance Admin', role: 'admin' },
  ...Array.from({ length: 8 }, (_, index) => ({
    key: `client${index + 1}`,
    email: `client-${index + 1}.frankfurt@performance.example.com`,
    fullName: `Frankfurt Test Client ${index + 1}`,
    role: 'client',
  })),
];

async function must(label, promise) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function authUsersByEmail() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const data = await must('list staging Auth users', service.auth.admin.listUsers({ page, perPage: 1000 }));
    users.push(...data.users);
    if (data.users.length < 1000) return new Map(users.map((user) => [user.email, user]));
  }
}

const existingAuthUsers = await authUsersByEmail();
const authUsers = {};
for (const identity of identities) {
  let user = existingAuthUsers.get(identity.email);
  if (!user) {
    user = await must(
      `create ${identity.key} Auth user`,
      service.auth.admin.createUser({
        email: identity.email,
        email_confirm: true,
        user_metadata: { full_name: identity.fullName, fixture: 'frankfurt-performance-v1' },
      }),
    ).then((data) => data.user);
  }
  authUsers[identity.key] = user;
}

await must('upsert public users', service.from('users').upsert(
  identities.map((identity) => ({
    id: authUsers[identity.key].id,
    email: identity.email,
    full_name: identity.fullName,
    role: identity.role,
  })),
  { onConflict: 'id' },
));

await must('upsert admin settings', service.from('admin_settings').upsert({
  id: '70000000-0000-4000-8000-000000000001',
  user_id: authUsers.admin.id,
  display_name: 'Frankfurt Performance Admin',
  notification_preferences: { task_messages: true, project_messages: true, task_completed: true },
  timezone: 'Europe/Berlin',
}, { onConflict: 'user_id' }));

await must('upsert admin availability', service.from('availability_settings').upsert({
  user_id: authUsers.admin.id,
  timezone: 'Europe/Berlin',
  meeting_duration_minutes: 30,
  buffer_minutes: 15,
  minimum_notice_minutes: 120,
  maximum_advance_days: 60,
}, { onConflict: 'user_id' }));

await must('upsert availability rules', service.from('availability_rules').upsert(
  [1, 2, 3, 4, 5].map((weekday) => ({
    id: `70000000-0000-4000-8100-${String(weekday).padStart(12, '0')}`,
    user_id: authUsers.admin.id,
    weekday,
    enabled: true,
    start_time: '09:00:00',
    end_time: '17:00:00',
  })),
  { onConflict: 'user_id,weekday' },
));

const clients = identities.slice(1).map((identity, index) => ({
  id: ids.clients[index],
  auth_user_id: authUsers[identity.key].id,
  full_name: identity.fullName,
  email: identity.email,
  company: `Synthetic Company ${index + 1}`,
  title: index === 0 ? 'Primary Performance Client' : 'Synthetic Client',
  phone: `+1 555 010 ${String(index + 1).padStart(2, '0')}`,
  status: index === 2 ? 'disabled' : 'active',
}));
await must('upsert clients', service.from('clients').upsert(clients, { onConflict: 'id' }));

const projects = ids.projects.map((id, index) => ({
  id,
  project_name: index < 3 ? `Primary Client Project ${index + 1}` : `Synthetic Control Project ${index + 1}`,
  owner_id: authUsers.admin.id,
  status: index === 8 ? 'completed' : index === 9 ? 'archived' : 'active',
  created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
}));
await must('upsert projects', service.from('projects').upsert(projects, { onConflict: 'id' }));

// Exactly one primary membership per client. Marking every row primary made the
// portal's "current project" ambiguous: get_portal_bootstrap() picks the first
// primary membership, so three of them left the shell and the Messages page
// disagreeing about which project the client was looking at.
const memberships = projects.map((project, index) => ({
  project_id: project.id,
  client_id: index < 3 ? ids.clients[0] : ids.clients[1 + ((index - 3) % 7)],
  is_primary: index < 3 ? index === 0 : true,
}));
await must('upsert memberships', service.from('project_clients').upsert(memberships, { onConflict: 'project_id,client_id' }));

const tasks = ids.tasks.map((id, index) => {
  const primary = index < 15;
  const projectIndex = primary ? index % 3 : 3 + ((index - 15) % 7);
  const clientIndex = primary ? 0 : 1 + ((projectIndex - 3) % 7);
  const status = index % 6 === 5 ? 'completed' : index === 18 ? 'draft' : 'active';
  return {
    id,
    project_id: ids.projects[projectIndex],
    title: primary ? `Lead Assignment Synthetic ${String(index + 1).padStart(2, '0')}` : `Isolation Control Task ${index + 1}`,
    description: 'Synthetic benchmark task. Contains no customer data.',
    assignee_id: ids.clients[clientIndex],
    task_type: index % 5 === 4 ? 'form' : 'standard',
    status,
    client_visible: index !== 19,
    requires_completion: true,
    form_schema: index % 5 === 4 ? { fields: [{ id: 'result', type: 'text', label: 'Synthetic result', required: true }] } : null,
    activated_at: status === 'draft' ? null : new Date(Date.UTC(2026, 1, index + 1)).toISOString(),
    completed_at: status === 'completed' ? new Date(Date.UTC(2026, 2, index + 1)).toISOString() : null,
    due_at: new Date(Date.UTC(2030, 0, index + 1)).toISOString(),
  };
});
await must('upsert tasks', service.from('project_tasks').upsert(tasks, { onConflict: 'id' }));

const projectThreads = projects.map((project, index) => ({
  id: `74000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  project_id: project.id,
}));
const taskThreads = tasks.map((task, index) => ({
  id: `75000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  task_id: task.id,
}));
await must('upsert project threads', service.from('project_threads').upsert(projectThreads, { onConflict: 'project_id' }));
await must('upsert task threads', service.from('task_threads').upsert(taskThreads, { onConflict: 'task_id' }));

const taskMessages = Array.from({ length: 120 }, (_, index) => ({
  id: `76000000-0000-4000-${(0x8000 + Math.floor(index / 10000)).toString(16)}-${String(index + 1).padStart(12, '0')}`,
  task_id: tasks[0].id,
  thread_id: taskThreads[0].id,
  sender_id: index % 2 === 0 ? authUsers.admin.id : authUsers.client1.id,
  body: `Synthetic task message ${String(index + 1).padStart(3, '0')} for cursor-pagination performance testing.`,
  message_type: 'user',
  created_at: new Date(Date.UTC(2026, 3, 1, 0, index)).toISOString(),
}));
for (let offset = 0; offset < taskMessages.length; offset += 25) {
  await must(`upsert task messages ${offset + 1}-${Math.min(offset + 25, taskMessages.length)}`, service.from('task_messages').upsert(taskMessages.slice(offset, offset + 25), { onConflict: 'id' }));
}

const projectMessages = Array.from({ length: 40 }, (_, index) => ({
  id: `77000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  project_id: projects[0].id,
  thread_id: projectThreads[0].id,
  sender_id: index % 2 === 0 ? authUsers.admin.id : authUsers.client1.id,
  body: `Synthetic project message ${String(index + 1).padStart(3, '0')}.`,
  message_type: 'user',
  created_at: new Date(Date.UTC(2026, 4, 1, 0, index)).toISOString(),
}));
for (let offset = 0; offset < projectMessages.length; offset += 20) {
  await must(`upsert project messages ${offset + 1}-${Math.min(offset + 20, projectMessages.length)}`, service.from('project_messages').upsert(projectMessages.slice(offset, offset + 20), { onConflict: 'id' }));
}

await must('upsert notifications', service.from('notifications').upsert(
  Array.from({ length: 16 }, (_, index) => ({
    id: `78000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    user_id: index % 2 === 0 ? authUsers.client1.id : authUsers.admin.id,
    project_id: projects[index % 3].id,
    task_id: tasks[index % 15].id,
    type: 'fixture.notice',
    title: `Synthetic notification ${index + 1}`,
    body: 'Synthetic benchmark notification.',
    target_url: index % 2 === 0 ? `/portal/tasks/${tasks[index % 15].id}` : `/admin/projects/${projects[index % 3].id}`,
    read_at: index % 4 === 0 ? new Date(Date.UTC(2026, 5, index + 1)).toISOString() : null,
    created_at: new Date(Date.UTC(2026, 5, index + 1)).toISOString(),
  })),
  { onConflict: 'id' },
));

const meetings = Array.from({ length: 9 }, (_, index) => {
  const projectIndex = index < 3 ? index : 3 + ((index - 3) % 6);
  const clientIndex = index < 3 ? 0 : 1 + ((projectIndex - 3) % 7);
  const start = new Date(Date.UTC(2030, 6, index + 1, 13));
  return {
    id: `79000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    project_id: projects[projectIndex].id,
    client_id: clients[clientIndex].id,
    owner_id: authUsers.admin.id,
    owner_display_name: 'Frankfurt Performance Admin',
    title: `Synthetic staging meeting ${index + 1}`,
    description: 'No external calendar event is associated with this fixture.',
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
    timezone: 'Europe/Berlin',
    duration_minutes: 30,
    status: index === 8 ? 'cancelled' : 'scheduled',
    google_event_id: null,
    google_event_html_link: null,
    created_by: authUsers.admin.id,
  };
});
await must('upsert meetings', service.from('meetings').upsert(meetings, { onConflict: 'id' }));

await must('upsert project activity', service.from('project_activity').upsert(
  Array.from({ length: 20 }, (_, index) => ({
    id: `7a000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    project_id: projects[index % projects.length].id,
    actor_id: authUsers.admin.id,
    event_type: 'fixture.activity',
    body: `Synthetic project activity ${index + 1}`,
    created_at: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
  })),
  { onConflict: 'id' },
));

const counts = {};
for (const table of ['users', 'clients', 'projects', 'project_clients', 'project_tasks', 'task_messages', 'project_messages', 'notifications', 'meetings', 'project_activity']) {
  const { count, error } = await service.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  counts[table] = count;
}

console.log(JSON.stringify({
  fixture: 'frankfurt-performance-v1',
  projectRef,
  region: env.LEADSEDGE_STAGING_REGION,
  identities: identities.map(({ key, email, role }) => ({ key, email, role })),
  primaryClientId: ids.clients[0],
  disabledClientId: ids.clients[2],
  primaryProjectIds: ids.projects.slice(0, 3),
  primaryTaskId: ids.tasks[0],
  crossClientProjectId: ids.projects[3],
  crossClientTaskId: ids.tasks[15],
  counts,
}, null, 2));
