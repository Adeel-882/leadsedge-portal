'use client';

import { FormEvent, useState } from 'react';

type RequestState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string };

const fallbackError = "We couldn't send the sign-in link. Please try again.";

export function SignInForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const submittedEmail = email.trim().toLowerCase();
    setLoading(true);
    setRequestState({ status: 'idle' });

    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: submittedEmail, next: nextPath }),
      });
      const result = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) {
        setRequestState({ status: 'error', message: result?.error || fallbackError });
        return;
      }
      setRequestState({ status: 'success' });
    } catch {
      setRequestState({ status: 'error', message: fallbackError });
    } finally {
      setLoading(false);
    }
  }

  return <form onSubmit={submit} className="mt-8 space-y-5">
    <label><span className="field-label">Email address</span><input className="field-input" type="email" name="email" autoComplete="email" inputMode="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
    {requestState.status === 'success' && <div role="status" aria-live="polite" className="rounded-lg bg-success-soft p-4 text-success"><p className="text-sm font-bold">Check your email</p><p className="mt-1 text-sm">If this email is authorized, check your inbox for a sign-in link.</p></div>}
    {requestState.status === 'error' && <p role="alert" aria-live="assertive" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{requestState.message}</p>}
    <button type="submit" className="button-primary w-full" disabled={loading}>{loading ? 'Sending link...' : 'Email me a secure sign-in link'}</button>
  </form>;
}
