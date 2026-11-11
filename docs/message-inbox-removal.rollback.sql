-- Restore the captured Frankfurt unread function before removing new objects.
-- Application feature flag must be disabled first. Keep visibility data.
begin;
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
      (pm.id is not null and pm.message_type = 'user' and public.is_project_member(pm.project_id))
      or (tm.id is not null and tm.message_type = 'user' and public.can_access_task(tm.task_id))
    )
$function$
;
drop trigger if exists reopen_project_message_inboxes on public.project_messages;
drop trigger if exists reopen_task_message_inboxes on public.task_messages;
drop function if exists public.reopen_message_inboxes();
alter publication supabase_realtime drop table public.message_inbox_visibility;
drop function if exists public.set_own_inbox_visibility(uuid[],uuid[],boolean);
commit;
-- Intentionally retain message_inbox_visibility and its owner-only SELECT policy.
