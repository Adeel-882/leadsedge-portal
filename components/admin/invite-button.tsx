'use client';

import { useState } from 'react';

export function InviteButton({ projectId }: { projectId: string }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  async function resend() {
    setSending(true); setMessage('');
    const response = await fetch(`/api/admin/projects/${projectId}/invitation`, { method: 'POST' });
    const result = await response.json() as { error?: string; message?: string };
    setMessage(response.ok ? result.message || 'Invitation sent.' : result.error || 'Invitation could not be sent.');
    setSending(false);
  }
  return <div><button className="button-secondary mt-4" disabled={sending} onClick={resend}>{sending ? 'Sending…' : 'Resend invitation'}</button>{message && <p className="mt-2 text-xs text-muted">{message}</p>}</div>;
}
