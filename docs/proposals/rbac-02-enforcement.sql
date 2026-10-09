-- PROPOSAL ONLY; not applied. Execute only with approved application cutover.
-- New migration, never rewrite a historical migration.
-- Depends on rbac-01-foundation.sql and explicit bootstrap approval.
begin;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.is_admin()'::regprocedure)) <> '54ffc67bba19b8a95d3932ba86e61463' then raise exception 'Re-audit changed function: is_admin'; end if;
end $guard$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.admin_accounts a join public.users u on u.id=a.user_id where a.user_id=auth.uid() and a.status='active' and u.role='admin');
$$;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.is_project_member(uuid)'::regprocedure)) <> '7e1fc3f5e89bad17c31722b23fda3965' then raise exception 'Re-audit changed function: is_project_member'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.is_project_member(target_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_admin_permission('projects.view') or exists(
    select 1 from public.project_clients pc
    join public.clients c on c.id = pc.client_id
    where pc.project_id = target_project_id and c.auth_user_id = auth.uid() and c.status <> 'disabled'
  )
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.can_access_task(uuid)'::regprocedure)) <> 'd51a49ddaef69d778979e58947345c2d' then raise exception 'Re-audit changed function: can_access_task'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.can_access_task(target_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_admin_permission('tasks.view') or exists(
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
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.get_portal_bootstrap()'::regprocedure)) <> '1c2a2efcee798609c6711bcd48597334' then raise exception 'Re-audit changed function: get_portal_bootstrap'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.get_portal_bootstrap()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with viewer as (
    select
      users.id,
      users.role,
      coalesce(admin_settings.display_name, users.full_name) as display_name
    from public.users
    left join public.admin_settings on admin_settings.user_id = users.id
    where users.id = auth.uid()
      and (
        (users.role = 'admin' and public.is_admin())
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
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.get_admin_people(text,integer,integer)'::regprocedure)) <> '079e85ebf3c85a003ccb1a339377e49d' then raise exception 'Re-audit changed function: get_admin_people'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.get_admin_people(search_text text DEFAULT ''::text, page_number integer DEFAULT 1, page_size integer DEFAULT 25)
 RETURNS TABLE(id uuid, auth_user_id uuid, full_name text, email text, company text, title text, phone text, status client_status, created_at timestamp with time zone, last_login_at timestamp with time zone, project_count bigint, project_names text[], first_project_id uuid, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  normalized_search text := trim(coalesce(search_text, ''));
  safe_page integer := greatest(coalesce(page_number, 1), 1);
  safe_size integer := least(greatest(coalesce(page_size, 25), 1), 100);
begin
  if auth.uid() is null or not (public.has_admin_permission('clients.view')) then
    raise exception 'Administrator access required';
  end if;

  return query
  with filtered as (
    select client.id
    from public.clients client
    where normalized_search = ''
      or client.full_name ilike '%' || normalized_search || '%'
      or client.email ilike '%' || normalized_search || '%'
      or coalesce(client.company, '') ilike '%' || normalized_search || '%'
      or exists (
        select 1
        from public.project_clients membership
        join public.projects project on project.id = membership.project_id
        where membership.client_id = client.id
          and project.project_name ilike '%' || normalized_search || '%'
      )
  ),
  grouped as (
    select
      client.id,
      client.auth_user_id,
      client.full_name,
      client.email,
      client.company,
      client.title,
      client.phone,
      client.status,
      client.created_at,
      auth_user.last_sign_in_at,
      count(distinct project.id)::bigint as project_count,
      coalesce(
        array_agg(distinct project.project_name order by project.project_name)
          filter (where project.id is not null),
        array[]::text[]
      ) as project_names,
      min(project.id::text)::uuid as first_project_id
    from filtered
    join public.clients client on client.id = filtered.id
    left join auth.users auth_user on auth_user.id = client.auth_user_id
    left join public.project_clients membership on membership.client_id = client.id
    left join public.projects project on project.id = membership.project_id
    group by client.id, auth_user.last_sign_in_at
  )
  select
    grouped.id,
    grouped.auth_user_id,
    grouped.full_name,
    grouped.email,
    grouped.company,
    grouped.title,
    grouped.phone,
    grouped.status,
    grouped.created_at,
    grouped.last_sign_in_at,
    grouped.project_count,
    grouped.project_names,
    grouped.first_project_id,
    count(*) over()::bigint as total_count
  from grouped
  order by lower(grouped.full_name), grouped.id
  limit safe_size
  offset (safe_page - 1) * safe_size;
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.get_admin_client_last_login(uuid)'::regprocedure)) <> '98248d2060f7961d806d142840c466fa' then raise exception 'Re-audit changed function: get_admin_client_last_login'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.get_admin_client_last_login(target_client_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  result timestamptz;
begin
  if auth.uid() is null or not (public.has_admin_permission('clients.view')) then
    raise exception 'Administrator access required';
  end if;

  select auth_user.last_sign_in_at
  into result
  from public.clients client
  left join auth.users auth_user on auth_user.id = client.auth_user_id
  where client.id = target_client_id;

  return result;
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.seed_default_template()'::regprocedure)) <> '9f6e2c2bffa1a31198a198743176fb9c' then raise exception 'Re-audit changed function: seed_default_template'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.seed_default_template()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare template_uuid uuid;
begin
  if not (public.has_admin_permission('templates.create')) then raise exception 'Administrator access required'; end if;
  select id into template_uuid from public.templates where name = 'Lead Assignment' and archived_at is null order by created_at limit 1;
  if template_uuid is null then
    insert into public.templates(name, description, created_by)
    values ('Lead Assignment', 'Assign one lead, collect feedback, and keep the entire conversation together.', auth.uid())
    returning id into template_uuid;
  end if;

  if not exists(select 1 from public.template_tasks where template_id = template_uuid) then
    insert into public.template_tasks(
      template_id, title, description, task_type, sort_order, client_visible,
      requires_completion, form_schema, feedback_enabled, feedback_delay_value, feedback_delay_unit
    ) values (
      template_uuid, 'Lead Assignment', '<h2>Lead details</h2><p>Add the lead information here before activating this task.</p>',
      'standard', 1, true, true,
      '[{"id":"lead-name","label":"Lead Name","type":"text","required":true},{"id":"feedback","label":"Feedback","type":"textarea","required":true},{"id":"rating","label":"Rating","type":"radio","required":true,"options":["Excellent","Good","Average","Poor"]},{"id":"connection","label":"Lead Connection","type":"select","required":true,"options":["Yes","No"]},{"id":"score","label":"Lead Score","type":"select","required":true,"options":["1","2","3","4","5"]}]'::jsonb,
      true, 1, 'days'
    );
  end if;
  return template_uuid;
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.import_template_tasks(uuid,uuid,uuid[],task_status)'::regprocedure)) <> 'dd772e87b475c9bca120168681e00c18' then raise exception 'Re-audit changed function: import_template_tasks'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.import_template_tasks(target_project_id uuid, target_template_id uuid, selected_template_task_ids uuid[], initial_task_status task_status DEFAULT 'draft'::task_status)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare template_task_row public.template_tasks%rowtype; created_task_id uuid; primary_client_id uuid; primary_client_name text;
begin
  if not (public.has_admin_permission('tasks.create') and public.has_admin_permission('tasks.assign') and public.has_admin_permission('templates.view')) then raise exception 'Administrator access required'; end if;
  select c.id, c.full_name into primary_client_id, primary_client_name
  from public.project_clients pc join public.clients c on c.id = pc.client_id
  where pc.project_id = target_project_id order by pc.is_primary desc limit 1;

  for template_task_row in
    select * from public.template_tasks
    where template_id = target_template_id and id = any(selected_template_task_ids)
    order by sort_order
  loop
    insert into public.project_tasks(
      project_id, template_task_id, title, description, assignee_id, task_type, status,
      client_visible, requires_completion, form_schema, activated_at, feedback_enabled,
      feedback_delay_value, feedback_delay_unit, feedback_state
    ) values (
      target_project_id, template_task_row.id, template_task_row.title,
      template_task_row.description, primary_client_id, 'standard', initial_task_status,
      template_task_row.client_visible, template_task_row.requires_completion, template_task_row.form_schema,
      case when initial_task_status = 'active' then now() end, template_task_row.feedback_enabled,
      template_task_row.feedback_delay_value, template_task_row.feedback_delay_unit,
      case when template_task_row.feedback_enabled then 'pending' else 'not_configured' end
    ) returning id into created_task_id;
    insert into public.task_threads(task_id) values (created_task_id);
    insert into public.task_activity(task_id, actor_id, event_type, body)
    values (created_task_id, auth.uid(), 'task.imported', 'imported the Lead Assignment workflow');
    return next created_task_id;
  end loop;
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.create_project_bundle(text,uuid,text,text,text)'::regprocedure)) <> '305c31d5ae33e92c6ac430320d4c382c' then raise exception 'Re-audit changed function: create_project_bundle'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.create_project_bundle(project_name_input text, client_auth_user_id_input uuid, client_full_name_input text, client_email_input text, client_company_input text DEFAULT NULL::text)
 RETURNS TABLE(project_id uuid, client_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare created_project_id uuid; resolved_client_id uuid;
begin
  if not (public.has_admin_permission('projects.create') and public.has_admin_permission('clients.create') and public.has_admin_permission('clients.edit') and public.has_admin_permission('invitations.send')) then raise exception 'Administrator access required'; end if;
  insert into public.clients(auth_user_id, full_name, email, company, status)
  values (client_auth_user_id_input, trim(client_full_name_input), lower(trim(client_email_input)), nullif(trim(client_company_input), ''), 'invited')
  on conflict (email) do update set
    auth_user_id = coalesce(public.clients.auth_user_id, excluded.auth_user_id),
    full_name = excluded.full_name,
    company = coalesce(excluded.company, public.clients.company)
  returning id into resolved_client_id;
  insert into public.projects(project_name, owner_id) values (trim(project_name_input), auth.uid()) returning id into created_project_id;
  insert into public.project_clients(project_id, client_id, is_primary) values (created_project_id, resolved_client_id, true);
  insert into public.project_threads(project_id) values (created_project_id);
  insert into public.notifications(user_id, project_id, type, title, body, target_url)
  values (client_auth_user_id_input, created_project_id, 'project.invited', 'Welcome to Leadsedge Portal', 'You were invited to ' || trim(project_name_input) || '.', '/portal');
  return query select created_project_id, resolved_client_id;
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.request_feedback_now(uuid)'::regprocedure)) <> '669d8b10e0cf8f9a169edbed5a5a3bbc' then raise exception 'Re-audit changed function: request_feedback_now'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.request_feedback_now(target_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare task_row public.project_tasks%rowtype; client_user_id uuid; request_key text;
begin
  if not (public.has_admin_permission('tasks.edit')) then raise exception 'Administrator access required'; end if;
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null or task_row.status <> 'completed' or task_row.feedback_state = 'submitted' then
    raise exception 'Feedback cannot be requested for this task';
  end if;
  if task_row.feedback_state = 'requested' then return; end if;
  if task_row.form_schema is null then raise exception 'Feedback form is not configured'; end if;
  request_key := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS');
  update public.project_tasks set feedback_enabled = true, feedback_state = 'requested', feedback_requested_at = now(), feedback_scheduled_for = null where id = target_task_id returning * into task_row;
  select auth_user_id into client_user_id from public.clients where id = task_row.assignee_id;
  if client_user_id is not null then
    insert into public.notifications(user_id, project_id, task_id, type, title, body, target_url)
    values (client_user_id, task_row.project_id, target_task_id, 'feedback.requested', 'Feedback requested', 'Please share feedback for ' || task_row.title || '.', '/portal/tasks/' || target_task_id);
  end if;
  insert into public.task_activity(task_id, actor_id, event_type, body) values (target_task_id, auth.uid(), 'feedback.requested', 'requested the feedback form immediately');
  insert into public.automation_runs(job_type, resource_type, resource_id, dedupe_key, status, detail, completed_at)
  values ('feedback.request', 'task', target_task_id, 'feedback-manual:' || target_task_id || ':' || request_key, 'succeeded', jsonb_build_object('source', 'manual'), now());
  perform public.queue_feedback_email(task_row, request_key);
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.cancel_feedback_request(uuid)'::regprocedure)) <> '6941d21dc0e792be35836691df5963f6' then raise exception 'Re-audit changed function: cancel_feedback_request'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.cancel_feedback_request(target_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare task_row public.project_tasks%rowtype;
begin
  if not (public.has_admin_permission('tasks.edit')) then raise exception 'Administrator access required'; end if;
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null or task_row.feedback_state not in ('waiting', 'requested') then raise exception 'There is no cancellable feedback request'; end if;
  update public.project_tasks set feedback_state = 'cancelled', feedback_scheduled_for = null where id = target_task_id;
  update public.email_outbox set status = 'cancelled' where task_id = target_task_id and email_type = 'feedback.requested' and status in ('pending', 'failed');
  insert into public.task_activity(task_id, actor_id, event_type, body) values (target_task_id, auth.uid(), 'feedback.cancelled', 'cancelled the feedback request');
  insert into public.automation_runs(job_type, resource_type, resource_id, dedupe_key, status, detail, completed_at)
  values ('feedback.request', 'task', target_task_id, 'feedback-cancel:' || target_task_id || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'), 'cancelled', jsonb_build_object('source', 'manual'), now());
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.save_availability(text,smallint,smallint,integer,smallint,jsonb)'::regprocedure)) <> '089541fd9e62818375a5c5ac73b2252a' then raise exception 'Re-audit changed function: save_availability'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.save_availability(timezone_input text, duration_input smallint, buffer_input smallint, notice_input integer, advance_input smallint, rules_input jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rule jsonb;
begin
  if not (public.has_admin_permission('meetings.manage')) then raise exception 'Administrator access required'; end if;
  if timezone_input is null or not exists(select 1 from pg_timezone_names where name = timezone_input) then raise exception 'Invalid timezone'; end if;
  insert into public.availability_settings(user_id, timezone, meeting_duration_minutes, buffer_minutes, minimum_notice_minutes, maximum_advance_days)
  values (auth.uid(), timezone_input, duration_input, buffer_input, notice_input, advance_input)
  on conflict (user_id) do update set timezone = excluded.timezone, meeting_duration_minutes = excluded.meeting_duration_minutes, buffer_minutes = excluded.buffer_minutes, minimum_notice_minutes = excluded.minimum_notice_minutes, maximum_advance_days = excluded.maximum_advance_days;
  delete from public.availability_rules where user_id = auth.uid();
  for rule in select value from jsonb_array_elements(rules_input) loop
    insert into public.availability_rules(user_id, weekday, enabled, start_time, end_time)
    values (auth.uid(), (rule->>'weekday')::smallint, coalesce((rule->>'enabled')::boolean, false), (rule->>'startTime')::time, (rule->>'endTime')::time);
  end loop;
  update public.admin_settings set timezone = timezone_input where user_id = auth.uid();
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.cancel_meeting(uuid,text)'::regprocedure)) <> 'b8491fc93ee6894f85fb23ad141a2c24' then raise exception 'Re-audit changed function: cancel_meeting'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.cancel_meeting(target_meeting_id uuid, reason_input text DEFAULT NULL::text)
 RETURNS meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare meeting_row public.meetings%rowtype; client_row public.clients%rowtype; project_name_value text; actor_name text;
begin
  if not public.admin_permission_gate('meetings.manage') then raise exception 'Meeting access denied' using errcode='42501'; end if;
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
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.mark_conversation_read(text,uuid)'::regprocedure)) <> '6be285122661bc7f8acde107216ba750' then raise exception 'Re-audit changed function: mark_conversation_read'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.mark_conversation_read(target_kind text, target_resource_id uuid)
 RETURNS TABLE(read_messages integer, read_notifications integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare current_user_id uuid := auth.uid(); message_total integer := 0; notification_total integer := 0;
begin
  if not public.admin_permission_gate('messages.view') then raise exception 'Message access denied' using errcode='42501'; end if;
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
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.get_unread_message_count()'::regprocedure)) <> '9b001fba12bb586d65d1c1f60d449398' then raise exception 'Re-audit changed function: get_unread_message_count'; end if;
end $guard$;
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
  where public.admin_permission_gate('messages.view') and receipt.recipient_id = auth.uid()
    and receipt.read_at is null
    and (
      (pm.id is not null and pm.message_type = 'user' and public.is_project_member(pm.project_id))
      or (tm.id is not null and tm.message_type = 'user' and public.can_access_task(tm.task_id))
    )
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.delete_project_bundle_admin(uuid,boolean,text,uuid)'::regprocedure)) <> '5198e932f4dabfc3b7ea18e74c370be9' then raise exception 'Re-audit changed function: delete_project_bundle_admin'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.delete_project_bundle_admin(target_project_id uuid, delete_client boolean, expected_project_name text, requesting_admin_id uuid)
 RETURNS TABLE(project_deleted boolean, client_deleted boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare project_row public.projects%rowtype; target_client_id uuid; target_auth_user_id uuid; remaining_projects integer; target_role public.user_role;
begin
  if not leadsedge_private.has_permission(requesting_admin_id,'projects.delete')
     or (delete_client and not leadsedge_private.has_permission(requesting_admin_id,'clients.delete'))
  then raise exception 'Delete permission required' using errcode='42501'; end if;
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists(select 1 from public.users where id = requesting_admin_id and role = 'admin') then raise exception 'Administrator access required'; end if;
  select * into project_row from public.projects where id = target_project_id for update;
  if project_row.id is null or project_row.project_name <> expected_project_name then raise exception 'Project confirmation did not match'; end if;
  select c.id, c.auth_user_id, u.role into target_client_id, target_auth_user_id, target_role
  from public.project_clients pc join public.clients c on c.id = pc.client_id
  left join public.users u on u.id = c.auth_user_id
  where pc.project_id = target_project_id order by pc.is_primary desc limit 1;
  if delete_client then
    if target_client_id is null then raise exception 'Project has no client'; end if;
    select count(*) into remaining_projects from public.project_clients where client_id = target_client_id and project_id <> target_project_id;
    if remaining_projects > 0 then raise exception 'Client belongs to another project'; end if;
    if target_auth_user_id = requesting_admin_id or target_role = 'admin' then raise exception 'Administrator accounts cannot be deleted'; end if;
  end if;
  delete from public.projects where id = target_project_id;
  if delete_client then
    delete from public.clients where id = target_client_id;
    if target_auth_user_id is not null then delete from auth.users where id = target_auth_user_id; end if;
  end if;
  return query select true, delete_client;
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.on_project_message_created()'::regprocedure)) <> '90b54616c9dacd78553a115d3542d1f1' then raise exception 'Re-audit changed function: on_project_message_created'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.on_project_message_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if recipient_id is not null and recipient_id <> new.sender_id
     and (sender_role = 'admin' or leadsedge_private.has_permission(recipient_id,'messages.view')) then
    insert into public.message_read_receipts(recipient_id, project_message_id)
    values (recipient_id, new.id)
    on conflict do nothing;
    insert into public.notifications(user_id, project_id, thread_id, message_id, type, title, body, target_url)
    values (recipient_id, new.project_id, new.thread_id, new.id, 'project.message', 'New project message', sender_name || ' sent a message in ' || project_name_value || '.',
      case when sender_role = 'admin' then '/portal/messages' else '/admin/projects/' || new.project_id || '/chat' end);
  end if;
  return new;
end;
$function$
;

-- Fail closed if Frankfurt changed since this audited snapshot.
do $guard$ begin
 if md5(pg_get_functiondef('public.on_task_message_created()'::regprocedure)) <> '2032998abb1436ccf7b8fa1428ad2486' then raise exception 'Re-audit changed function: on_task_message_created'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.on_task_message_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if recipient_id is not null and recipient_id <> new.sender_id
     and (sender_role = 'admin' or leadsedge_private.has_permission(recipient_id,'messages.view')) then
    insert into public.message_read_receipts(recipient_id, task_message_id)
    values (recipient_id, new.id)
    on conflict do nothing;
    insert into public.notifications(user_id, project_id, task_id, thread_id, message_id, type, title, body, target_url)
    values (recipient_id, task_project_id, new.task_id, new.thread_id, new.id, 'task.message', 'New task comment', sender_name || ' commented on ' || task_title || '.',
      case when sender_role = 'admin' then '/portal/tasks/' || new.task_id || '#conversation' else '/admin/projects/' || task_project_id || '/tasks/' || new.task_id || '#conversation' end);
  end if;
  return new;
end;
$function$
;

create policy rbac_select_gate on public.clients as restrictive for select to authenticated
 using (public.admin_permission_gate('clients.view'));

create policy rbac_insert_gate on public.clients as restrictive for insert to authenticated
 with check (public.admin_permission_gate('clients.create'));

create policy rbac_update_gate on public.clients as restrictive for update to authenticated
 using (public.admin_permission_gate('clients.edit')) with check (public.admin_permission_gate('clients.edit'));

create policy rbac_delete_gate on public.clients as restrictive for delete to authenticated
 using (public.admin_permission_gate('clients.delete'));

create policy rbac_select_gate on public.projects as restrictive for select to authenticated
 using (public.admin_permission_gate('projects.view'));

create policy rbac_insert_gate on public.projects as restrictive for insert to authenticated
 with check (public.admin_permission_gate('projects.create'));

create policy rbac_update_gate on public.projects as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.projects as restrictive for delete to authenticated
 using (public.admin_permission_gate('projects.delete'));

create policy rbac_select_gate on public.project_clients as restrictive for select to authenticated
 using (public.admin_permission_gate('projects.view'));

create policy rbac_insert_gate on public.project_clients as restrictive for insert to authenticated
 with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_update_gate on public.project_clients as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.project_clients as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.project_tasks as restrictive for select to authenticated
 using (public.admin_permission_gate('tasks.view'));

create policy rbac_insert_gate on public.project_tasks as restrictive for insert to authenticated
 with check (public.admin_permission_gate('tasks.create'));

create policy rbac_update_gate on public.project_tasks as restrictive for update to authenticated
 using (public.admin_permission_gate('tasks.edit')) with check (public.admin_permission_gate('tasks.edit'));

create policy rbac_delete_gate on public.project_tasks as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.templates as restrictive for select to authenticated
 using (public.admin_permission_gate('templates.view'));

create policy rbac_insert_gate on public.templates as restrictive for insert to authenticated
 with check (public.admin_permission_gate('templates.create'));

create policy rbac_update_gate on public.templates as restrictive for update to authenticated
 using (public.admin_permission_gate('templates.edit')) with check (public.admin_permission_gate('templates.edit'));

create policy rbac_delete_gate on public.templates as restrictive for delete to authenticated
 using (public.admin_permission_gate('templates.delete'));

create policy rbac_select_gate on public.template_tasks as restrictive for select to authenticated
 using (public.admin_permission_gate('templates.view'));

create policy rbac_insert_gate on public.template_tasks as restrictive for insert to authenticated
 with check (public.admin_permission_gate('templates.edit'));

create policy rbac_update_gate on public.template_tasks as restrictive for update to authenticated
 using (public.admin_permission_gate('templates.edit')) with check (public.admin_permission_gate('templates.edit'));

create policy rbac_delete_gate on public.template_tasks as restrictive for delete to authenticated
 using (public.admin_permission_gate('templates.edit'));

create policy rbac_select_gate on public.project_threads as restrictive for select to authenticated
 using (public.admin_permission_gate('messages.view'));

create policy rbac_insert_gate on public.project_threads as restrictive for insert to authenticated
 with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_update_gate on public.project_threads as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.project_threads as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.task_threads as restrictive for select to authenticated
 using (public.admin_permission_gate('messages.view'));

create policy rbac_insert_gate on public.task_threads as restrictive for insert to authenticated
 with check (public.admin_permission_gate('tasks.create'));

create policy rbac_update_gate on public.task_threads as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.task_threads as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.project_messages as restrictive for select to authenticated
 using (public.admin_permission_gate('messages.view'));

create policy rbac_insert_gate on public.project_messages as restrictive for insert to authenticated
 with check (public.admin_permission_gate('messages.send'));

create policy rbac_update_gate on public.project_messages as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.project_messages as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.task_messages as restrictive for select to authenticated
 using (public.admin_permission_gate('messages.view'));

create policy rbac_insert_gate on public.task_messages as restrictive for insert to authenticated
 with check (public.admin_permission_gate('messages.send'));

create policy rbac_update_gate on public.task_messages as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.task_messages as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.project_activity as restrictive for select to authenticated
 using (public.admin_permission_gate('projects.view'));

create policy rbac_insert_gate on public.project_activity as restrictive for insert to authenticated
 with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_update_gate on public.project_activity as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.project_activity as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.task_activity as restrictive for select to authenticated
 using (public.admin_permission_gate('tasks.view'));

create policy rbac_insert_gate on public.task_activity as restrictive for insert to authenticated
 with check (public.admin_permission_gate('tasks.edit'));

create policy rbac_update_gate on public.task_activity as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.task_activity as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.form_submissions as restrictive for select to authenticated
 using (public.admin_permission_gate('tasks.view'));

create policy rbac_insert_gate on public.form_submissions as restrictive for insert to authenticated
 with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_update_gate on public.form_submissions as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.form_submissions as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.meetings as restrictive for select to authenticated
 using (public.admin_permission_gate('meetings.view'));

create policy rbac_insert_gate on public.meetings as restrictive for insert to authenticated
 with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_update_gate on public.meetings as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.meetings as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.availability_rules as restrictive for select to authenticated
 using (public.admin_permission_gate('meetings.view'));

create policy rbac_insert_gate on public.availability_rules as restrictive for insert to authenticated
 with check (public.admin_permission_gate('meetings.manage'));

create policy rbac_update_gate on public.availability_rules as restrictive for update to authenticated
 using (public.admin_permission_gate('meetings.manage')) with check (public.admin_permission_gate('meetings.manage'));

create policy rbac_delete_gate on public.availability_rules as restrictive for delete to authenticated
 using (public.admin_permission_gate('meetings.manage'));

create policy rbac_select_gate on public.availability_settings as restrictive for select to authenticated
 using (public.admin_permission_gate('meetings.view'));

create policy rbac_insert_gate on public.availability_settings as restrictive for insert to authenticated
 with check (public.admin_permission_gate('meetings.manage'));

create policy rbac_update_gate on public.availability_settings as restrictive for update to authenticated
 using (public.admin_permission_gate('meetings.manage')) with check (public.admin_permission_gate('meetings.manage'));

create policy rbac_delete_gate on public.availability_settings as restrictive for delete to authenticated
 using (public.admin_permission_gate('meetings.manage'));

create policy rbac_select_gate on public.calendar_connections as restrictive for select to authenticated
 using (public.admin_permission_gate('meetings.view'));

create policy rbac_insert_gate on public.calendar_connections as restrictive for insert to authenticated
 with check (public.admin_permission_gate('meetings.manage'));

create policy rbac_update_gate on public.calendar_connections as restrictive for update to authenticated
 using (public.admin_permission_gate('meetings.manage')) with check (public.admin_permission_gate('meetings.manage'));

create policy rbac_delete_gate on public.calendar_connections as restrictive for delete to authenticated
 using (public.admin_permission_gate('meetings.manage'));

create policy rbac_select_gate on public.admin_settings as restrictive for select to authenticated
 using (public.admin_permission_gate('settings.view'));

create policy rbac_insert_gate on public.admin_settings as restrictive for insert to authenticated
 with check (public.admin_permission_gate('settings.manage'));

create policy rbac_update_gate on public.admin_settings as restrictive for update to authenticated
 using (public.admin_permission_gate('settings.manage')) with check (public.admin_permission_gate('settings.manage'));

create policy rbac_delete_gate on public.admin_settings as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.email_deliveries as restrictive for select to authenticated
 using (public.admin_permission_gate('settings.view'));

create policy rbac_insert_gate on public.email_deliveries as restrictive for insert to authenticated
 with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_update_gate on public.email_deliveries as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.email_deliveries as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.email_outbox as restrictive for select to authenticated
 using (public.admin_permission_gate('settings.view'));

create policy rbac_insert_gate on public.email_outbox as restrictive for insert to authenticated
 with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_update_gate on public.email_outbox as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.email_outbox as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.automation_runs as restrictive for select to authenticated
 using (public.admin_permission_gate('settings.view'));

create policy rbac_insert_gate on public.automation_runs as restrictive for insert to authenticated
 with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_update_gate on public.automation_runs as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.automation_runs as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

create policy rbac_select_gate on public.message_read_receipts as restrictive for select to authenticated
 using (public.admin_permission_gate('messages.view'));

create policy rbac_insert_gate on public.message_read_receipts as restrictive for insert to authenticated
 with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_update_gate on public.message_read_receipts as restrictive for update to authenticated
 using (public.admin_permission_gate('__never_granted__')) with check (public.admin_permission_gate('__never_granted__'));

create policy rbac_delete_gate on public.message_read_receipts as restrictive for delete to authenticated
 using (public.admin_permission_gate('__never_granted__'));

-- Profile reads: own active-admin profile, client records, or admin-management permission.
create policy rbac_profile_read on public.users as restrictive for select to authenticated
 using(public.admin_permission_gate('__never_granted__') or (id=auth.uid() and public.is_admin())
 or (role='client' and public.has_admin_permission('clients.view'))
 or public.has_admin_permission('admins.view'));
create policy rbac_profile_update on public.users as restrictive for update to authenticated
 using((id=auth.uid() and public.has_admin_permission('settings.manage')) or (role='client' and public.has_admin_permission('clients.edit')))
 with check((id=auth.uid() and public.has_admin_permission('settings.manage')) or (role='client' and public.has_admin_permission('clients.edit')));
-- Column privileges prevent every browser role escalation even for a Super Admin.
revoke update on public.users from authenticated,anon;
grant update(full_name) on public.users to authenticated;

-- Notifications are metadata too; map each current event family. Unknown admin
-- types deny until deliberately mapped. Existing client policies still govern clients.
create policy rbac_notification_read on public.notifications as restrictive for select to authenticated using (
 public.admin_permission_gate(case when type in ('task.message','project.message') then 'messages.view'
 when type like 'task.%' or type like 'feedback.%' then 'tasks.view'
 when type like 'meeting.%' then 'meetings.view' when type like 'project.%' then 'projects.view' else '__never_granted__' end));
create policy rbac_notification_update on public.notifications as restrictive for update to authenticated
 using(public.admin_permission_gate(case when type in ('task.message','project.message') then 'messages.view' when type like 'task.%' or type like 'feedback.%' then 'tasks.view' when type like 'meeting.%' then 'meetings.view' when type like 'project.%' then 'projects.view' else '__never_granted__' end));
-- Move task activation notification writes into a validated task RPC in cutover.
create policy rbac_notification_insert on public.notifications as restrictive for insert to authenticated with check(false);

-- Correct resource/thread correlation; membership and author checks are unchanged.
alter policy "members send project messages" on public.project_messages with check(
 sender_id=auth.uid() and message_type='user' and public.is_project_member(project_id)
 and exists(select 1 from public.project_threads thread where thread.id=project_messages.thread_id and thread.project_id=project_messages.project_id));
alter policy "members send task messages" on public.task_messages with check(
 sender_id=auth.uid() and message_type='user' and public.can_access_task(task_id)
 and exists(select 1 from public.task_threads thread where thread.id=task_messages.thread_id and thread.task_id=task_messages.task_id));

-- No first-admin re-entry after explicit bootstrap.
revoke all on function public.setup_first_admin(text,text) from public,anon,authenticated,service_role;

-- A role-only RPC exposed to PUBLIC defeats otherwise correct RLS.
revoke all on function public.activate_current_client() from public,anon;
revoke all on function public.book_client_meeting(uuid,timestamp with time zone,text,text,text) from public,anon;
revoke all on function public.can_access_task(uuid) from public,anon;
revoke all on function public.cancel_feedback_request(uuid) from public,anon;
revoke all on function public.cancel_meeting(uuid,text) from public,anon;
revoke all on function public.complete_project_task(uuid) from public,anon;
revoke all on function public.create_project_bundle(text,uuid,text,text,text) from public,anon;
revoke all on function public.current_client_id() from public,anon;
revoke all on function public.delete_project_bundle_admin(uuid,boolean,text,uuid) from public,anon;
revoke all on function public.get_admin_client_last_login(uuid) from public,anon;
revoke all on function public.get_admin_people(text,integer,integer) from public,anon;
revoke all on function public.get_unread_message_count() from public,anon;
revoke all on function public.import_template_tasks(uuid,uuid,uuid[],task_status) from public,anon;
revoke all on function public.is_admin() from public,anon;
revoke all on function public.is_project_member(uuid) from public,anon;
revoke all on function public.mark_conversation_read(text,uuid) from public,anon;
revoke all on function public.process_due_feedback_requests() from public,anon;
revoke all on function public.process_due_feedback_requests_job() from public,anon;
revoke all on function public.queue_feedback_email(project_tasks,text) from public,anon;
revoke all on function public.request_feedback_now(uuid) from public,anon;
revoke all on function public.save_availability(text,smallint,smallint,integer,smallint,jsonb) from public,anon;
revoke all on function public.seed_default_template() from public,anon;
revoke all on function public.submit_form_task(uuid,jsonb) from public,anon;
revoke all on function public.submit_lead_feedback(uuid,jsonb) from public,anon;

-- Proposed explicit backfill. DO NOT execute without approval of BOTH accounts.
do $$ begin
 if (select count(*) from public.users where role='admin')<>2
 or not exists(select 1 from public.users where id='dbf41fdf-2b4a-4f8c-a8da-6b34350dbc65' and email='adeelahmed@broadigo.com' and role='admin')
 or not exists(select 1 from public.users where id='c987cadf-3098-49d6-bd26-eddac2de9e99' and email='admin.frankfurt@performance.example.com' and role='admin') then raise exception 'Re-audit administrator identities'; end if;
end $$;
insert into public.admin_accounts(user_id,admin_role,status,preset_label) values
 ('dbf41fdf-2b4a-4f8c-a8da-6b34350dbc65','super_admin','active','Super Admin'),
 ('c987cadf-3098-49d6-bd26-eddac2de9e99','admin','disabled','Synthetic staging account');
insert into public.admin_access_audit(target_id,action,after_state) select user_id,'approved_migration_bootstrap',to_jsonb(a) from public.admin_accounts a;
commit;
