import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/202609020001_admin_people_crm.sql', import.meta.url), 'utf8');
const correction = readFileSync(new URL('../supabase/migrations/202609020002_fix_admin_people_uuid_aggregate.sql', import.meta.url), 'utf8');
const queries = readFileSync(new URL('../lib/people.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/admin/people/[clientId]/page.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../app/api/admin/people/[clientId]/route.ts', import.meta.url), 'utf8');
const emails = readFileSync(new URL('../components/admin/email-history.tsx', import.meta.url), 'utf8');

describe('admin People CRM', () => {
  it('keeps the People RPC admin-only with an explicit search path', () => {
    expect(migration).toContain("auth.uid() is null or not public.is_admin()");
    expect(migration).toContain('set search_path = public, auth');
    expect(migration).toMatch(/revoke all on function public\.get_admin_people[\s\S]*from public, anon/);
    expect(correction).toContain('min(project.id::text)::uuid as first_project_id');
  });

  it('scopes every person dataset by real client foreign keys', () => {
    expect(queries).toContain(".eq('client_id', clientId)");
    expect(queries).toContain(".eq('assignee_id', clientId)");
    expect(queries).not.toContain(".eq('email',");
  });

  it('loads only the active profile tab', () => {
    expect(page).toContain("tab === 'overview' ? await getPersonOverview(clientId)");
    expect(page).toContain("tab === 'emails' ? await getPersonEmails(clientId, page, filter)");
  });

  it('returns 401 for anonymous and 403 for non-admin profile mutations', () => {
    expect(api).toContain("status: 401");
    expect(api).toContain("viewer.role !== 'admin'");
    expect(api).toContain("status: 403");
  });

  it('does not expose historical tokenized links in email previews', () => {
    expect(emails).toContain('never reconstructed or exposed');
    expect(emails).not.toContain('token_hash');
    expect(emails).not.toContain('access_token');
    expect(emails).not.toContain('refresh_token');
  });
});
