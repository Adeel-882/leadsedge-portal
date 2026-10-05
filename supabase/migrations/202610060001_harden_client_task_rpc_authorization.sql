-- Tighten only client task mutation authorization; preserve workflow bodies.
begin;
CREATE OR REPLACE FUNCTION public.complete_project_task(target_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare task_row public.project_tasks%rowtype; actor_name text; admin_user_id uuid; scheduled_for timestamptz; current_client uuid;
begin
  select client.id into current_client
  from public.clients client join public.users profile on profile.id = client.auth_user_id
  where client.auth_user_id = auth.uid() and client.status = 'active' and profile.role = 'client'
  for share of client;
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null
    or current_client is null
    or not task_row.client_visible
    or task_row.status <> 'active'
    or not task_row.requires_completion
    or task_row.assignee_id is distinct from current_client
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
$function$
;
CREATE OR REPLACE FUNCTION public.submit_lead_feedback(target_task_id uuid, submitted_answers jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare task_row public.project_tasks%rowtype; submission_id uuid; field jsonb; answer jsonb; admin_user record; actor_name text; project_name_value text; current_client uuid;
begin
  select client.id into current_client
  from public.clients client join public.users profile on profile.id = client.auth_user_id
  where client.auth_user_id = auth.uid() and client.status = 'active' and profile.role = 'client'
  for share of client;
  select * into task_row from public.project_tasks where id = target_task_id and archived_at is null for update;
  if task_row.id is null
    or current_client is null
    or not task_row.client_visible
    or task_row.status = 'draft'
    or task_row.assignee_id is distinct from current_client
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
$function$
;
revoke all on function public.complete_project_task(uuid) from public, anon;
revoke all on function public.submit_lead_feedback(uuid, jsonb) from public, anon;
grant execute on function public.complete_project_task(uuid) to authenticated;
grant execute on function public.submit_lead_feedback(uuid, jsonb) to authenticated;
commit;
