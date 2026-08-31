'use client';

import { Plus, Trash } from '@phosphor-icons/react';
import type { FormField } from '@/lib/types';

const optionTypes = new Set<FormField['type']>(['radio', 'select', 'checkbox']);

export function FeedbackFormEditor({ fields, onChange }: { fields: FormField[]; onChange: (fields: FormField[]) => void }) {
  function update(index: number, patch: Partial<FormField>) {
    onChange(fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field));
  }
  function add() {
    onChange([...fields, { id: `field-${crypto.randomUUID()}`, label: 'New field', type: 'text', required: false }]);
  }
  return <div className="space-y-3">
    {fields.map((field, index) => <div key={field.id} className="rounded-xl border border-line bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
        <label><span className="field-label">Field label</span><input className="field-input" value={field.label} onChange={(event) => update(index, { label: event.target.value })} /></label>
        <label><span className="field-label">Type</span><select className="field-select" value={field.type} onChange={(event) => { const type = event.target.value as FormField['type']; update(index, { type, options: optionTypes.has(type) ? field.options || ['Option 1', 'Option 2'] : undefined }); }}><option value="text">Text</option><option value="textarea">Textarea</option><option value="radio">Radio</option><option value="select">Select</option><option value="checkbox">Checkbox</option></select></label>
        <button type="button" className="button-ghost self-end text-[#963d3d]" onClick={() => onChange(fields.filter((_, fieldIndex) => fieldIndex !== index))}><Trash size={15} aria-hidden />Remove</button>
      </div>
      {optionTypes.has(field.type) && <label className="mt-3 block"><span className="field-label">Options (one per line)</span><textarea className="field-textarea min-h-24" value={(field.options || []).join('\n')} onChange={(event) => update(index, { options: event.target.value.split('\n').map((option) => option.trim()).filter(Boolean) })} /></label>}
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => update(index, { required: event.target.checked })} /> Required</label>
    </div>)}
    <button type="button" className="button-secondary w-full" onClick={add}><Plus size={15} weight="bold" aria-hidden />Add form field</button>
  </div>;
}
