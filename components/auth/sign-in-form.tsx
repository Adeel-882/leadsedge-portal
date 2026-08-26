'use client';

import { FormEvent, useState } from 'react';

export function SignInForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage('');
    const response = await fetch('/api/auth/magic-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, next: nextPath }) });
    const result = await response.json() as { error?: string; message?: string };
    setMessage(response.ok ? result.message || 'Check your email for a secure sign-in link.' : result.error || 'Unable to send sign-in link.');
    setLoading(false);
  }
  return <form onSubmit={submit} className="mt-7 space-y-5"><label><span className="field-label">Email address</span><input className="field-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>{message && <p className="rounded-xl bg-[#eef7f5] p-3 text-sm text-[#116b63]">{message}</p>}<button className="button-primary w-full" disabled={loading}>{loading ? 'Sending link…' : 'Email me a secure sign-in link'}</button></form>;
}
