import type { FeedbackDelayUnit } from './types';

/**
 * Bounds for a workflow step's relative delay.
 *
 * These mirror the database CHECK constraint
 * `feedback_delay_value between 1 and 10` on both `template_tasks` and
 * `project_tasks`. Keeping one exported pair means the editor, the request
 * validation and the constraint cannot drift apart — and raising the ceiling is
 * a single migration plus a single change here.
 */
export const FEEDBACK_DELAY_MIN = 1;
export const FEEDBACK_DELAY_MAX = 10;

export function clampFeedbackDelay(value: number) {
  if (!Number.isFinite(value)) return FEEDBACK_DELAY_MIN;
  return Math.min(FEEDBACK_DELAY_MAX, Math.max(FEEDBACK_DELAY_MIN, Math.round(value)));
}

/**
 * When a step configured as "N units after the previous task is completed"
 * becomes available, given the moment that task was actually completed.
 *
 * This is the TypeScript mirror of what `complete_project_task()` computes as
 * `now() + make_interval(...)`. The database remains the authority; this exists
 * so the scheduling rule can be asserted directly in tests and previewed in the
 * UI without a round trip.
 */
export function feedbackAvailableAt(completedAt: string | Date, value: number, unit: FeedbackDelayUnit) {
  const completed = completedAt instanceof Date ? completedAt : new Date(completedAt);
  if (Number.isNaN(completed.getTime())) return null;
  const amount = clampFeedbackDelay(value);
  const scheduled = new Date(completed.getTime());
  if (unit === 'minutes') scheduled.setUTCMinutes(scheduled.getUTCMinutes() + amount);
  else if (unit === 'hours') scheduled.setUTCHours(scheduled.getUTCHours() + amount);
  else scheduled.setUTCDate(scheduled.getUTCDate() + amount);
  return scheduled;
}

export function describeFeedbackDelay(value: number | null, unit: FeedbackDelayUnit | null) {
  if (!value || !unit) return 'Immediately after completion';
  const amount = clampFeedbackDelay(value);
  const noun = amount === 1 ? unit.replace(/s$/, '') : unit;
  return `${amount} ${noun} after the previous task is completed`;
}
