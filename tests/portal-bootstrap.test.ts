import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bootstrapInternals } from '@/lib/bootstrap';

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202609030001_portal_bootstrap_prototype.sql'), 'utf8').toLowerCase();
const hardenedIsolation = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608290001_harden_client_project_isolation.sql'), 'utf8').toLowerCase();
const authSource = fs.readFileSync(path.join(process.cwd(), 'lib/auth.ts'), 'utf8');
const adminLayout = fs.readFileSync(path.join(process.cwd(), 'app/admin/layout.tsx'), 'utf8');
const portalLayout = fs.readFileSync(path.join(process.cwd(), 'app/portal/layout.tsx'), 'utf8');

describe('portal bootstrap security gate', () => {
  it('has no caller-controlled identity and remains invoker/RLS scoped', () => {
    expect(migration).toContain('security invoker');
    expect(migration).toContain('auth.uid()');
    expect(migration).not.toMatch(/\([^)]*user_id[^)]*\)\s*returns/);
    expect(migration).toContain('set search_path = public');
    expect(migration).toContain("clients.status <> 'disabled'");
  });

  it('denies public and anonymous execution', () => {
    expect(migration).toContain('revoke all on function public.get_portal_bootstrap() from public, anon');
    expect(migration).toContain('grant execute on function public.get_portal_bootstrap() to authenticated');
  });

  it('contains no data mutation, destructive DDL, policy, or auth changes', () => {
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate|drop|alter\s+table|create\s+policy|drop\s+policy)\b/);
  });

  it('accepts only a bounded authorized payload', () => {
    expect(bootstrapInternals.parseBootstrap({
      viewer: { id: 'viewer-id', role: 'client', displayName: 'Client' },
      authorization: { disabled: false },
      shell: { primaryProjectId: null, projectName: null },
      unread: { messages: 2, notifications: 1 },
    })?.unread).toEqual({ messages: 2, notifications: 1 });
    expect(bootstrapInternals.parseBootstrap({
      viewer: { id: 'viewer-id', role: 'client', displayName: 'Client' },
      authorization: { disabled: true },
      shell: { primaryProjectId: null, projectName: null },
      unread: { messages: 0, notifications: 0 },
    })).toBeNull();
    expect(bootstrapInternals.parseBootstrap({ viewer: { id: 'viewer-id', role: 'owner', displayName: 'Owner' } })).toBeNull();
  });

  it('retains the task-access membership and disabled-client gates used by RLS', () => {
    expect(hardenedIsolation).toContain('create or replace function public.can_access_task');
    expect(hardenedIsolation).toContain('membership.project_id = task.project_id');
    expect(hardenedIsolation).toContain("client.status <> 'disabled'");
    expect(hardenedIsolation).toContain('client.id = task.assignee_id');
  });

  it('uses one bootstrap for shell identity and unread state', () => {
    expect(authSource).toContain("supabase.auth.getClaims()");
    expect(authSource).toContain('return getPortalBootstrap()');
    expect(adminLayout).toContain("requireBootstrapRole('admin')");
    expect(portalLayout).toContain("requireBootstrapRole('client')");
    expect(adminLayout).not.toContain('getUnreadCounts');
    expect(portalLayout).not.toContain('getUnreadCounts');
  });
});
