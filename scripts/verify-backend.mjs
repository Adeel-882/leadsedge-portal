import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) continue;
  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(filePath, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const demoMode = process.env.LEADSEDGE_DEMO_MODE?.trim().toLowerCase() === 'true';
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((name) => !process.env[name]?.trim());

console.log(`Demo mode: ${demoMode ? 'enabled' : 'disabled'}`);
if (missing.length > 0) {
  console.error(`Supabase configuration: incomplete (${missing.join(', ')})`);
  process.exit(1);
}

let projectUrl;
try {
  projectUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
} catch {
  console.error('Supabase configuration: invalid project URL');
  process.exit(1);
}

const supabase = createClient(projectUrl.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const [{ count: adminCount, error: usersError }, { data: projects, error: projectsError }] = await Promise.all([
  supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
  supabase.from('projects').select('id'),
]);
if (usersError || projectsError) {
  console.error(`Supabase connection: failed (${usersError?.code || projectsError?.code || 'query_error'})`);
  process.exit(1);
}

const bundledDemoIds = new Set([
  '00000000-0000-4000-8000-000000000100',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102',
]);
const bundledDemoRecordCount = (projects || []).filter((project) => bundledDemoIds.has(project.id)).length;
const emailConfigured = Boolean(
  process.env.RESEND_API_KEY?.trim()
  && process.env.RESEND_FROM_EMAIL?.trim()
  && process.env.RESEND_API_KEY.trim() !== 're_your_key'
  && !process.env.RESEND_FROM_EMAIL.includes('your-domain.com'),
);

console.log('Supabase configuration: complete');
console.log('Supabase connection: successful');
console.log(`Administrator setup: ${(adminCount || 0) > 0 ? 'complete' : 'required'}`);
console.log(`Supabase projects: ${(projects || []).length}`);
console.log(`Bundled demo records in Supabase: ${bundledDemoRecordCount === 0 ? 'none' : 'found'}`);
console.log(`Email delivery: ${emailConfigured ? 'configured' : 'not configured'}`);
