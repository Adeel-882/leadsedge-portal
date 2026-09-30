'use client';
import { useCacheMutation } from '@/components/cached-screen';

import { FormEvent, useState } from 'react';
import type { FormField } from '@/lib/types';

export function FormTask({ taskId, fields }: { taskId: string; fields: FormField[] }) {
  const invalidate = useCacheMutation();
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    const missing = fields.find((field) => field.required && (!answers[field.id] || (Array.isArray(answers[field.id]) && answers[field.id].length === 0)));
    if (missing) { setError(`${missing.label} is required.`); setSaving(false); return; }
    const response = await fetch(`/api/portal/tasks/${taskId}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error || 'Feedback could not be submitted.'); else await invalidate('task', taskId);
    setSaving(false);
  }
  return <form onSubmit={submit} className="space-y-6">{fields.map((field) => <fieldset key={field.id}><legend className="field-label">{field.label}{field.required ? ' *' : ''}</legend>{field.type === 'text' && <input className="field-input" value={typeof answers[field.id] === 'string' ? answers[field.id] : ''} onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })} />}{field.type === 'textarea' && <textarea className="field-textarea" value={typeof answers[field.id] === 'string' ? answers[field.id] : ''} onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })} />}{field.type === 'select' && <select className="field-select" value={typeof answers[field.id] === 'string' ? answers[field.id] : ''} onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.value })}><option value="">Select an option</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>}{field.type === 'radio' && <div className="grid gap-2 sm:grid-cols-2">{field.options?.map((option) => <label className={`flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm transition ${answers[field.id] === option ? 'border-teal bg-[#e6f1ef]' : 'border-line bg-white hover:border-[#b8c8c3]'}`} key={option}><input type="radio" name={field.id} value={option} checked={answers[field.id] === option} onChange={() => setAnswers({ ...answers, [field.id]: option })} />{option}</label>)}</div>}{field.type === 'checkbox' && <div className="grid gap-2 sm:grid-cols-2">{field.options?.map((option) => { const selected = Array.isArray(answers[field.id]) ? answers[field.id] as string[] : []; return <label className={`flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm transition ${selected.includes(option) ? 'border-teal bg-[#e6f1ef]' : 'border-line bg-white hover:border-[#b8c8c3]'}`} key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => setAnswers({ ...answers, [field.id]: event.target.checked ? [...selected, option] : selected.filter((item) => item !== option) })} />{option}</label>; })}</div>}</fieldset>)}{error && <p role="alert" className="rounded-lg bg-[#faeeee] p-3 text-sm text-[#8f3030]">{error}</p>}<button className="button-primary w-full sm:w-auto" disabled={saving}>{saving ? 'Submitting...' : 'Submit feedback'}</button></form>;
}
