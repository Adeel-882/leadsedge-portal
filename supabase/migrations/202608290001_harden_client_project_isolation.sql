begin;

-- A client can read only their own project link. Membership checks continue to
-- run through the SECURITY DEFINER helper and therefore do not expose co-members.
drop policy if exists "members read project links" on public.project_clients;
create policy "members read own project links" on public.project_clients for select
  using (public.is_admin() or client_id = public.current_client_id());

-- Task conversations and activity must require both assignment and membership
-- in the task's project. Assignment alone is not sufficient tenant authority.
create or replace function public.can_access_task(target_task_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists(
    select 1
    from public.project_tasks task
    join public.clients client on client.id = task.assignee_id
    join public.project_clients membership
      on membership.project_id = task.project_id
     and membership.client_id = client.id
    where task.id = target_task_id
      and client.auth_user_id = auth.uid()
      and client.status <> 'disabled'
      and task.client_visible
      and task.status <> 'draft'
      and task.archived_at is null
  )
$$;

-- Direct RPC callers receive the same project-membership enforcement as RLS.
create or replace function public.complete_project_task(target_task_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; actor_name text; admin_user_id uuid; scheduled_for timestamptz; current_client uuid;
begin
  current_client := public.current_client_id();
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null
    or current_client is null
    or task_row.status <> 'active'
    or not task_row.requires_completion
    or task_row.assignee_id <> current_client
    or not exists(
      select 1 from public.project_clients
      where project_id = task_row.project_id and client_id = current_client
    )
  then
    raise exception 'Task is not available for completion';
  end if;
  if task_row.feedback_enabled then
    scheduled_for := now() + case task_row.feedback_delay_unit
      when 'minutes' then make_interval(mins => coalesce(task_row.feedback_delay_value, 1))
      when 'hours' then make_interval(hours => coalesce(task_row.feedback_delay_value, 1))
      else make_interval(days => coalesce(task_row.feedback_delay_value, 1))
    end;
  end if;
  update public.project_tasks
    set status = 'completed', completed_at = now(),
        feedback_state = case when feedback_enabled then 'waiting' else 'not_configured' end,
        feedback_scheduled_for = scheduled_for
    where id = target_task_id;
  select full_name into actor_name from public.users where id = auth.uid();
  insert into public.task_activity(task_id, actor_id, event_type, body)
    values (target_task_id, auth.uid(), 'lead.completed', actor_name || ' marked the lead completed');
  if task_row.feedback_enabled then
    insert into public.task_activity(task_id, actor_id, event_type, body)
      values (target_task_id, auth.uid(), 'feedback.scheduled', 'scheduled feedback for ' || scheduled_for::text);
  end if;
  select owner_id into admin_user_id from public.projects where id = task_row.project_id;
  insert into public.notifications(user_id, project_id, task_id, type, title, body, target_url)
    values (admin_user_id, task_row.project_id, target_task_id, 'task.completed', 'Lead completed', actor_name || ' completed ' || task_row.title || '.', '/admin/projects/' || task_row.project_id || '/tasks/' || target_task_id);
end;
$$;

-- Meeting reads and cancellation require the meeting's client to remain linked
-- to that same project, preventing inconsistent historical rows crossing tenants.
drop policy if exists "members read meetings" on public.meetings;
create policy "members read authorized meetings" on public.meetings for select
  using (
    owner_id = auth.uid()
    or exists(
      select 1
      from public.clients client
      join public.project_clients membership
        on membership.client_id = client.id
       and membership.project_id = meetings.project_id
      where client.id = meetings.client_id
        and client.auth_user_id = auth.uid()
        and client.status <> 'disabled'
    )
  );

create or replace function public.cancel_meeting(target_meeting_id uuid, reason_input text default null)
returns public.meetings language plpgsql security definer set search_path = public
as $$
declare meeting_row public.meetings%rowtype; client_row public.clients%rowtype; project_name_value text; actor_name text;
begin
  select * into meeting_row from public.meetings where id = target_meeting_id for update;
  select * into client_row from public.clients where id = meeting_row.client_id;
  if meeting_row.id is null or meeting_row.status <> 'scheduled' or meeting_row.start_at <= now() then raise exception 'Meeting cannot be cancelled'; end if;
  if auth.uid() <> meeting_row.owner_id and (
    auth.uid() <> client_row.auth_user_id
    or client_row.status = 'disabled'
    or not exists(
      select 1 from public.project_clients
      where project_id = meeting_row.project_id and client_id = client_row.id
    )
  ) then raise exception 'Meeting access denied'; end if;
  update public.meetings set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancellation_reason = nullif(trim(reason_input), '') where id = target_meeting_id returning * into meeting_row;
  select project_name into project_name_value from public.projects where id = meeting_row.project_id;
  select full_name into actor_name from public.users where id = auth.uid();
  insert into public.notifications(user_id, project_id, type, title, body, target_url)
    select recipient, meeting_row.project_id, 'meeting.cancelled', 'Meeting cancelled', meeting_row.title || ' was cancelled by ' || actor_name || '.', case when recipient = meeting_row.owner_id then '/admin/meetings/' || meeting_row.id else '/portal/meetings/' || meeting_row.id end
    from (values (meeting_row.owner_id), (client_row.auth_user_id)) recipients(recipient) where recipient is not null and recipient <> auth.uid();
  insert into public.project_activity(project_id, actor_id, meeting_id, event_type, body) values (meeting_row.project_id, auth.uid(), meeting_row.id, 'meeting.cancelled', actor_name || ' cancelled ' || meeting_row.title);
  insert into public.email_outbox(user_id, client_id, project_id, meeting_id, email_type, recipient_email, template_data, dedupe_key)
    values (client_row.auth_user_id, client_row.id, meeting_row.project_id, meeting_row.id, 'meeting.cancelled', client_row.email, jsonb_build_object('clientName', client_row.full_name, 'projectName', project_name_value, 'title', meeting_row.title, 'startAt', meeting_row.start_at, 'timezone', meeting_row.timezone), 'meeting-cancel-client:' || meeting_row.id)
    on conflict (dedupe_key) do nothing;
  insert into public.email_outbox(user_id, project_id, meeting_id, email_type, recipient_email, template_data, dedupe_key)
    select meeting_row.owner_id, meeting_row.project_id, meeting_row.id, 'meeting.cancelled', user_row.email, jsonb_build_object('clientName', client_row.full_name, 'projectName', project_name_value, 'title', meeting_row.title, 'startAt', meeting_row.start_at, 'timezone', meeting_row.timezone), 'meeting-cancel-admin:' || meeting_row.id
    from public.users user_row where user_row.id = meeting_row.owner_id
    on conflict (dedupe_key) do nothing;
  return meeting_row;
end;
$$;

-- The obsolete page-render scheduler wrapper must not remain callable by clients.
revoke all on function public.process_due_feedback_requests() from public, anon, authenticated;

grant execute on function public.complete_project_task(uuid) to authenticated;
grant execute on function public.cancel_meeting(uuid, text) to authenticated;

commit;
