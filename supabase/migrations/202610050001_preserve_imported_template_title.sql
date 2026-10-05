-- Preserve the template title for new imports; existing tasks are unchanged.
CREATE OR REPLACE FUNCTION public.import_template_tasks(target_project_id uuid, target_template_id uuid, selected_template_task_ids uuid[], initial_task_status task_status DEFAULT 'draft'::task_status)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
