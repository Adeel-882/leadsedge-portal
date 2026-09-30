import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')]; }));
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: candidates, error } = await service.from('clients')
  .select('id,auth_user_id,full_name,email,company,status,project_clients(project_id,is_primary)')
  .not('auth_user_id', 'is', null)
  .order('created_at');
if (error) throw error;

const output = [];
for (const client of candidates || []) {
  const projectIds = (client.project_clients || []).map((item) => item.project_id);
  const [{ count: tasks }, { data: taskRows }, { data: projectTaskRows }, { count: projectMessages }, { count: meetings }] = await Promise.all([
    service.from('project_tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', client.id).is('archived_at', null),
    service.from('project_tasks').select('id,project_id').eq('assignee_id', client.id).is('archived_at', null).limit(3),
    projectIds.length ? service.from('project_tasks').select('id,project_id').in('project_id', projectIds).is('archived_at', null).limit(3) : Promise.resolve({ data: [] }),
    projectIds.length ? service.from('project_messages').select('id', { count: 'exact', head: true }).in('project_id', projectIds) : Promise.resolve({ count: 0 }),
    service.from('meetings').select('id', { count: 'exact', head: true }).eq('client_id', client.id),
  ]);
  output.push({
    id: client.id,
    authUserId: client.auth_user_id,
    name: client.full_name,
    emailDomain: client.email.split('@')[1] || '',
    company: client.company,
    status: client.status,
    projects: projectIds,
    tasks: tasks || 0,
    taskSamples: taskRows || [],
    projectTaskSamples: projectTaskRows || [],
    projectMessages: projectMessages || 0,
    meetings: meetings || 0,
  });
}
console.log(JSON.stringify(output, null, 2));
