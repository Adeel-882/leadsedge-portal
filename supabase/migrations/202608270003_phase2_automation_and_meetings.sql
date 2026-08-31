begin;

-- Phase 2 is additive. It extends the single Lead Assignment workflow and adds
-- durable scheduling primitives without changing existing project or auth data.

alter table public.project_tasks drop constraint if exists project_tasks_feedback_delay_unit_check;
alter table public.project_tasks add constraint project_tasks_feedback_delay_unit_check
  check (feedback_delay_unit is null or feedback_delay_unit in ('minutes', 'hours', 'days'));
alter table public.project_tasks drop constraint if exists project_tasks_feedback_state_check;
alter table public.project_tasks add constraint project_tasks_feedback_state_check
  check (feedback_state in ('not_configured', 'pending', 'waiting', 'requested', 'submitted', 'cancelled'));

alter table public.template_tasks drop constraint if exists template_tasks_feedback_delay_unit_check;
alter table public.template_tasks add constraint template_tasks_feedback_delay_unit_check
  check (feedback_delay_unit is null or feedback_delay_unit in ('minutes', 'hours', 'days'));

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  resource_type text not null,
  resource_id uuid,
  dedupe_key text not null unique,
  status text not null check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  detail jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.project_tasks(id) on delete cascade,
  meeting_id uuid,
  email_type text not null,
  recipient_email text not null,
  template_data jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts smallint not null default 0,
  provider_id text,
  last_error text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.availability_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  timezone text not null default 'UTC',
  meeting_duration_minutes smallint not null default 30 check (meeting_duration_minutes in (15, 30, 45, 60, 90, 120)),
  buffer_minutes smallint not null default 15 check (buffer_minutes between 0 and 120),
  minimum_notice_minutes integer not null default 120 check (minimum_notice_minutes between 0 and 43200),
  maximum_advance_days smallint not null default 60 check (maximum_advance_days between 1 and 365),
  updated_at timestamptz not null default now()
);

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  enabled boolean not null default true,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, weekday),
  check (end_time > start_time)
);

