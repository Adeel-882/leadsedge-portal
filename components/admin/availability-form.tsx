'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AvailabilitySettings } from '@/lib/types';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function AvailabilityForm({ initial }: { initial: AvailabilitySettings }) {
  const router = useRouter(); const [value, setValue] = useState(initial); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  function updateRule(weekday: number, field: 'enabled' | 'startTime' | 'endTime', next: boolean | string) { setValue((current) => ({ ...current, rules: current.rules.map((rule) => rule.weekday === weekday ? { ...rule, [field]: next } : rule) })); }
  async function save() {
    setSaving(true); setMessage('');
    const response = await fetch('/api/admin/availability', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? 'Availability saved.' : result.error || 'Availability could not be saved.');
    if (response.ok) router.refresh(); setSaving(false);
  }
  return <section className="surface-flat p-5 md:p-6"><div><p className="page-eyebrow">Scheduling</p><h2 className="text-xl font-bold">Availability and office hours</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted">Clients only see slots inside these hours and outside existing meetings or Google Calendar busy time.</p></div>
    <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><label><span className="field-label">Meeting duration</span><select className="field-select" value={value.meetingDurationMinutes} onChange={(event) => setValue({ ...value, meetingDurationMinutes: Number(event.target.value) })}>{[15,30,45,60,90,120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><label><span className="field-label">Buffer</span><select className="field-select" value={value.bufferMinutes} onChange={(event) => setValue({ ...value, bufferMinutes: Number(event.target.value) })}>{[0,5,10,15,30,45,60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><label><span className="field-label">Minimum notice</span><select className="field-select" value={value.minimumNoticeMinutes} onChange={(event) => setValue({ ...value, minimumNoticeMinutes: Number(event.target.value) })}><option value={0}>None</option><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={1440}>1 day</option><option value={2880}>2 days</option></select></label><label><span className="field-label">Maximum advance</span><select className="field-select" value={value.maximumAdvanceDays} onChange={(event) => setValue({ ...value, maximumAdvanceDays: Number(event.target.value) })}>{[14,30,60,90,180].map((days) => <option key={days} value={days}>{days} days</option>)}</select></label></div>
    <label className="mt-4 block"><span className="field-label">Scheduling timezone</span><select className="field-select max-w-sm" value={value.timezone} onChange={(event) => setValue({ ...value, timezone: event.target.value })}><option value="Asia/Karachi">Asia/Karachi</option><option value="UTC">UTC</option><option value="America/New_York">America/New_York</option><option value="America/Chicago">America/Chicago</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="Europe/London">Europe/London</option><option value="Australia/Sydney">Australia/Sydney</option></select></label>
    <div className="mt-6 divide-y divide-line rounded-xl border border-line">{value.rules.map((rule) => <div key={rule.weekday} className="grid gap-3 p-4 sm:grid-cols-[150px_1fr_1fr] sm:items-center"><label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(rule.weekday, 'enabled', event.target.checked)} />{dayNames[rule.weekday]}</label><label><span className="sr-only">Start time</span><input aria-label={`${dayNames[rule.weekday]} start time`} className="field-input" type="time" disabled={!rule.enabled} value={rule.startTime} onChange={(event) => updateRule(rule.weekday, 'startTime', event.target.value)} /></label><label><span className="sr-only">End time</span><input aria-label={`${dayNames[rule.weekday]} end time`} className="field-input" type="time" disabled={!rule.enabled} value={rule.endTime} onChange={(event) => updateRule(rule.weekday, 'endTime', event.target.value)} /></label></div>)}</div>
    {message && <p className={`mt-4 text-sm ${message.includes('saved') ? 'text-teal' : 'text-[#b33e3e]'}`}>{message}</p>}<div className="mt-5 flex justify-end"><button className="button-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save availability'}</button></div>
  </section>;
}
