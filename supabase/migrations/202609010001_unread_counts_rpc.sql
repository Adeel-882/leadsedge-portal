-- Additive only. Creates a single read-only function returning both unread
-- counts so a layout render costs one round trip instead of two.
--
-- Security posture is unchanged:
--   * SECURITY INVOKER, so the notifications count runs as the calling user and
--     the existing "users read notifications" RLS policy still applies. The
--     predicate also filters on auth.uid() explicitly, matching the query this
--     replaces exactly.
--   * The message half delegates to the existing hardened
--     get_unread_message_count(), which keeps its own SECURITY DEFINER checks
--     (is_project_member / can_access_task) untouched.
--   * Execute is revoked from public and anon, granted only to authenticated,
--     mirroring get_unread_message_count().
--
-- No table, policy, index, trigger or existing function is modified or dropped.

begin;

create or replace function public.get_unread_counts()
returns table (unread_messages bigint, unread_notifications bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    public.get_unread_message_count() as unread_messages,
    (
      select count(*)
      from public.notifications
      where user_id = auth.uid()
        and read_at is null
    ) as unread_notifications;
$$;

revoke all on function public.get_unread_counts() from public, anon;
grant execute on function public.get_unread_counts() to authenticated;

commit;
