-- PROPOSAL ONLY: additive, read-only shell bootstrap. Do not apply to a linked
-- production project without explicit approval after security review.
--
-- Object changes: creates/replaces only public.get_portal_bootstrap(), revokes
-- execution from public/anon, and grants execution to authenticated. It does
-- not alter tables, records, RLS policies, triggers, indexes, or auth settings.
begin;

create or replace function public.get_portal_bootstrap()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with viewer as (
    select
      users.id,
      users.role,
      coalesce(admin_settings.display_name, users.full_name) as display_name
    from public.users
    left join public.admin_settings on admin_settings.user_id = users.id
    where users.id = auth.uid()
      and (
        users.role = 'admin'
        or exists (
          select 1 from public.clients authorized_client
          where authorized_client.auth_user_id = users.id
            and authorized_client.status <> 'disabled'
        )
      )
  ), client_context as (
    select
      clients.status = 'disabled' as disabled,
      projects.id as primary_project_id,
      projects.project_name
    from public.clients
    left join lateral (
      select project_clients.project_id
      from public.project_clients
      where project_clients.client_id = clients.id
      order by project_clients.is_primary desc, project_clients.created_at
      limit 1
    ) membership on true
    left join public.projects on projects.id = membership.project_id
    where clients.auth_user_id = auth.uid()
      and clients.status <> 'disabled'
  ), unread as (
    select * from public.get_unread_counts()
  )
  select jsonb_build_object(
    'viewer', jsonb_build_object(
      'id', viewer.id,
      'role', viewer.role,
      'displayName', viewer.display_name
    ),
    'authorization', jsonb_build_object(
      'disabled', coalesce(client_context.disabled, false)
    ),
    'shell', jsonb_build_object(
      'primaryProjectId', client_context.primary_project_id,
      'projectName', client_context.project_name
    ),
    'unread', jsonb_build_object(
      'messages', unread.unread_messages,
      'notifications', unread.unread_notifications
    )
  )
  from viewer
  cross join unread
  left join client_context on true;
$$;

revoke all on function public.get_portal_bootstrap() from public, anon;
grant execute on function public.get_portal_bootstrap() to authenticated;

commit;
