begin;

create table if not exists public.message_read_receipts (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  project_message_id uuid references public.project_messages(id) on delete cascade,
  task_message_id uuid references public.task_messages(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_read_receipts_one_message_check check (num_nonnulls(project_message_id, task_message_id) = 1)
);

create unique index if not exists message_read_receipts_project_unique
  on public.message_read_receipts(recipient_id, project_message_id)
  where project_message_id is not null;
create unique index if not exists message_read_receipts_task_unique
  on public.message_read_receipts(recipient_id, task_message_id)
  where task_message_id is not null;
create index if not exists message_read_receipts_unread_idx
  on public.message_read_receipts(recipient_id, read_at, created_at desc);

alter table public.message_read_receipts enable row level security;
drop policy if exists "users read own message receipts" on public.message_read_receipts;
create policy "users read own message receipts" on public.message_read_receipts
  for select using (recipient_id = auth.uid());
grant select on table public.message_read_receipts to authenticated;

-- Existing messages with an exact notification link retain that notification's
-- unread state. Older messages without an exact link are treated as historical
-- and read so this additive migration never floods users with legacy unread mail.
insert into public.message_read_receipts(recipient_id, project_message_id, read_at, created_at)
select recipient.recipient_id, pm.id,
  case when n.id is null then now() else n.read_at end,
  pm.created_at
from public.project_messages pm
join public.users sender on sender.id = pm.sender_id
join public.projects p on p.id = pm.project_id
cross join lateral (
  select case
    when sender.role = 'admin' then c.auth_user_id
    else p.owner_id
  end as recipient_id
  from public.project_clients pc
  join public.clients c on c.id = pc.client_id
  where pc.project_id = pm.project_id
  order by pc.is_primary desc, pc.created_at
  limit 1
) recipient
left join public.notifications n
  on n.user_id = recipient.recipient_id
 and n.type = 'project.message'
 and n.message_id = pm.id
where recipient.recipient_id is not null
  and recipient.recipient_id <> pm.sender_id
on conflict do nothing;

insert into public.message_read_receipts(recipient_id, task_message_id, read_at, created_at)
select case when sender.role = 'admin' then c.auth_user_id else p.owner_id end,
  tm.id,
  case when n.id is null then now() else n.read_at end,
  tm.created_at
from public.task_messages tm
join public.users sender on sender.id = tm.sender_id
join public.project_tasks pt on pt.id = tm.task_id
join public.projects p on p.id = pt.project_id
left join public.clients c on c.id = pt.assignee_id
left join public.notifications n
  on n.user_id = case when sender.role = 'admin' then c.auth_user_id else p.owner_id end
 and n.type = 'task.message'
 and n.message_id = tm.id
where case when sender.role = 'admin' then c.auth_user_id else p.owner_id end is not null
  and case when sender.role = 'admin' then c.auth_user_id else p.owner_id end <> tm.sender_id
on conflict do nothing;

create or replace function public.on_task_message_created()
returns trigger language plpgsql security definer set search_path = public
as $$
declare sender_name text; sender_role public.user_role; task_title text; task_project_id uuid; project_owner_id uuid; client_user_id uuid; recipient_id uuid;
begin
  select full_name, role into sender_name, sender_role from public.users where id = new.sender_id;
  select pt.title, pt.project_id, p.owner_id, c.auth_user_id
    into task_title, task_project_id, project_owner_id, client_user_id
  from public.project_tasks pt join public.projects p on p.id = pt.project_id
  left join public.clients c on c.id = pt.assignee_id where pt.id = new.task_id;
  recipient_id := case when sender_role = 'admin' then client_user_id else project_owner_id end;
  insert into public.task_activity(task_id, actor_id, event_type, body)
  values (new.task_id, new.sender_id, 'task.comment', 'commented on this task');
  if recipient_id is not null and recipient_id <> new.sender_id then
    insert into public.message_read_receipts(recipient_id, task_message_id)
    values (recipient_id, new.id)
    on conflict do nothing;
    insert into public.notifications(user_id, project_id, task_id, thread_id, message_id, type, title, body, target_url)
    values (recipient_id, task_project_id, new.task_id, new.thread_id, new.id, 'task.message', 'New task comment', sender_name || ' commented on ' || task_title || '.',
      case when sender_role = 'admin' then '/portal/tasks/' || new.task_id || '#conversation' else '/admin/projects/' || task_project_id || '/tasks/' || new.task_id || '#conversation' end);
  end if;
  return new;
end;
$$;

create or replace function public.on_project_message_created()
returns trigger language plpgsql security definer set search_path = public
as $$
declare sender_name text; sender_role public.user_role; project_name_value text; project_owner_id uuid; client_user_id uuid; recipient_id uuid;
begin
  select full_name, role into sender_name, sender_role from public.users where id = new.sender_id;
  select p.project_name, p.owner_id, c.auth_user_id
    into project_name_value, project_owner_id, client_user_id
  from public.projects p
  left join public.project_clients pc on pc.project_id = p.id and pc.is_primary
  left join public.clients c on c.id = pc.client_id where p.id = new.project_id;
  recipient_id := case when sender_role = 'admin' then client_user_id else project_owner_id end;
  if recipient_id is not null and recipient_id <> new.sender_id then
    insert into public.message_read_receipts(recipient_id, project_message_id)
    values (recipient_id, new.id)
    on conflict do nothing;
    insert into public.notifications(user_id, project_id, thread_id, message_id, type, title, body, target_url)
    values (recipient_id, new.project_id, new.thread_id, new.id, 'project.message', 'New project message', sender_name || ' sent a message in ' || project_name_value || '.',
      case when sender_role = 'admin' then '/portal/messages' else '/admin/projects/' || new.project_id || '/chat' end);
  end if;
  return new;
end;
$$;

create or replace function public.mark_conversation_read(target_kind text, target_resource_id uuid)
returns table(read_messages integer, read_notifications integer)
language plpgsql security definer set search_path = public
as $$
declare current_user_id uuid := auth.uid(); message_total integer := 0; notification_total integer := 0;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if target_kind = 'task' then
    if not public.can_access_task(target_resource_id) then raise exception 'Conversation access denied'; end if;
    update public.message_read_receipts receipt
      set read_at = now()
      where receipt.recipient_id = current_user_id
        and receipt.read_at is null
        and receipt.task_message_id in (select id from public.task_messages where task_id = target_resource_id);
    get diagnostics message_total = row_count;
    update public.notifications
      set read_at = now()
      where user_id = current_user_id and task_id = target_resource_id and read_at is null;
    get diagnostics notification_total = row_count;
  elsif target_kind = 'project' then
    if not public.is_project_member(target_resource_id) then raise exception 'Conversation access denied'; end if;
    update public.message_read_receipts receipt
      set read_at = now()
      where receipt.recipient_id = current_user_id
        and receipt.read_at is null
        and receipt.project_message_id in (select id from public.project_messages where project_id = target_resource_id);
    get diagnostics message_total = row_count;
    update public.notifications
      set read_at = now()
      where user_id = current_user_id and project_id = target_resource_id
        and task_id is null and type = 'project.message' and read_at is null;
    get diagnostics notification_total = row_count;
  else
    raise exception 'Invalid conversation type';
  end if;
  return query select message_total, notification_total;
end;
$$;

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
      (pm.id is not null and public.is_project_member(pm.project_id))
      or (tm.id is not null and public.can_access_task(tm.task_id))
    )
$$;

revoke all on function public.mark_conversation_read(text, uuid) from public, anon;
revoke all on function public.get_unread_message_count() from public, anon;
grant execute on function public.mark_conversation_read(text, uuid) to authenticated;
grant execute on function public.get_unread_message_count() to authenticated;

alter table public.message_read_receipts replica identity full;
alter publication supabase_realtime add table public.message_read_receipts;

commit;
