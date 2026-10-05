'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SetupAdminForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState('Asia/Karachi');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function setup() {
    setSaving(true); setError('');
    const response = await fetch('/api/setup/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name, timezone }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Administrator setup could not be completed.'); else router.push('/admin');
    setSaving(false);
  }
  return <div className="mt-7 space-y-5"><label><span className="field-label">Display name</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span className="field-label">Timezone</span><select className="field-select" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Asia/Karachi">Asia/Karachi</option><option value="UTC">UTC</option><option value="America/New_York">America/New_York</option><option value="Europe/London">Europe/London</option></select></label>{error && <p className="text-sm text-danger">{error}</p>}<button className="button-primary w-full" disabled={saving || name.trim().length < 2} onClick={setup}>{saving ? 'Preparing workspace…' : 'Create first administrator'}</button></div>;
}
