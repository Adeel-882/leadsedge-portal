begin;

-- Phase 1 correction: one durable lead task owns assignment, feedback, automation,
-- submission, and conversation state. Existing rows are merged/archived in place.

alter table public.template_tasks
  add column if not exists feedback_enabled boolean not null default false,
  add column if not exists feedback_delay_value smallint,
  add column if not exists feedback_delay_unit text;

alter table public.template_tasks drop constraint if exists template_tasks_feedback_delay_value_check;
alter table public.template_tasks add constraint template_tasks_feedback_delay_value_check
  check (feedback_delay_value is null or feedback_delay_value between 1 and 10);
alter table public.template_tasks drop constraint if exists template_tasks_feedback_delay_unit_check;
alter table public.template_tasks add constraint template_tasks_feedback_delay_unit_check
  check (feedback_delay_unit is null or feedback_delay_unit in ('hours', 'days'));

alter table public.project_tasks
  add column if not exists feedback_enabled boolean not null default false,
  add column if not exists feedback_delay_value smallint,
  add column if not exists feedback_delay_unit text,
  add column if not exists feedback_state text not null default 'not_configured',
  add column if not exists feedback_scheduled_for timestamptz,
  add column if not exists feedback_requested_at timestamptz,
  add column if not exists feedback_submitted_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists merged_into_task_id uuid references public.project_tasks(id) on delete set null;

alter table public.project_tasks drop constraint if exists project_tasks_feedback_delay_value_check;
alter table public.project_tasks add constraint project_tasks_feedback_delay_value_check
  check (feedback_delay_value is null or feedback_delay_value between 1 and 10);
alter table public.project_tasks drop constraint if exists project_tasks_feedback_delay_unit_check;
alter table public.project_tasks add constraint project_tasks_feedback_delay_unit_check
  check (feedback_delay_unit is null or feedback_delay_unit in ('hours', 'days'));
alter table public.project_tasks drop constraint if exists project_tasks_feedback_state_check;
alter table public.project_tasks add constraint project_tasks_feedback_state_check
  check (feedback_state in ('not_configured', 'pending', 'waiting', 'requested', 'submitted'));

alter table public.notifications
  add column if not exists thread_id uuid,
  add column if not exists message_id uuid,
  add column if not exists target_url text;

create index if not exists project_tasks_visible_idx
  on public.project_tasks(project_id, created_at) where archived_at is null;
create index if not exists project_tasks_feedback_schedule_idx
  on public.project_tasks(feedback_scheduled_for)
  where archived_at is null and feedback_state = 'waiting';
create index if not exists notifications_resource_idx
  on public.notifications(user_id, project_id, task_id, read_at, created_at desc);

do $$
declare
  feedback_row record;
  assignment_id uuid;
  assignment_thread_id uuid;
