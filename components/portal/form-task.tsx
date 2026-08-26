'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FormField } from '@/lib/types';

export function FormTask({ taskId, fields }: { taskId: string; fields: FormField[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    const missing = fields.find((field) => field.required && !answers[field.id]);
    if (missing) { setError(`${missing.label} is required.`); setSaving(false); return; }
    const response = await fetch(`/api/portal/tasks/${taskId}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Feedback could not be submitted.'); else router.refresh();
    setSaving(false);
  }
  return <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-line bg-[#fbfcfd] p-4 sm:p-5">{fields.map((field) => <fieldset key={field.id}><legend className="field-label">{field.label}{field.required ? ' *' : ''}</legend>{field.type === 'text' && <input className="field-input" value={answers[field.id] || ''} onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })} />}{field.type === 'textarea' && <textarea className="field-textarea" value={answers[field.id] || ''} onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })} />}{field.type === 'radio' && <div className="grid gap-2 sm:grid-cols-2">{field.options?.map((option) => <label className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm" key={option}><input type="radio" name={field.id} value={option} checked={answers[field.id] === option} onChange={() => setAnswers({ ...answers, [field.id]: option })} />{option}</label>)}</div>}</fieldset>)}{error && <p className="text-sm text-[#b33e3e]">{error}</p>}<button className="button-primary w-full" disabled={saving}>{saving ? 'Submitting…' : 'Submit feedback'}</button></form>;
}
