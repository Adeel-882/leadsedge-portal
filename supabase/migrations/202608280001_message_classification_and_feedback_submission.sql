begin;

-- Conversation rows are explicitly classified so activity and automation output
-- can never be mistaken for a person-to-person message.
alter table public.project_messages
  add column if not exists message_type text not null default 'user';
alter table public.task_messages
  add column if not exists message_type text not null default 'user';

alter table public.project_messages drop constraint if exists project_messages_message_type_check;
alter table public.project_messages add constraint project_messages_message_type_check
  check (message_type in ('user', 'system'));
alter table public.task_messages drop constraint if exists task_messages_message_type_check;
alter table public.task_messages add constraint task_messages_message_type_check
  check (message_type in ('user', 'system'));

create index if not exists project_messages_user_conversation_idx
  on public.project_messages(project_id, created_at)
  where message_type = 'user';
create index if not exists task_messages_user_conversation_idx
  on public.task_messages(task_id, created_at)
  where message_type = 'user';

drop policy if exists "members send project messages" on public.project_messages;
create policy "members send project messages" on public.project_messages for insert
  with check (
    sender_id = auth.uid()
    and message_type = 'user'
    and public.is_project_member(project_id)
    and exists(
      select 1 from public.project_threads thread
      where thread.id = thread_id and thread.project_id = project_id
    )
  );

drop policy if exists "members send task messages" on public.task_messages;
create policy "members send task messages" on public.task_messages for insert
  with check (
    sender_id = auth.uid()
    and message_type = 'user'
    and public.can_access_task(task_id)
    and exists(
      select 1 from public.task_threads thread
      where thread.id = thread_id and thread.task_id = task_id
    )
  );

create or replace function public.on_task_message_created()
returns trigger language plpgsql security definer set search_path = public
as $$
declare sender_name text; sender_role public.user_role; task_title text; task_project_id uuid; project_owner_id uuid; client_user_id uuid; recipient_id uuid;
begin
  if new.message_type <> 'user' then return new; end if;
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
  if new.message_type <> 'user' then return new; end if;
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
        and receipt.task_message_id in (
          select id from public.task_messages where task_id = target_resource_id and message_type = 'user'
        );
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
        and receipt.project_message_id in (
          select id from public.project_messages where project_id = target_resource_id and message_type = 'user'
        );
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
      (pm.id is not null and pm.message_type = 'user' and public.is_project_member(pm.project_id))
      or (tm.id is not null and tm.message_type = 'user' and public.can_access_task(tm.task_id))
    )
$$;

-- Requested feedback is the workflow gate. A task may be active or completed,
-- while ownership, project membership and one-time submission remain enforced.
create or replace function public.submit_lead_feedback(target_task_id uuid, submitted_answers jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; submission_id uuid; field jsonb; answer jsonb; admin_user record; actor_name text; project_name_value text; current_client uuid;
begin
  current_client := public.current_client_id();
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null
    or current_client is null
    or task_row.assignee_id <> current_client
    or not exists(
      select 1 from public.project_clients
      where project_id = task_row.project_id and client_id = current_client
    )
  then
    raise exception 'Feedback form is not available';
  end if;
  if task_row.feedback_state = 'submitted'
    or exists(select 1 from public.form_submissions where task_id = target_task_id)
  then
    raise exception 'Feedback has already been submitted';
  end if;
  if task_row.feedback_state <> 'requested'
    or task_row.feedback_requested_at is null
    or task_row.form_schema is null
  then
    raise exception 'Feedback form is not available';
  end if;
  for field in select value from jsonb_array_elements(task_row.form_schema) loop
    answer := submitted_answers -> (field ->> 'id');
    if coalesce((field ->> 'required')::boolean, false)
      and (answer is null or answer = 'null'::jsonb or answer = '""'::jsonb or answer = '[]'::jsonb)
    then
      raise exception '% is required', field ->> 'label';
    end if;
    if field ->> 'type' in ('radio', 'select')
      and answer is not null
      and not ((field -> 'options') ? (answer #>> '{}'))
    then
      raise exception 'Invalid answer for %', field ->> 'label';
    end if;
  end loop;
  insert into public.form_submissions(task_id, submitted_by, answers)
  values (target_task_id, auth.uid(), submitted_answers)
  returning id into submission_id;
  update public.project_tasks
    set feedback_state = 'submitted', feedback_submitted_at = now()
    where id = target_task_id;
  select full_name into actor_name from public.users where id = auth.uid();
  select u.id, u.email into admin_user from public.projects p join public.users u on u.id = p.owner_id where p.id = task_row.project_id;
  select project_name into project_name_value from public.projects where id = task_row.project_id;
  insert into public.task_activity(task_id, actor_id, event_type, body)
  values (target_task_id, auth.uid(), 'feedback.submitted', actor_name || ' submitted feedback');
  insert into public.notifications(user_id, project_id, task_id, type, title, body, target_url)
  values (admin_user.id, task_row.project_id, target_task_id, 'feedback.submitted', actor_name || ' submitted feedback', 'Feedback was submitted for ' || task_row.title || '.', '/admin/projects/' || task_row.project_id || '/tasks/' || target_task_id || '#feedback');
  insert into public.email_outbox(user_id, project_id, task_id, email_type, recipient_email, template_data, dedupe_key)
  values (admin_user.id, task_row.project_id, target_task_id, 'feedback.submitted', admin_user.email, jsonb_build_object('clientName', actor_name, 'projectName', project_name_value, 'taskTitle', task_row.title, 'targetUrl', '/admin/projects/' || task_row.project_id || '/tasks/' || target_task_id || '#feedback'), 'feedback-submitted:' || target_task_id)
  on conflict (dedupe_key) do nothing;
  return submission_id;
end;
$$;

commit;
