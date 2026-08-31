import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { feedbackSubmissionErrorMessage } from '@/lib/feedback';

const migration = readFileSync(new URL('../supabase/migrations/202608280001_message_classification_and_feedback_submission.sql', import.meta.url), 'utf8');
const messageRoute = readFileSync(new URL('../app/api/messages/[kind]/[resourceId]/route.ts', import.meta.url), 'utf8');
const queries = readFileSync(new URL('../lib/queries.ts', import.meta.url), 'utf8');
const conversation = readFileSync(new URL('../components/conversation.tsx', import.meta.url), 'utf8');
const adminInbox = readFileSync(new URL('../components/admin/messages-client.tsx', import.meta.url), 'utf8');

describe('conversation classification', () => {
  it('stores browser-authored messages explicitly as user messages', () => {
    expect(messageRoute).toContain("message_type: 'user'");
  });

  it('renders only user messages without matching message body text', () => {
    expect(queries).toContain(".eq('message_type', 'user')");
    expect(queries).not.toMatch(/verification|mark-all|read-state/i);
  });

  it('keeps system rows out of unread receipts and message notifications', () => {
    expect(migration).toContain("if new.message_type <> 'user' then return new; end if;");
    expect(migration).toContain("pm.message_type = 'user'");
    expect(migration).toContain("tm.message_type = 'user'");
    expect(conversation).toContain("payload.new.message_type === 'user'");
    expect(adminInbox).toContain("payload.new.message_type === 'user'");
  });
});

describe('feedback submission eligibility', () => {
  it('uses requested state, ownership and project membership instead of task status', () => {
    const functionBody = migration.split('create or replace function public.submit_lead_feedback')[1];
    expect(functionBody).toContain("task_row.feedback_state <> 'requested'");
    expect(functionBody).toContain('task_row.assignee_id <> current_client');
    expect(functionBody).toContain('from public.project_clients');
    expect(functionBody).not.toContain("task_row.status <> 'completed'");
  });

  it('returns a useful duplicate-submission error without exposing arbitrary database errors', () => {
    expect(feedbackSubmissionErrorMessage('Feedback has already been submitted')).toBe('Feedback has already been submitted.');
    expect(feedbackSubmissionErrorMessage('private database detail')).toBe('This form is no longer available.');
  });
});
