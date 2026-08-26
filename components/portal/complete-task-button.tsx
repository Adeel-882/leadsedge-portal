'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CompleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function complete() {
    if (!window.confirm('Mark this task as completed? This action will notify your administrator.')) return;
    setSaving(true); setError('');
    const response = await fetch(`/api/portal/tasks/${taskId}/complete`, { method: 'POST' });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Task could not be completed.'); else router.refresh();
    setSaving(false);
  }
  return <div><button className="button-primary w-full sm:w-auto" disabled={saving} onClick={complete}>{saving ? 'Completing…' : '✓ Mark as completed'}</button>{error && <p className="mt-2 text-xs text-[#b33e3e]">{error}</p>}</div>;
}
