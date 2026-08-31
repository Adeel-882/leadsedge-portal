export function feedbackSubmissionErrorMessage(message?: string) {
  const normalized = message?.trim() || '';
  if (/feedback has already been submitted/i.test(normalized)) return 'Feedback has already been submitted.';
  if (/^[^\r\n]+ is required$/i.test(normalized)) return normalized.endsWith('.') ? normalized : `${normalized}.`;
  if (/invalid answer for/i.test(normalized)) return 'One or more feedback answers are invalid.';
  return 'This form is no longer available.';
}