create table if not exists public.calendar_connections (
  user_id uuid primary key references public.users(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  provider_email text,
  calendar_id text not null default 'primary',
  encrypted_refresh_token text not null,
  scopes text[] not null default array[]::text[],
  status text not null default 'connected' check (status in ('connected', 'error', 'revoked')),
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  owner_display_name text not null,
  title text not null,
  description text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null,
  duration_minutes smallint not null check (duration_minutes between 5 and 480),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  google_event_id text,
  google_event_html_link text,
  created_by uuid not null references public.users(id),
  cancelled_by uuid references public.users(id),
  cancelled_at timestamptz,
  cancellation_reason text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

alter table public.email_outbox drop constraint if exists email_outbox_meeting_id_fkey;
alter table public.email_outbox add constraint email_outbox_meeting_id_fkey
  foreign key (meeting_id) references public.meetings(id) on delete cascade;

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  meeting_id uuid references public.meetings(id) on delete cascade,
  event_type text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists email_outbox_pending_idx on public.email_outbox(status, available_at) where status in ('pending', 'failed');
create index if not exists automation_runs_recent_idx on public.automation_runs(started_at desc);
create index if not exists meetings_owner_start_idx on public.meetings(owner_id, start_at) where status = 'scheduled';
create index if not exists meetings_client_start_idx on public.meetings(client_id, start_at);
create index if not exists meetings_project_start_idx on public.meetings(project_id, start_at);
create index if not exists project_activity_project_created_idx on public.project_activity(project_id, created_at desc);

drop trigger if exists availability_settings_set_updated_at on public.availability_settings;
create trigger availability_settings_set_updated_at before update on public.availability_settings for each row execute function public.set_updated_at();
drop trigger if exists availability_rules_set_updated_at on public.availability_rules;
create trigger availability_rules_set_updated_at before update on public.availability_rules for each row execute function public.set_updated_at();
drop trigger if exists calendar_connections_set_updated_at on public.calendar_connections;
create trigger calendar_connections_set_updated_at before update on public.calendar_connections for each row execute function public.set_updated_at();
drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at before update on public.meetings for each row execute function public.set_updated_at();

alter table public.automation_runs enable row level security;
alter table public.email_outbox enable row level security;
alter table public.availability_settings enable row level security;
alter table public.availability_rules enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.meetings enable row level security;
alter table public.project_activity enable row level security;

create policy "admins read automation runs" on public.automation_runs for select using (public.is_admin());
create policy "admins read email outbox" on public.email_outbox for select using (public.is_admin());
create policy "admins manage own availability settings" on public.availability_settings for all using (public.is_admin() and user_id = auth.uid()) with check (public.is_admin() and user_id = auth.uid());
create policy "members read owner availability settings" on public.availability_settings for select using (public.is_admin() or exists(select 1 from public.projects p where p.owner_id = user_id and public.is_project_member(p.id)));
create policy "admins manage own availability rules" on public.availability_rules for all using (public.is_admin() and user_id = auth.uid()) with check (public.is_admin() and user_id = auth.uid());
create policy "members read owner availability rules" on public.availability_rules for select using (public.is_admin() or exists(select 1 from public.projects p where p.owner_id = user_id and public.is_project_member(p.id)));
create policy "admins manage own calendar connection" on public.calendar_connections for all using (public.is_admin() and user_id = auth.uid()) with check (public.is_admin() and user_id = auth.uid());
create policy "members read meetings" on public.meetings for select using (owner_id = auth.uid() or exists(select 1 from public.clients c where c.id = client_id and c.auth_user_id = auth.uid()));
create policy "members read project activity" on public.project_activity for select using (public.is_project_member(project_id));

create or replace function public.queue_feedback_email(task_row public.project_tasks, event_key text)
returns void language plpgsql security definer set search_path = public
as $$
declare recipient record; project_name_value text;
begin
  select c.id, c.auth_user_id, c.email, c.full_name into recipient
  from public.clients c where c.id = task_row.assignee_id;
  select project_name into project_name_value from public.projects where id = task_row.project_id;
  if recipient.email is null then return; end if;
  insert into public.email_outbox(user_id, client_id, project_id, task_id, email_type, recipient_email, template_data, dedupe_key)
  values (recipient.auth_user_id, recipient.id, task_row.project_id, task_row.id, 'feedback.requested', recipient.email,
    jsonb_build_object('clientName', recipient.full_name, 'projectName', project_name_value, 'taskTitle', task_row.title, 'targetUrl', '/portal/tasks/' || task_row.id),
    'feedback-request:' || task_row.id || ':' || event_key)
  on conflict (dedupe_key) do nothing;
end;
$$;

create or replace function public.request_feedback_now(target_task_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; client_user_id uuid; request_key text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
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
$$;

create or replace function public.complete_project_task(target_task_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; actor_name text; admin_user_id uuid; scheduled_for timestamptz;
begin
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null or task_row.status <> 'active' or not task_row.requires_completion or task_row.assignee_id <> public.current_client_id() then raise exception 'Task is not available for completion'; end if;
  if task_row.feedback_enabled then scheduled_for := now() + case task_row.feedback_delay_unit when 'minutes' then make_interval(mins => coalesce(task_row.feedback_delay_value, 1)) when 'hours' then make_interval(hours => coalesce(task_row.feedback_delay_value, 1)) else make_interval(days => coalesce(task_row.feedback_delay_value, 1)) end; end if;
  update public.project_tasks set status = 'completed', completed_at = now(), feedback_state = case when feedback_enabled then 'waiting' else 'not_configured' end, feedback_scheduled_for = scheduled_for where id = target_task_id;
  select full_name into actor_name from public.users where id = auth.uid();
  insert into public.task_activity(task_id, actor_id, event_type, body) values (target_task_id, auth.uid(), 'lead.completed', actor_name || ' marked the lead completed');
  if task_row.feedback_enabled then insert into public.task_activity(task_id, actor_id, event_type, body) values (target_task_id, auth.uid(), 'feedback.scheduled', 'scheduled feedback for ' || scheduled_for::text); end if;
  select owner_id into admin_user_id from public.projects where id = task_row.project_id;
  insert into public.notifications(user_id, project_id, task_id, type, title, body, target_url) values (admin_user_id, task_row.project_id, target_task_id, 'task.completed', 'Lead completed', actor_name || ' completed ' || task_row.title || '.', '/admin/projects/' || task_row.project_id || '/tasks/' || target_task_id);
end;
$$;

create or replace function public.cancel_feedback_request(target_task_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null or task_row.feedback_state not in ('waiting', 'requested') then raise exception 'There is no cancellable feedback request'; end if;
  update public.project_tasks set feedback_state = 'cancelled', feedback_scheduled_for = null where id = target_task_id;
  update public.email_outbox set status = 'cancelled' where task_id = target_task_id and email_type = 'feedback.requested' and status in ('pending', 'failed');
  insert into public.task_activity(task_id, actor_id, event_type, body) values (target_task_id, auth.uid(), 'feedback.cancelled', 'cancelled the feedback request');
  insert into public.automation_runs(job_type, resource_type, resource_id, dedupe_key, status, detail, completed_at)
  values ('feedback.request', 'task', target_task_id, 'feedback-cancel:' || target_task_id || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'), 'cancelled', jsonb_build_object('source', 'manual'), now());
end;
$$;

create or replace function public.process_due_feedback_requests_job()
returns integer language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; processed integer := 0; client_user_id uuid; run_key text;
begin
  for task_row in select * from public.project_tasks where archived_at is null and feedback_state = 'waiting' and feedback_scheduled_for <= now() for update skip locked
  loop
    run_key := 'feedback-due:' || task_row.id || ':' || extract(epoch from task_row.feedback_scheduled_for)::bigint;
    if exists(select 1 from public.automation_runs where dedupe_key = run_key and status = 'succeeded') then continue; end if;
    insert into public.automation_runs(job_type, resource_type, resource_id, dedupe_key, status, detail)
    values ('feedback.request', 'task', task_row.id, run_key, 'running', jsonb_build_object('source', 'schedule', 'scheduledFor', task_row.feedback_scheduled_for))
    on conflict (dedupe_key) do nothing;
    update public.project_tasks set feedback_state = 'requested', feedback_requested_at = now(), feedback_scheduled_for = null where id = task_row.id returning * into task_row;
    select auth_user_id into client_user_id from public.clients where id = task_row.assignee_id;
    if client_user_id is not null then
      insert into public.notifications(user_id, project_id, task_id, type, title, body, target_url)
      values (client_user_id, task_row.project_id, task_row.id, 'feedback.requested', 'Feedback requested', 'Please share feedback for ' || task_row.title || '.', '/portal/tasks/' || task_row.id);
    end if;
    insert into public.task_activity(task_id, actor_id, event_type, body) values (task_row.id, null, 'feedback.requested', 'made the feedback form available after the configured delay');
    perform public.queue_feedback_email(task_row, run_key);
    update public.automation_runs set status = 'succeeded', completed_at = now() where dedupe_key = run_key;
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

create or replace function public.submit_lead_feedback(target_task_id uuid, submitted_answers jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; submission_id uuid; field jsonb; answer jsonb; admin_user record; actor_name text; project_name_value text;
begin
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null or task_row.status <> 'completed' or task_row.feedback_state <> 'requested' or task_row.assignee_id <> public.current_client_id() then raise exception 'Feedback form is not available'; end if;
  if exists(select 1 from public.form_submissions where task_id = target_task_id) then raise exception 'Feedback has already been submitted'; end if;
  for field in select value from jsonb_array_elements(coalesce(task_row.form_schema, '[]'::jsonb)) loop
    answer := submitted_answers -> (field ->> 'id');
    if coalesce((field ->> 'required')::boolean, false) and (answer is null or answer = 'null'::jsonb or answer = '""'::jsonb or answer = '[]'::jsonb) then raise exception '% is required', field ->> 'label'; end if;
    if field ->> 'type' in ('radio', 'select') and answer is not null and not ((field -> 'options') ? (answer #>> '{}')) then raise exception 'Invalid answer for %', field ->> 'label'; end if;
  end loop;
  insert into public.form_submissions(task_id, submitted_by, answers) values (target_task_id, auth.uid(), submitted_answers) returning id into submission_id;
  update public.project_tasks set feedback_state = 'submitted', feedback_submitted_at = now() where id = target_task_id;
  select full_name into actor_name from public.users where id = auth.uid();
  select u.id, u.email into admin_user from public.projects p join public.users u on u.id = p.owner_id where p.id = task_row.project_id;
  select project_name into project_name_value from public.projects where id = task_row.project_id;
  insert into public.task_activity(task_id, actor_id, event_type, body) values (target_task_id, auth.uid(), 'feedback.submitted', actor_name || ' submitted feedback');
  insert into public.notifications(user_id, project_id, task_id, type, title, body, target_url) values (admin_user.id, task_row.project_id, target_task_id, 'feedback.submitted', actor_name || ' submitted feedback', 'Feedback was submitted for ' || task_row.title || '.', '/admin/projects/' || task_row.project_id || '/tasks/' || target_task_id || '#feedback');
  insert into public.email_outbox(user_id, project_id, task_id, email_type, recipient_email, template_data, dedupe_key)
  values (admin_user.id, task_row.project_id, target_task_id, 'feedback.submitted', admin_user.email, jsonb_build_object('clientName', actor_name, 'projectName', project_name_value, 'taskTitle', task_row.title, 'targetUrl', '/admin/projects/' || task_row.project_id || '/tasks/' || target_task_id || '#feedback'), 'feedback-submitted:' || target_task_id)
  on conflict (dedupe_key) do nothing;
  return submission_id;
end;
$$;

create or replace function public.save_availability(
  timezone_input text,
  duration_input smallint,
  buffer_input smallint,
  notice_input integer,
  advance_input smallint,
  rules_input jsonb
)
returns void language plpgsql security definer set search_path = public
as $$
declare rule jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
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
$$;

create or replace function public.book_client_meeting(target_project_id uuid, requested_start timestamptz, requested_timezone text, meeting_title text, meeting_description text default '')
returns public.meetings language plpgsql security definer set search_path = public
as $$
declare client_row public.clients%rowtype; project_row public.projects%rowtype; settings_row public.availability_settings%rowtype; rule_row public.availability_rules%rowtype; created public.meetings%rowtype; local_start timestamp; requested_end timestamptz; owner_name_value text;
begin
  if auth.uid() is null or public.is_admin() then raise exception 'Client access required'; end if;
  select * into client_row from public.clients where auth_user_id = auth.uid() and status <> 'disabled';
  select * into project_row from public.projects where id = target_project_id and status = 'active';
  if client_row.id is null or project_row.id is null or not exists(select 1 from public.project_clients where project_id = target_project_id and client_id = client_row.id) then raise exception 'Project access denied'; end if;
  select * into settings_row from public.availability_settings where user_id = project_row.owner_id;
  if settings_row.user_id is null then raise exception 'Scheduling is not configured'; end if;
  select coalesce(s.display_name, u.full_name) into owner_name_value from public.users u left join public.admin_settings s on s.user_id = u.id where u.id = project_row.owner_id;
  if requested_start < now() + make_interval(mins => settings_row.minimum_notice_minutes) or requested_start > now() + make_interval(days => settings_row.maximum_advance_days) then raise exception 'Requested time is outside the booking window'; end if;
  requested_end := requested_start + make_interval(mins => settings_row.meeting_duration_minutes);
  local_start := requested_start at time zone settings_row.timezone;
  select * into rule_row from public.availability_rules where user_id = project_row.owner_id and weekday = extract(dow from local_start)::smallint and enabled;
  if rule_row.id is null or local_start::time < rule_row.start_time or (requested_end at time zone settings_row.timezone)::time > rule_row.end_time or (requested_end at time zone settings_row.timezone)::date <> local_start::date then raise exception 'Requested time is outside office hours'; end if;
  perform pg_advisory_xact_lock(hashtextextended(project_row.owner_id::text, 0));
  if exists(select 1 from public.meetings m where m.owner_id = project_row.owner_id and m.status = 'scheduled' and tstzrange(m.start_at - make_interval(mins => settings_row.buffer_minutes), m.end_at + make_interval(mins => settings_row.buffer_minutes), '[)') && tstzrange(requested_start, requested_end, '[)')) then raise exception 'This time was just booked'; end if;
  insert into public.meetings(project_id, client_id, owner_id, owner_display_name, title, description, start_at, end_at, timezone, duration_minutes, created_by)
  values (target_project_id, client_row.id, project_row.owner_id, owner_name_value, trim(meeting_title), trim(meeting_description), requested_start, requested_end, settings_row.timezone, settings_row.meeting_duration_minutes, auth.uid()) returning * into created;
  insert into public.notifications(user_id, project_id, type, title, body, target_url)
  values (project_row.owner_id, target_project_id, 'meeting.booked', 'New meeting booked', client_row.full_name || ' booked ' || trim(meeting_title) || '.', '/admin/meetings/' || created.id);
  insert into public.notifications(user_id, project_id, type, title, body, target_url)
  values (auth.uid(), target_project_id, 'meeting.booked', 'Meeting confirmed', trim(meeting_title) || ' has been scheduled.', '/portal/meetings/' || created.id);
  insert into public.project_activity(project_id, actor_id, meeting_id, event_type, body) values (target_project_id, auth.uid(), created.id, 'meeting.booked', client_row.full_name || ' booked a meeting');
  insert into public.email_outbox(user_id, client_id, project_id, meeting_id, email_type, recipient_email, template_data, dedupe_key)
  values (auth.uid(), client_row.id, target_project_id, created.id, 'meeting.confirmation', client_row.email, jsonb_build_object('clientName', client_row.full_name, 'title', created.title, 'startAt', created.start_at, 'endAt', created.end_at, 'timezone', created.timezone, 'targetUrl', '/portal/meetings/' || created.id), 'meeting-confirm-client:' || created.id);
  insert into public.email_outbox(user_id, project_id, meeting_id, email_type, recipient_email, template_data, dedupe_key)
  select project_row.owner_id, target_project_id, created.id, 'meeting.confirmation', u.email, jsonb_build_object('clientName', client_row.full_name, 'title', created.title, 'startAt', created.start_at, 'endAt', created.end_at, 'timezone', created.timezone, 'targetUrl', '/admin/meetings/' || created.id), 'meeting-confirm-admin:' || created.id from public.users u where u.id = project_row.owner_id;
  return created;
end;
$$;

create or replace function public.cancel_meeting(target_meeting_id uuid, reason_input text default null)
returns public.meetings language plpgsql security definer set search_path = public
as $$
declare meeting_row public.meetings%rowtype; client_row public.clients%rowtype; project_name_value text; actor_name text;
begin
  select * into meeting_row from public.meetings where id = target_meeting_id for update;
  select * into client_row from public.clients where id = meeting_row.client_id;
  if meeting_row.id is null or meeting_row.status <> 'scheduled' or meeting_row.start_at <= now() then raise exception 'Meeting cannot be cancelled'; end if;
  if auth.uid() <> meeting_row.owner_id and auth.uid() <> client_row.auth_user_id then raise exception 'Meeting access denied'; end if;
  update public.meetings set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancellation_reason = nullif(trim(reason_input), '') where id = target_meeting_id returning * into meeting_row;
  select project_name into project_name_value from public.projects where id = meeting_row.project_id;
  select full_name into actor_name from public.users where id = auth.uid();
  insert into public.notifications(user_id, project_id, type, title, body, target_url)
  select recipient, meeting_row.project_id, 'meeting.cancelled', 'Meeting cancelled', meeting_row.title || ' was cancelled by ' || actor_name || '.', case when recipient = meeting_row.owner_id then '/admin/meetings/' || meeting_row.id else '/portal/meetings/' || meeting_row.id end
  from (values (meeting_row.owner_id), (client_row.auth_user_id)) v(recipient) where recipient is not null and recipient <> auth.uid();
  insert into public.project_activity(project_id, actor_id, meeting_id, event_type, body) values (meeting_row.project_id, auth.uid(), meeting_row.id, 'meeting.cancelled', actor_name || ' cancelled ' || meeting_row.title);
  insert into public.email_outbox(user_id, client_id, project_id, meeting_id, email_type, recipient_email, template_data, dedupe_key)
  values (client_row.auth_user_id, client_row.id, meeting_row.project_id, meeting_row.id, 'meeting.cancelled', client_row.email, jsonb_build_object('clientName', client_row.full_name, 'projectName', project_name_value, 'title', meeting_row.title, 'startAt', meeting_row.start_at, 'timezone', meeting_row.timezone), 'meeting-cancel-client:' || meeting_row.id)
  on conflict (dedupe_key) do nothing;
  insert into public.email_outbox(user_id, project_id, meeting_id, email_type, recipient_email, template_data, dedupe_key)
  select meeting_row.owner_id, meeting_row.project_id, meeting_row.id, 'meeting.cancelled', u.email, jsonb_build_object('clientName', client_row.full_name, 'projectName', project_name_value, 'title', meeting_row.title, 'startAt', meeting_row.start_at, 'timezone', meeting_row.timezone), 'meeting-cancel-admin:' || meeting_row.id from public.users u where u.id = meeting_row.owner_id
  on conflict (dedupe_key) do nothing;
  return meeting_row;
end;
$$;

grant execute on function public.request_feedback_now(uuid) to authenticated;
grant execute on function public.cancel_feedback_request(uuid) to authenticated;
grant execute on function public.save_availability(text, smallint, smallint, integer, smallint, jsonb) to authenticated;
grant execute on function public.book_client_meeting(uuid, timestamptz, text, text, text) to authenticated;
grant execute on function public.cancel_meeting(uuid, text) to authenticated;
revoke all on function public.queue_feedback_email(public.project_tasks, text) from public, anon, authenticated;
revoke all on function public.process_due_feedback_requests_job() from public, anon, authenticated;
grant execute on function public.process_due_feedback_requests_job() to service_role;

commit;
