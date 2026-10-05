import { describe, expect, it } from 'vitest';
import { formSubmissionSchema } from '@/lib/validation';
import { answersMatchFeedbackForm } from '@/lib/feedback';
import { MAX_FEEDBACK_BODY_BYTES, readLimitedJson } from '@/lib/request-body';
import type { FormField } from '@/lib/types';

const fields: FormField[] = [
  { id: 'note', label: 'Note', type: 'textarea', required: true },
  { id: 'choices', label: 'Choices', type: 'checkbox', options: ['A', 'B'] },
];
const request = (body: string, headers?: HeadersInit) => new Request('http://127.0.0.1:3000/api/portal/tasks/task/submit', { method: 'POST', body, headers });

describe('bounded feedback input', () => {
  it('accepts normal answers and the text boundary', () => {
    const answers = { note: 'x'.repeat(10000), choices: ['A'] };
    expect(formSubmissionSchema.safeParse({ answers }).success).toBe(true);
    expect(answersMatchFeedbackForm(answers, fields)).toBe(true);
  });
  it('rejects too many answers and huge strings/arrays', () => {
    expect(formSubmissionSchema.safeParse({ answers: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`f${i}`, 'x'])) }).success).toBe(false);
    expect(formSubmissionSchema.safeParse({ answers: { note: 'x'.repeat(10001) } }).success).toBe(false);
    expect(formSubmissionSchema.safeParse({ answers: { choices: Array(21).fill('A') } }).success).toBe(false);
  });
  it('rejects unknown keys, wrong answer types and choices not in the task form', () => {
    expect(answersMatchFeedbackForm({ note: 'ok', other: 'unknown' }, fields)).toBe(false);
    expect(answersMatchFeedbackForm({ note: ['not text'] }, fields)).toBe(false);
    expect(answersMatchFeedbackForm({ note: 'ok', choices: ['C'] }, fields)).toBe(false);
    expect(answersMatchFeedbackForm({ note: 'ok', choices: ['A', 'B', 'A'] }, fields)).toBe(false);
    expect(answersMatchFeedbackForm({ note: 'ok', choices: ['A', 'A'] }, fields)).toBe(false);
    expect(answersMatchFeedbackForm({ note: '' }, fields)).toBe(false);
    expect(answersMatchFeedbackForm({ note: 'ok' }, null)).toBe(false);
  });
  it('rejects an oversized declared body', async () => {
    await expect(readLimitedJson(request('{}', { 'content-length': String(MAX_FEEDBACK_BODY_BYTES + 1) }))).rejects.toMatchObject({ status: 413 });
  });
  it('rejects streamed bytes even with a missing or misleading content length', async () => {
    for (const headers of [new Headers(), new Headers({ 'content-length': '2' })]) {
      await expect(readLimitedJson(request('x'.repeat(MAX_FEEDBACK_BODY_BYTES + 1), headers))).rejects.toMatchObject({ status: 413 });
    }
  });
  it('counts UTF-8 bytes rather than string characters', async () => {
    await expect(readLimitedJson(request(JSON.stringify({ note: 'é'.repeat(20) })), 40)).rejects.toMatchObject({ status: 413 });
  });
  it('accepts JSON at the exact byte boundary and rejects malformed input', async () => {
    await expect(readLimitedJson(request('{"a":1}'), 7)).resolves.toEqual({ a: 1 });
    await expect(readLimitedJson(request('{'))).rejects.toMatchObject({ status: 400 });
  });
});
