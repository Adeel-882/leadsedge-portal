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
    setSaving(true); setMessage('');
    const response = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name, timezone: zone, notificationPreferences: { task_messages: taskMessages, project_messages: projectMessages, task_completed: taskMessages } }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? 'Settings saved.' : result.error || 'Unable to save settings.');
    if (response.ok) router.refresh();
    setSaving(false);
  }
  return <div className="card max-w-2xl p-5 md:p-7"><div className="space-y-5"><label><span className="field-label">Display name</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} /><p className="mt-2 text-xs text-muted">Shown in project owner menus and to clients.</p></label><label><span className="field-label">Timezone</span><select className="field-select" value={zone} onChange={(event) => setZone(event.target.value)}><option value="Asia/Karachi">Asia/Karachi</option><option value="UTC">UTC</option><option value="America/New_York">America/New_York</option><option value="America/Chicago">America/Chicago</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="Europe/London">Europe/London</option></select></label><div className="rounded-xl bg-[#f7f9fb] p-4"><p className="text-sm font-semibold">Notifications</p><label className="mt-3 flex items-center gap-3 text-sm"><input type="checkbox" checked={taskMessages} onChange={(event) => setTaskMessages(event.target.checked)} /> Task comments and completions</label><label className="mt-3 flex items-center gap-3 text-sm"><input type="checkbox" checked={projectMessages} onChange={(event) => setProjectMessages(event.target.checked)} /> Project chat messages</label></div></div>{message && <p className="mt-5 text-sm text-teal">{message}</p>}<div className="mt-6 flex items-center justify-between border-t border-line pt-5"><a className="text-sm font-semibold text-[#a34343]" href="/auth/sign-out">Sign out</a><button className="button-primary" disabled={saving || name.trim().length < 2} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button></div></div>;
}