begin
  for feedback_row in
    select pt.*
    from public.project_tasks pt
    where pt.archived_at is null
      and (pt.title ilike 'Lead Feedback%' or pt.task_type = 'form')
  loop
    select candidate.id into assignment_id
    from public.project_tasks candidate
    where candidate.project_id = feedback_row.project_id
      and candidate.archived_at is null
      and candidate.id <> feedback_row.id
      and (
        lower(candidate.title) = lower(regexp_replace(feedback_row.title, '^Lead Feedback', 'Lead Assignment', 'i'))
        or candidate.title ilike 'Lead Assignment%'
      )
    order by
      case when lower(candidate.title) = lower(regexp_replace(feedback_row.title, '^Lead Feedback', 'Lead Assignment', 'i')) then 0 else 1 end,
      candidate.created_at
    limit 1;

    if assignment_id is not null then
      update public.project_tasks
      set form_schema = coalesce(feedback_row.form_schema, form_schema),
          feedback_enabled = true,
          feedback_delay_value = coalesce(feedback_delay_value, 1),
          feedback_delay_unit = coalesce(feedback_delay_unit, 'days'),
          feedback_state = case
            when exists(select 1 from public.form_submissions fs where fs.task_id in (assignment_id, feedback_row.id)) then 'submitted'
            when feedback_row.status = 'active' then 'requested'
            when status = 'completed' then 'waiting'
            else 'pending'
          end,
          feedback_requested_at = case when feedback_row.status = 'active' then coalesce(feedback_row.activated_at, feedback_row.updated_at) else feedback_requested_at end,
          feedback_submitted_at = coalesce(
            feedback_submitted_at,
            (select max(fs.submitted_at) from public.form_submissions fs where fs.task_id in (assignment_id, feedback_row.id))
          ),
          due_at = null
      where id = assignment_id;

      select id into assignment_thread_id from public.task_threads where task_id = assignment_id limit 1;
      if assignment_thread_id is null then
        insert into public.task_threads(task_id) values (assignment_id) returning id into assignment_thread_id;
      end if;

      update public.task_messages
      set task_id = assignment_id, thread_id = assignment_thread_id
      where task_id = feedback_row.id;
      update public.task_activity set task_id = assignment_id where task_id = feedback_row.id;
      update public.notifications set task_id = assignment_id where task_id = feedback_row.id;
      update public.form_submissions set task_id = assignment_id
      where task_id = feedback_row.id
        and not exists(select 1 from public.form_submissions existing where existing.task_id = assignment_id);

      update public.project_tasks
      set archived_at = now(), merged_into_task_id = assignment_id, client_visible = false
      where id = feedback_row.id;
    else
      update public.project_tasks
      set title = regexp_replace(title, '^Lead Feedback', 'Lead Assignment', 'i'),
          task_type = 'standard',
          feedback_enabled = true,
          feedback_delay_value = coalesce(feedback_delay_value, 1),
          feedback_delay_unit = coalesce(feedback_delay_unit, 'days'),
          feedback_state = case
            when exists(select 1 from public.form_submissions fs where fs.task_id = feedback_row.id) then 'submitted'
            when status = 'active' then 'requested'
            when status = 'completed' then 'waiting'
            else 'pending'
          end,
          due_at = null
      where id = feedback_row.id;
    end if;
    assignment_id := null;
  end loop;
end $$;

update public.project_tasks
set task_type = 'standard',
    feedback_enabled = true,
    feedback_delay_value = coalesce(feedback_delay_value, 1),
    feedback_delay_unit = coalesce(feedback_delay_unit, 'days'),
    feedback_state = case
      when feedback_state <> 'not_configured' then feedback_state
      when status = 'completed' then 'waiting'
      else 'pending'
    end,
    form_schema = coalesce(form_schema,
      '[{"id":"lead-name","label":"Lead Name","type":"text","required":true},{"id":"feedback","label":"Feedback","type":"textarea","required":true},{"id":"rating","label":"Rating","type":"radio","required":true,"options":["Excellent","Good","Average","Poor"]},{"id":"connection","label":"Lead Connection","type":"select","required":true,"options":["Yes","No"]},{"id":"score","label":"Lead Score","type":"select","required":true,"options":["1","2","3","4","5"]}]'::jsonb),
    due_at = null
where archived_at is null and title ilike 'Lead Assignment%';

do $$
declare
  template_id_value uuid;
  assignment_template_task_id uuid;
  feedback_schema jsonb;
begin
  select id into template_id_value
  from public.templates
  where name = 'Lead Assignment' and archived_at is null
  order by created_at
  limit 1;

  if template_id_value is not null then
    select form_schema into feedback_schema
    from public.template_tasks
    where template_id = template_id_value and title ilike 'Lead Feedback%'
    order by sort_order
    limit 1;

    select id into assignment_template_task_id
    from public.template_tasks
    where template_id = template_id_value and title ilike 'Lead Assignment%'
    order by sort_order
    limit 1;

    if assignment_template_task_id is null then
      insert into public.template_tasks(
        template_id, title, description, task_type, sort_order, client_visible,
        requires_completion, form_schema, feedback_enabled, feedback_delay_value, feedback_delay_unit
      ) values (
        template_id_value, 'Lead Assignment', '<h2>Lead details</h2><p>Add the lead information here before activating this task.</p>',
        'standard', 1, true, true, feedback_schema, true, 1, 'days'
      ) returning id into assignment_template_task_id;
    end if;

    update public.template_tasks
    set title = 'Lead Assignment',
        task_type = 'standard',
        sort_order = 1,
        client_visible = true,
        requires_completion = true,
        feedback_enabled = true,
        feedback_delay_value = coalesce(feedback_delay_value, 1),
        feedback_delay_unit = coalesce(feedback_delay_unit, 'days'),
        form_schema = coalesce(feedback_schema, form_schema,
          '[{"id":"lead-name","label":"Lead Name","type":"text","required":true},{"id":"feedback","label":"Feedback","type":"textarea","required":true},{"id":"rating","label":"Rating","type":"radio","required":true,"options":["Excellent","Good","Average","Poor"]},{"id":"connection","label":"Lead Connection","type":"select","required":true,"options":["Yes","No"]},{"id":"score","label":"Lead Score","type":"select","required":true,"options":["1","2","3","4","5"]}]'::jsonb)
    where id = assignment_template_task_id;

    delete from public.template_tasks
    where template_id = template_id_value and id <> assignment_template_task_id;
  end if;
