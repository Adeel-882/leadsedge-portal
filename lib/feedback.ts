import type { FormField } from './types';

/** Validate against the authorized task's independent form copy, not the reusable template. */
export function answersMatchFeedbackForm(answers: Record<string, string | string[]>, fields: FormField[] | null) {
  if (!fields || fields.length === 0) return false;
  const byId = new Map(fields.map((field) => [field.id, field]));
  for (const [key, answer] of Object.entries(answers)) {
    const field = byId.get(key);
    if (!field) return false;
    if (field.type === 'checkbox') {
      if (!Array.isArray(answer) || answer.length > (field.options?.length ?? 0)
        || new Set(answer).size !== answer.length || answer.some((item) => !field.options?.includes(item))) return false;
    } else {
      if (typeof answer !== 'string') return false;
      if ((field.type === 'radio' || field.type === 'select') && answer !== '' && !field.options?.includes(answer)) return false;
    }
  }
  return fields.every((field) => !field.required || (answers[field.id] !== undefined && answers[field.id].length > 0));
}

export function feedbackSubmissionErrorMessage(message?: string) {
  const normalized = message?.trim() || '';
  if (/feedback has already been submitted/i.test(normalized)) return 'Feedback has already been submitted.';
  if (/^[^\r\n]+ is required$/i.test(normalized)) return normalized.endsWith('.') ? normalized : `${normalized}.`;
  if (/invalid answer for/i.test(normalized)) return 'One or more feedback answers are invalid.';
  return 'This form is no longer available.';
}
