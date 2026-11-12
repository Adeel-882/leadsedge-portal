-- PROPOSED ONLY: requires explicit Frankfurt approval before application.
-- Captured from the live Frankfurt function on 2026-11-12.
-- Only add deleted_at predicates; preserve signature, security, search_path,
-- ownership and existing grants (CREATE OR REPLACE retains privileges).
-- No row writes, policy changes, triggers or publication changes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
CREATE OR REPLACE FUNCTION public.get_unread_message_count()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)
  from public.message_read_receipts receipt
  left join public.project_messages pm on pm.id = receipt.project_message_id
  left join public.task_messages tm on tm.id = receipt.task_message_id
  where receipt.recipient_id = auth.uid()
    and receipt.read_at is null
    and (
      (pm.id is not null and pm.message_type = 'user' and pm.deleted_at is null and public.is_project_member(pm.project_id))
      or (tm.id is not null and tm.message_type = 'user' and tm.deleted_at is null and public.can_access_task(tm.task_id))
    )
    and not exists (
      select 1 from public.message_inbox_visibility visibility
      where visibility.user_id = auth.uid() and visibility.hidden and public.is_admin()
        and (visibility.project_id = pm.project_id or visibility.task_id = tm.task_id)
    )
$function$;
commit;
