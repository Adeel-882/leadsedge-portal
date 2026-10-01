-- PROPOSAL ONLY. Not applied. Requires explicit Frankfurt schema approval.
-- Run before deploying application code that reads task_seen_at.
begin;
alter table public.notifications
  add column task_seen_at timestamptz;

comment on column public.notifications.task_seen_at is
  'Task-opening acknowledgment for task.activated/task.assigned notifications; independent of Bell read_at. Historical assignments are acknowledged at rollout, not evidence of a historical view.';

-- Rollout policy: existing assignments must not suddenly appear as NEW.
-- This acknowledges historical rows; it does not reconstruct missing view history.
update public.notifications
set task_seen_at = transaction_timestamp()
where task_id is not null
  and type in ('task.activated', 'task.assigned');

create index notifications_unseen_assignments_idx
  on public.notifications(user_id, task_id)
  where task_id is not null
    and type in ('task.activated', 'task.assigned')
    and task_seen_at is null;
commit;
