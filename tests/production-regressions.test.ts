import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatDate, formatTime } from '@/lib/format';

const signInForm = readFileSync(new URL('../components/auth/sign-in-form.tsx', import.meta.url), 'utf8');
const magicLinkRoute = readFileSync(new URL('../app/api/auth/magic-link/route.ts', import.meta.url), 'utf8');
const projectOverview = readFileSync(new URL('../app/admin/projects/[projectId]/page.tsx', import.meta.url), 'utf8');

describe('production regression protection', () => {
  it('keeps the sign-in request in place and renders an explicit success state', () => {
    expect(signInForm).toContain('event.preventDefault()');
    expect(signInForm).toContain('Check your email');
    expect(signInForm).toContain('We sent a secure sign-in link to {requestState.email}.');
    expect(signInForm).toContain('finally');
    expect(signInForm).not.toContain("setEmail('')");
  });

  it('uses a safe authorization error without exposing provider details', () => {
    expect(magicLinkRoute).toContain('This email does not have access to the portal.');
  });

  it('does not let optional project aggregates crash the overview', () => {
    expect(projectOverview).toContain('Promise.allSettled');
    expect(projectOverview).toContain("tasksResult.status === 'fulfilled' ? tasksResult.value : []");
    expect(projectOverview).toContain("meetingsResult.status === 'fulfilled' ? meetingsResult.value : []");
  });

  it('formats missing or malformed timestamps safely', () => {
    expect(formatDate(null)).toBe('Not set');
    expect(formatDate('not-a-date')).toBe('Not set');
    expect(formatTime('not-a-date')).toBe('Not set');
  });
});
