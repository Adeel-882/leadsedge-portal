'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SettingsForm({ displayName, timezone }: { displayName: string; timezone: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [zone, setZone] = useState(timezone);
  const [taskMessages, setTaskMessages] = useState(true);
  const [projectMessages, setProjectMessages] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setSaving(true);
    setMessage('');
    const response = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name, timezone: zone, notificationPreferences: { task_messages: taskMessages, project_messages: projectMessages, task_completed: taskMessages } }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? 'Settings saved.' : result.error || 'Unable to save settings.');
    if (response.ok) router.refresh();
    setSaving(false);
  }

  return <section className="surface-flat p-5 md:p-6">
    <div><p className="page-eyebrow">Profile</p><h2 className="section-title">Administrator details</h2><p className="section-description">The identity clients see across projects and messages.</p></div>
    <div className="mt-5 space-y-5">
      <label><span className="field-label">Display name</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} /><p className="field-helper">Shown in project owner menus and to clients.</p></label>
      <label><span className="field-label">Timezone</span><select className="field-select" value={zone} onChange={(event) => setZone(event.target.value)}><option value="Asia/Karachi">Asia/Karachi</option><option value="UTC">UTC</option><option value="America/New_York">America/New_York</option><option value="America/Chicago">America/Chicago</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="Europe/London">Europe/London</option></select></label>
      <fieldset className="rounded-lg border border-line bg-surface-subtle p-4"><legend className="px-1 text-sm font-semibold">Notifications</legend><label className="mt-2 flex min-h-9 items-center gap-3 text-sm"><input type="checkbox" checked={taskMessages} onChange={(event) => setTaskMessages(event.target.checked)} /> Task comments and completions</label><label className="mt-2 flex min-h-9 items-center gap-3 text-sm"><input type="checkbox" checked={projectMessages} onChange={(event) => setProjectMessages(event.target.checked)} /> Project chat messages</label></fieldset>
    </div>
    {message && <p aria-live="polite" className={`mt-5 text-sm ${message === 'Settings saved.' ? 'text-success' : 'text-danger'}`}>{message}</p>}
    <div className="mt-6 flex items-center justify-between border-t border-line pt-5"><a className="text-sm font-semibold text-danger" href="/auth/sign-out">Sign out</a><button className="button-primary" disabled={saving || name.trim().length < 2} onClick={save}>{saving ? 'Saving...' : 'Save settings'}</button></div>
  </section>;
}
