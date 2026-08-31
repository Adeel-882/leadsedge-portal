import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/202608270002_message_read_receipts.sql', import.meta.url), 'utf8');

describe('recipient-specific message read receipts', () => {
  it('is additive and preserves existing messages and notifications', () => {
    expect(migration).not.toMatch(/drop\s+schema|truncate\s+table|delete\s+from\s+public\.(task_messages|project_messages|notifications)/i);
    expect(migration).toContain('create table if not exists public.message_read_receipts');
  });

  it('never creates a receipt for the sender', () => {
    expect(migration).toMatch(/recipient_id\s*<>\s*new\.sender_id/i);
    expect(migration).toMatch(/recipient\.recipient_id\s*<>\s*pm\.sender_id/i);
  });

  it('derives read ownership from auth uid and marks only one conversation', () => {
    expect(migration).toContain('current_user_id uuid := auth.uid()');
    expect(migration).toContain("target_kind = 'task'");
    expect(migration).toContain("target_kind = 'project'");
    expect(migration).toContain('recipient_id = current_user_id');
  });
});
