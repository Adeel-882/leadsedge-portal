-- PROPOSAL ONLY. Not applied. Keep outside supabase/migrations until approved.
-- Compare live schema/function definitions with the repository before applying.
begin;

create table public.message_inbox_visibility (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.project_tasks(id) on delete cascade,
  hidden boolean not null default true,
  hidden_at timestamptz not null default clock_timestamp(),
  reopened_at timestamptz,
  constraint message_inbox_visibility_one_resource check (num_nonnulls(project_id, task_id) = 1)
);
create unique index message_inbox_visibility_project_unique
  on public.message_inbox_visibility(user_id, project_id) where project_id is not null;
create unique index message_inbox_visibility_task_unique
  on public.message_inbox_visibility(user_id, task_id) where task_id is not null;
create index message_inbox_visibility_hidden_project
  on public.message_inbox_visibility(project_id) where hidden and project_id is not null;
create index message_inbox_visibility_hidden_task
  on public.message_inbox_visibility(task_id) where hidden and task_id is not null;

alter table public.message_inbox_visibility enable row level security;
revoke all on public.message_inbox_visibility from public, anon, authenticated;
grant select on public.message_inbox_visibility to authenticated;
create policy "administrators read own inbox visibility"
  on public.message_inbox_visibility for select to authenticated
  using (user_id = auth.uid() and public.is_admin());
-- No direct client INSERT/UPDATE/DELETE policies or grants. The RPC below is
-- the only application write path and never accepts a user ID.

create function public.set_own_inbox_visibility(
  project_ids uuid[], task_ids uuid[], hide boolean default true
) returns integer language plpgsql security definer set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  target record;
  changed integer := 0;
begin
  if viewer is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if hide is null or coalesce(cardinality(project_ids), 0) + coalesce(cardinality(task_ids), 0) not between 1 and 100 then
    raise exception 'Choose between 1 and 100 conversations' using errcode = '22023';
  end if;
  -- Deterministic lock ordering for bulk requests. The incoming-message trigger
  -- shares these locks, so inserts/removal serialize without timestamp guesses.
  for target in
    select 'project'::text as kind, unnest(project_ids) as resource_id
    union
    select 'task'::text as kind, unnest(task_ids) as resource_id
    order by kind, resource_id
  loop
    if target.resource_id is null then
      raise exception 'Invalid conversation' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('inbox:' || target.kind || ':' || target.resource_id::text, 0));
    if target.kind = 'project' then
      if not exists(select 1 from public.projects p where p.id = target.resource_id)
         or not public.is_project_member(target.resource_id) then
        raise exception 'Conversation access denied' using errcode = '42501';
      end if;
      insert into public.message_inbox_visibility as visibility
        (user_id, project_id, hidden, hidden_at, reopened_at)
      values (viewer, target.resource_id, hide, clock_timestamp(), case when not hide then clock_timestamp() end)
      on conflict (user_id, project_id) where project_id is not null do update
        set hidden = excluded.hidden,
            hidden_at = case when hide then excluded.hidden_at else visibility.hidden_at end,
            reopened_at = excluded.reopened_at;
    else
      if not exists(select 1 from public.project_tasks t where t.id = target.resource_id and t.archived_at is null)
         or not public.can_access_task(target.resource_id) then
        raise exception 'Conversation access denied' using errcode = '42501';
      end if;
      insert into public.message_inbox_visibility as visibility
        (user_id, task_id, hidden, hidden_at, reopened_at)
      values (viewer, target.resource_id, hide, clock_timestamp(), case when not hide then clock_timestamp() end)
      on conflict (user_id, task_id) where task_id is not null do update
        set hidden = excluded.hidden,
            hidden_at = case when hide then excluded.hidden_at else visibility.hidden_at end,
            reopened_at = excluded.reopened_at;
    end if;
    changed := changed + 1;
  end loop;
  return changed;
end;
$$;
revoke all on function public.set_own_inbox_visibility(uuid[], uuid[], boolean) from public, anon;
grant execute on function public.set_own_inbox_visibility(uuid[], uuid[], boolean) to authenticated;

create function public.reopen_message_inboxes()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.message_type <> 'user' then return new; end if;
  if TG_TABLE_NAME = 'project_messages' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('inbox:project:' || new.project_id::text, 0));
    update public.message_inbox_visibility set hidden = false, reopened_at = clock_timestamp()
      where project_id = new.project_id and hidden;
  elsif TG_TABLE_NAME = 'task_messages' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('inbox:task:' || new.task_id::text, 0));
    update public.message_inbox_visibility set hidden = false, reopened_at = clock_timestamp()
      where task_id = new.task_id and hidden;
  end if;
  return new;
end;
$$;
revoke all on function public.reopen_message_inboxes() from public, anon, authenticated;
create trigger reopen_project_message_inboxes after insert on public.project_messages
  for each row execute function public.reopen_message_inboxes();
create trigger reopen_task_message_inboxes after insert on public.task_messages
  for each row execute function public.reopen_message_inboxes();

-- Preserve the repository's existing authorization/message-type/recipient/read
-- conditions and bigint contract; exclude only the caller's hidden resources.
create or replace function public.get_unread_message_count()
returns bigint language sql stable security definer set search_path = public
as $$
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
    and not exists (
      select 1 from public.message_inbox_visibility visibility
      where visibility.user_id = auth.uid() and visibility.hidden and public.is_admin()
        and (visibility.project_id = pm.project_id or visibility.task_id = tm.task_id)
    )
$$;
revoke all on function public.get_unread_message_count() from public, anon;
grant execute on function public.get_unread_message_count() to authenticated;

-- Own-row INSERT/UPDATE events synchronize removal across this administrator's
-- tabs/devices. Existing message INSERT events already refresh the inventory.
-- No DELETE subscription or REPLICA IDENTITY FULL is necessary.
alter publication supabase_realtime add table public.message_inbox_visibility;

commit;
