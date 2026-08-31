import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/202608270003_phase2_automation_and_meetings.sql', import.meta.url), 'utf8');

describe('Phase 2 migration', () => {
  it('is additive and never resets or reseeds existing data', () => {
    expect(migration).not.toMatch(/drop\s+schema|truncate\s+table|supabase\s+db\s+reset|delete\s+from\s+public\.(projects|clients|users)/i);
    expect(migration).toContain('create table if not exists public.meetings');
    expect(migration).toContain('create table if not exists public.email_outbox');
  });

  it('keeps feedback on the existing task with durable idempotency and cancellation', () => {
    expect(migration).toContain("'cancelled'" );
    expect(migration).toContain('dedupe_key text not null unique');
    expect(migration).toContain('cancel_feedback_request');
    expect(migration).toContain('process_due_feedback_requests_job');
    expect(migration).not.toContain("'Lead Feedback'");
  });

  it('books under an owner lock and derives client ownership from auth', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('auth_user_id = auth.uid()');
    expect(migration).toContain('public.project_clients');
    expect(migration).toContain('This time was just booked');
  });

  it('protects calendar credentials from client policies', () => {
    expect(migration).toContain('admins manage own calendar connection');
    expect(migration).not.toMatch(/clients? .*calendar_connections/i);
  });
});
