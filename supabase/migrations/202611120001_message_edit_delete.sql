-- PROPOSED ONLY. Requires separate Frankfurt approval. No existing row DML.
begin;
alter table public.project_messages
  add column edited_at timestamptz,
  add column deleted_at timestamptz,
  add column message_version integer not null default 0 check (message_version >= 0);
alter table public.task_messages
  add column edited_at timestamptz,
  add column deleted_at timestamptz,
  add column message_version integer not null default 0 check (message_version >= 0);

-- New-message callers cannot forge mutation metadata. Existing insert behavior
-- and INSERT-only receipts/notification/reopening triggers are preserved.
create function public.initialize_message_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.edited_at := null; new.deleted_at := null; new.message_version := 0;
  return new;
end $$;
revoke all on function public.initialize_message_revision() from public, anon, authenticated;
create trigger initialize_project_message_revision before insert on public.project_messages
for each row execute function public.initialize_message_revision();
create trigger initialize_task_message_revision before insert on public.task_messages
for each row execute function public.initialize_message_revision();

-- No direct UPDATE policy is added. Only this constrained authenticated RPC
-- can mutate the message body. No service-role client is used by the app.
create function public.mutate_own_message(
  target_kind text, target_resource_id uuid, target_message_id uuid,
  operation text, expected_version integer, new_body text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  table_name text;
  resource_column text;
  message_row record;
  result jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if target_kind not in ('project','task') or target_kind is null
    or operation not in ('edit','delete') or operation is null
    or expected_version is null or expected_version < 0 then
    raise exception 'Invalid message operation' using errcode='22023';
  end if;
  if target_kind = 'task' then
    if not public.can_access_task(target_resource_id) or not exists(
      select 1 from public.project_tasks where id=target_resource_id and archived_at is null
    ) then raise exception 'Message unavailable' using errcode='42501'; end if;
    table_name := 'task_messages'; resource_column := 'task_id';
  else
    if not public.is_project_member(target_resource_id) then
      raise exception 'Message unavailable' using errcode='42501';
    end if;
    table_name := 'project_messages'; resource_column := 'project_id';
  end if;
  execute format('select * from public.%I where id=$1 and %I=$2 for update',table_name,resource_column)
    into message_row using target_message_id,target_resource_id;
  if message_row.id is null or message_row.sender_id is distinct from actor
    or message_row.message_type <> 'user' then
    raise exception 'Message unavailable' using errcode='42501';
  end if;
  -- Repeated DELETE is idempotent, but only after access/ownership checks.
  if message_row.deleted_at is not null then
    if operation='delete' then return to_jsonb(message_row); end if;
    raise exception 'Message was deleted' using errcode='40001';
  end if;
  if message_row.message_version <> expected_version then
    raise exception 'Message changed; reload before editing' using errcode='40001';
  end if;
  if operation='edit' then
    if new_body is null or new_body !~ '[^[:space:]]' or char_length(new_body)>5000 then
      raise exception 'Write between 1 and 5000 characters' using errcode='22023';
    end if;
    execute format('update public.%I set body=$1, edited_at=clock_timestamp(), message_version=message_version+1 where id=$2 returning to_jsonb(%I.*)',table_name,table_name)
      into result using new_body,target_message_id;
  else
    -- Retain row identity, sender, chronology and deletion metadata, not the
    -- removed content. Ordinary SELECT/Realtime/previews cannot leak old text.
    execute format('update public.%I set body=$1, attachment_url=null, deleted_at=clock_timestamp(), message_version=message_version+1 where id=$2 returning to_jsonb(%I.*)',table_name,table_name)
      into result using 'This message was deleted.',target_message_id;
  end if;
  return result;
end $$;
revoke all on function public.mutate_own_message(text,uuid,uuid,text,integer,text) from public, anon;
grant execute on function public.mutate_own_message(text,uuid,uuid,text,integer,text) to authenticated;
-- Existing SELECT RLS remains the Realtime authorization boundary. Both tables
-- already belong to supabase_realtime; no publication alteration is required.
commit;
