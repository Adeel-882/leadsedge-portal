import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
import { sendBrandedEmail, sendPortalInvitation } from '@/lib/email';
import { automationHostedEmail, emailTemplateContracts, sendHostedEmail, templateConfigPrefix, type HostedEmail } from '@/lib/hosted-email';
const categories = Object.keys(emailTemplateContracts) as Array<keyof typeof emailTemplateContracts>;
beforeEach(() => {
  send.mockReset().mockResolvedValue({ data: { id: 'delivery-1' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 'test-only'); vi.stubEnv('RESEND_FROM_EMAIL', 'test@example.com');
  for (const category of categories) { vi.stubEnv(`${templateConfigPrefix(category)}_ENABLED`, 'false'); vi.stubEnv(`${templateConfigPrefix(category)}_ID`, ''); }
});
afterEach(() => vi.unstubAllEnvs());
const enable = (category: keyof typeof emailTemplateContracts) => {
  vi.stubEnv(`${templateConfigPrefix(category)}_ENABLED`, 'true');
  vi.stubEnv(`${templateConfigPrefix(category)}_ID`, `template-${category}`);
};
const invitation = () => sendPortalInvitation({ to: 'client@example.com', clientName: 'Alex', projectName: 'Example', actionLink: 'https://portal.leadsedge.us/auth/confirm?token_hash=synthetic&type=invite&next=%2Fportal' });
it.each(categories)('sends the exact contract for %s without overriding template presentation', async category => {
  enable(category);
  const variables = Object.fromEntries(emailTemplateContracts[category].map(key => [key, 'example']));
  expect(await sendHostedEmail('client@example.com', { category, variables } as HostedEmail, 'existing-key')).toEqual({ ok: true, id: 'delivery-1' });
  expect(send).toHaveBeenCalledExactlyOnceWith({ from: 'test@example.com', to: 'client@example.com', template: { id: `template-${category}`, variables } }, { idempotencyKey: 'existing-key' });
});
it('keeps legacy invitation HTML when disabled or ID is missing', async () => {
  await invitation(); expect(send.mock.calls[0][0].html).toContain('View Your Portal');
  vi.stubEnv('RESEND_TEMPLATE_CLIENT_INVITATION_ENABLED', 'true');
  await invitation(); expect(send.mock.calls[1][0].template).toBeUndefined();
});
it('retains legacy notification HTML without opt-in', async () => {
  await sendBrandedEmail({ to: 'client@example.com', subject: 'Subject', heading: 'Title', body: '<unsafe>', actionLabel: 'Open', actionLink: 'https://portal.leadsedge.us/portal', idempotencyKey: 'original' });
  expect(send.mock.calls[0][0].html).toContain('&lt;unsafe&gt;');
  expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: 'original' });
});
it('encodes untrusted text and preserves invitation URL through HTML attribute decoding', async () => {
  enable('client_invitation'); await invitation();
  const url = send.mock.calls[0][0].template.variables.ACTION_URL.replaceAll('&amp;', '&');
  expect(url).toBe('https://portal.leadsedge.us/auth/confirm?token_hash=synthetic&type=invite&next=%2Fportal');
  await sendHostedEmail('client@example.com', { category: 'client_invitation', variables: { CLIENT_NAME: '<img src=x onerror="bad">', ACTION_URL: 'https://portal.leadsedge.us/' } });
  expect(send.mock.calls[1][0].template.variables.CLIENT_NAME).toBe('&lt;img src=x onerror=&quot;bad&quot;&gt;');
});
it('never sends legacy after a provider rejection or uncertain timeout', async () => {
  enable('client_invitation'); send.mockResolvedValueOnce({ error: { message: 'secret' } });
  expect(await invitation()).toEqual({ ok: false, error: 'Hosted email delivery failed.' });
  expect(send).toHaveBeenCalledTimes(1);
  send.mockRejectedValueOnce(new Error('secret token'));
  await expect(invitation()).rejects.toThrow('Hosted email delivery outcome is uncertain.');
  expect(send).toHaveBeenCalledTimes(2);
});
it('preserves feedback destinations and avoids greeting admins with the client name', () => {
  const url = 'https://portal.leadsedge.us/admin/projects/p/tasks/t#feedback';
  expect(automationHostedEmail('feedback.submitted', { clientName: 'Client', taskTitle: 'Task', projectName: 'Project' }, url)?.variables.ACTION_URL).toBe(url);
  const meeting = automationHostedEmail('meeting.reminder', { clientName: 'Another person', title: 'Review', startAt: '2026-10-20T09:00:00Z', timezone: 'UTC' }, '/admin/meetings/m');
  expect(meeting?.variables).not.toHaveProperty('CLIENT_NAME');
  expect(automationHostedEmail('unknown', {}, '/portal')).toBeUndefined();
});
it('enables categories independently and rejects invalid variables before delivery', async () => {
  enable('client_invitation');
  expect(await sendHostedEmail('client@example.com', { category: 'task.assigned', variables: { CLIENT_NAME: 'Alex', TASK_TITLE: 'Lead', ACTION_URL: '/portal/tasks/t' } })).toBeNull();
  expect(await sendHostedEmail('client@example.com', { category: 'client_invitation', variables: { CLIENT_NAME: 'x'.repeat(2001), ACTION_URL: '/portal' } })).toMatchObject({ ok: false });
  expect(await sendHostedEmail('client@example.com', { category: 'client_invitation', variables: {} } as HostedEmail)).toMatchObject({ ok: false });
  expect(send).not.toHaveBeenCalled();
});
it('keeps all seven HTML designs consistent with contracts and the actual logo', () => {
  const manifest = JSON.parse(readFileSync('docs/resend-templates/manifest.json', 'utf8'));
  expect(manifest).toHaveLength(7);
  for (const entry of manifest) {
    const html = readFileSync(`docs/resend-templates/${entry.html}`, 'utf8');
    const variables = [...new Set([...html.matchAll(/\{\{\{(\w+)\}\}\}/g)].map(match => match[1]))].sort();
    expect(variables).toEqual([...emailTemplateContracts[entry.category as keyof typeof emailTemplateContracts]].sort());
    expect(html).toContain('https://portal.leadsedge.us/brand/leadsedge.jpg');
    expect(html).toContain('max-width:600px'); expect(html).not.toContain('<script');
    for (const color of ['#FF4134', '#070707', '#111111', '#FFFFFF', '#A7A7A2', '#262626']) expect(html).toContain(color);
  }
});
