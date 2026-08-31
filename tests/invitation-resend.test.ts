import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync(new URL('../app/api/admin/projects/[projectId]/invitation/route.ts', import.meta.url), 'utf8');
const projectOverview = readFileSync(new URL('../app/admin/projects/[projectId]/page.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../components/admin/dashboard-client.tsx', import.meta.url), 'utf8');

describe('client invitation resend control', () => {
  it('checks admin access and the existing Auth user before generating a fresh link', () => {
    expect(route).toContain("requireApiRole('admin')");
    expect(route.indexOf('getUserById(client.auth_user_id)')).toBeGreaterThan(-1);
    expect(route.indexOf("generateLink({ type: 'magiclink'")).toBeGreaterThan(route.indexOf('getUserById(client.auth_user_id)'));
    expect(route).toContain('linkData.user.id !== client.auth_user_id');
  });

  it('uses the server-compatible TokenHash URL and never the implicit action link', () => {
    expect(route).toContain("buildPortalConfirmationUrl({ tokenHash: linkData.properties.hashed_token, type: 'magiclink' })");
    expect(route).not.toContain('properties.action_link');
    expect(route).not.toContain('#access_token');
    expect(route).not.toMatch(/console\.(log|info|debug)/);
  });

  it('exposes resend controls on the project overview and dashboard menu', () => {
    expect(projectOverview).toContain('<InviteButton projectId={project.id} />');
    expect(projectOverview).not.toContain("status === 'invited'");
    expect(projectOverview).toContain('Invitation status:');
    expect(dashboard).toContain('Resend client invitation');
    expect(dashboard).toContain("'Sending...'");
  });

  it('returns the required safe provider failure message', () => {
    expect(route).toContain('Invitation could not be sent. Please try again.');
  });
});