end $$;

create or replace function public.seed_default_template()
returns uuid language plpgsql security definer set search_path = public
as $$
declare template_uuid uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
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
$$;

create or replace function public.create_project_bundle(
  project_name_input text,
  client_auth_user_id_input uuid,
  client_full_name_input text,
  client_email_input text,
  client_company_input text default null
)
returns table(project_id uuid, client_id uuid)
language plpgsql security definer set search_path = public
as $$
declare created_project_id uuid; resolved_client_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
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
$$;

create or replace function public.import_template_tasks(
  target_project_id uuid,
  target_template_id uuid,
  selected_template_task_ids uuid[],
  initial_task_status public.task_status default 'draft'
)
returns setof uuid language plpgsql security definer set search_path = public
as $$
declare template_task_row public.template_tasks%rowtype; created_task_id uuid; primary_client_id uuid; primary_client_name text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
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
      target_project_id, template_task_row.id, template_task_row.title || ' - ' || primary_client_name,
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
$$;

create or replace function public.complete_project_task(target_task_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; actor_name text; admin_user_id uuid; scheduled_for timestamptz;
begin
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null or task_row.status <> 'active' or not task_row.requires_completion or task_row.assignee_id <> public.current_client_id() then
    raise exception 'Task is not available for completion';
  end if;

  if task_row.feedback_enabled then
    scheduled_for := now() + case task_row.feedback_delay_unit
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

create or replace function public.request_feedback_now(target_task_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; client_user_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null or task_row.status <> 'completed' or task_row.feedback_state = 'submitted' then
    raise exception 'Feedback cannot be requested for this task';
  end if;
  if task_row.form_schema is null then raise exception 'Feedback form is not configured'; end if;
  update public.project_tasks
  set feedback_enabled = true, feedback_state = 'requested', feedback_requested_at = now(), feedback_scheduled_for = null
  where id = target_task_id;
  select auth_user_id into client_user_id from public.clients where id = task_row.assignee_id;
  if client_user_id is not null then
    insert into public.notifications(user_id, project_id, task_id, type, title, body, target_url)
    values (client_user_id, task_row.project_id, target_task_id, 'feedback.requested', 'Feedback requested', 'Please share feedback for ' || task_row.title || '.', '/portal/tasks/' || target_task_id);
  end if;
  insert into public.task_activity(task_id, actor_id, event_type, body)
  values (target_task_id, auth.uid(), 'feedback.requested', 'requested the feedback form');
end;
$$;

create or replace function public.process_due_feedback_requests_job()
returns integer language plpgsql security definer set search_path = public
as $$
declare task_row record; processed integer := 0; client_user_id uuid;
begin
  for task_row in
    select pt.id, pt.project_id, pt.title, pt.assignee_id
    from public.project_tasks pt
    where pt.archived_at is null and pt.feedback_state = 'waiting'
      and pt.feedback_scheduled_for <= now()
    for update skip locked
  loop
    update public.project_tasks
    set feedback_state = 'requested', feedback_requested_at = now(), feedback_scheduled_for = null
    where id = task_row.id;
    select auth_user_id into client_user_id from public.clients where id = task_row.assignee_id;
    if client_user_id is not null then
      insert into public.notifications(user_id, project_id, task_id, type, title, body, target_url)
      values (client_user_id, task_row.project_id, task_row.id, 'feedback.requested', 'Feedback requested', 'Please share feedback for ' || task_row.title || '.', '/portal/tasks/' || task_row.id);
    end if;
    insert into public.task_activity(task_id, actor_id, event_type, body)
    values (task_row.id, null, 'feedback.requested', 'made the feedback form available');
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

revoke all on function public.process_due_feedback_requests_job() from public, anon, authenticated;
grant execute on function public.process_due_feedback_requests_job() to service_role;

create or replace function public.process_due_feedback_requests()
returns integer language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return public.process_due_feedback_requests_job();
end;
$$;

-- Supabase hosted projects include pg_cron. This job makes persisted delays fire
-- without requiring an administrator or client to keep a browser page open.
create extension if not exists pg_cron;
do $$
begin
  if not exists(select 1 from cron.job where jobname = 'leadsedge-feedback-automation') then
    perform cron.schedule('leadsedge-feedback-automation', '* * * * *', 'select public.process_due_feedback_requests_job()');
  end if;
end $$;

create or replace function public.submit_lead_feedback(target_task_id uuid, submitted_answers jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; submission_id uuid; field jsonb; answer jsonb; admin_user_id uuid; actor_name text;
begin
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null or task_row.status <> 'completed' or task_row.feedback_state <> 'requested' or task_row.assignee_id <> public.current_client_id() then
    raise exception 'Feedback form is not available';
  end if;
  if exists(select 1 from public.form_submissions where task_id = target_task_id) then
    raise exception 'Feedback has already been submitted';
  end if;

  for field in select value from jsonb_array_elements(coalesce(task_row.form_schema, '[]'::jsonb))
  loop
    answer := submitted_answers -> (field ->> 'id');
    if coalesce((field ->> 'required')::boolean, false)
       and (answer is null or answer = 'null'::jsonb or answer = '""'::jsonb or answer = '[]'::jsonb) then
      raise exception '% is required', field ->> 'label';
    end if;
    if field ->> 'type' in ('radio', 'select') and answer is not null
       and not ((field -> 'options') ? (answer #>> '{}')) then
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
  select owner_id into admin_user_id from public.projects where id = task_row.project_id;
  insert into public.task_activity(task_id, actor_id, event_type, body)
  values (target_task_id, auth.uid(), 'feedback.submitted', actor_name || ' submitted feedback');
  insert into public.notifications(user_id, project_id, task_id, type, title, body, target_url)
  values (admin_user_id, task_row.project_id, target_task_id, 'feedback.submitted', 'Feedback submitted', actor_name || ' submitted feedback for ' || task_row.title || '.', '/admin/projects/' || task_row.project_id || '/tasks/' || target_task_id);
  return submission_id;
end;
$$;

create or replace function public.submit_form_task(target_task_id uuid, submitted_answers jsonb)
returns uuid language sql security definer set search_path = public
as $$ select public.submit_lead_feedback(target_task_id, submitted_answers) $$;

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
    insert into public.notifications(user_id, project_id, thread_id, message_id, type, title, body, target_url)
    values (recipient_id, new.project_id, new.thread_id, new.id, 'project.message', 'New project message', sender_name || ' sent a message in ' || project_name_value || '.',
      case when sender_role = 'admin' then '/portal/messages' else '/admin/projects/' || new.project_id || '/chat' end);
  end if;
  return new;
end;
$$;

create or replace function public.delete_project_bundle_admin(
  target_project_id uuid,
  delete_client boolean,
  expected_project_name text,
  requesting_admin_id uuid
)
returns table(project_deleted boolean, client_deleted boolean)
language plpgsql security definer set search_path = public, auth
as $$
declare project_row public.projects%rowtype; target_client_id uuid; target_auth_user_id uuid; remaining_projects integer; target_role public.user_role;
begin
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
$$;

revoke all on function public.delete_project_bundle_admin(uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.delete_project_bundle_admin(uuid, boolean, text, uuid) to service_role;

update public.notifications n
set target_url = case
  when n.type = 'task.message' and n.task_id is not null then
    case when exists(select 1 from public.users u where u.id = n.user_id and u.role = 'admin')
      then '/admin/projects/' || n.project_id || '/tasks/' || n.task_id || '#conversation'
      else '/portal/tasks/' || n.task_id || '#conversation' end
  when n.type = 'project.message' and n.project_id is not null then
    case when exists(select 1 from public.users u where u.id = n.user_id and u.role = 'admin')
      then '/admin/projects/' || n.project_id || '/chat'
      else '/portal/messages' end
  when n.task_id is not null then
    case when exists(select 1 from public.users u where u.id = n.user_id and u.role = 'admin')
      then '/admin/projects/' || n.project_id || '/tasks/' || n.task_id
      else '/portal/tasks/' || n.task_id end
  when n.project_id is not null then
    case when exists(select 1 from public.users u where u.id = n.user_id and u.role = 'admin')
      then '/admin/projects/' || n.project_id
      else '/portal' end
  else case when exists(select 1 from public.users u where u.id = n.user_id and u.role = 'admin') then '/admin' else '/portal' end
end
where n.target_url is null;

commit;
