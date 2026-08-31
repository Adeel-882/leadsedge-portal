'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaperPlaneTilt } from '@phosphor-icons/react';

export type InvitationToastState = { message: string; tone: 'success' | 'error' };

export async function resendProjectInvitation(projectId: string) {
  const response = await fetch(`/api/admin/projects/${projectId}/invitation`, { method: 'POST' });
  const result = await response.json().catch(() => null) as { error?: string; message?: string; sentAt?: string } | null;
  if (!response.ok) throw new Error(result?.error || 'Invitation could not be sent. Please try again.');
  return { message: result?.message || 'Invitation sent.', sentAt: result?.sentAt || new Date().toISOString() };
}

export function InvitationToast({ toast }: { toast: InvitationToastState | null }) {
  if (!toast) return null;
  return <div role={toast.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`toast ${toast.tone === 'error' ? 'bg-[#8f3030]' : ''}`}>{toast.message}</div>;
}

export function InviteButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState<InvitationToastState | null>(null);

  async function resend() {
    if (sending) return;
    setSending(true);
    setMessage('');
    setToast(null);
    try {
      const result = await resendProjectInvitation(projectId);
      setMessage('Invitation sent just now');
      setToast({ message: result.message, tone: 'success' });
      router.refresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invitation could not be sent. Please try again.';
      setMessage(errorMessage);
      setToast({ message: errorMessage, tone: 'error' });
    } finally {
      setSending(false);
    }
  }

  return <div><button className="button-secondary mt-4 w-full" disabled={sending} onClick={resend}><PaperPlaneTilt size={15} aria-hidden />{sending ? 'Sending...' : 'Resend invitation'}</button>{message && <p aria-live="polite" className={`mt-2 text-xs ${toast?.tone === 'error' ? 'text-[#a34343]' : 'text-muted'}`}>{message}</p>}<InvitationToast toast={toast} /></div>;
}
