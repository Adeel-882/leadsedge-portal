import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/202608270001_single_lead_workflow.sql', import.meta.url), 'utf8');

describe('single lead workflow migration', () => {
  it('is additive and does not reset the database', () => {
    expect(migration).not.toMatch(/drop\s+schema|truncate\s+table|supabase\s+db\s+reset/i);
    expect(migration).toContain('merged_into_task_id');
    expect(migration).toContain('archived_at');
  });

  it('preserves a single assignment task with embedded feedback', () => {
    expect(migration).toContain("feedback_state in ('not_configured', 'pending', 'waiting', 'requested', 'submitted')");
    expect(migration).toContain("delete from public.template_tasks");
    expect(migration).toContain("'Lead Assignment'");
    expect(migration).toContain('"label":"Lead Connection"');
  });

  it('protects destructive project and client deletion behind the service role', () => {
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain('Administrator accounts cannot be deleted');
    expect(migration).toContain('Client belongs to another project');
  });
});
