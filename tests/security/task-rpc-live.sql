-- Run only with the guarded Frankfurt harness. Everything, including successful
-- workflow side effects and temporary client status changes, is rolled back.
begin;
set local statement_timeout = '20s';
create temporary table security_results(result jsonb) on commit drop;
do $test$
declare
  a public.clients%rowtype; b public.clients%rowtype;
  pa uuid; pb uuid; owner_id_value uuid; task_id_value uuid; meeting_id_value uuid;
  scenario record; allowed boolean; error_code text; duplicate_denied boolean;
  schedule_ok boolean; notification_count integer; outbox_count integer;
begin
  select * into strict a from public.clients where id='71000000-0000-4000-8000-000000000007' and status='active';
  select * into strict b from public.clients where id='71000000-0000-4000-8000-000000000008' and status='active';
  select project_id into strict pa from public.project_clients where client_id=a.id limit 1;
  select project_id into strict pb from public.project_clients where client_id=b.id limit 1;
  if pa=pb then raise exception 'Separate synthetic projects required'; end if;
  select owner_id into strict owner_id_value from public.projects where id=pa;
  for scenario in select k.kind,c.label from (values ('completion'),('feedback')) k(kind)
    cross join (values ('valid'),('disabled'),('hidden'),('draft'),('foreign'),('archived'),('wrong_assignee'),('unassigned'),('no_membership'),('admin'),('anonymous')) c(label)
  loop
    allowed:=false; error_code:=null; duplicate_denied:=false; schedule_ok:=null; notification_count:=0; outbox_count:=0;
    begin
      task_id_value:=gen_random_uuid();
      insert into public.project_tasks(id,project_id,title,assignee_id,status,client_visible,requires_completion,archived_at,feedback_enabled,feedback_delay_value,feedback_delay_unit,feedback_state,feedback_requested_at,form_schema)
      values(task_id_value,case when scenario.label in ('foreign','no_membership') then pb else pa end,'Disposable security regression',
        case when scenario.label='unassigned' then null when scenario.label in ('foreign','wrong_assignee') then b.id else a.id end,
        case when scenario.label='draft' then 'draft'::public.task_status else 'active'::public.task_status end,
        scenario.label<>'hidden',true,case when scenario.label='archived' then now() else null end,
        true,7,'days','requested',now(),'[{"id":"note","label":"Note","type":"text","required":true}]');
      if scenario.label='disabled' then update public.clients set status='disabled' where id=a.id; end if;
      perform set_config('request.jwt.claim.sub',case when scenario.label='anonymous' then '' when scenario.label='admin' then owner_id_value::text else a.auth_user_id::text end,true);
      perform set_config('request.jwt.claims',jsonb_build_object('sub',case when scenario.label='anonymous' then null when scenario.label='admin' then owner_id_value else a.auth_user_id end,'role',case when scenario.label='anonymous' then 'anon' else 'authenticated' end)::text,true);
      perform set_config('role',case when scenario.label='anonymous' then 'anon' else 'authenticated' end,true);
      begin
        if scenario.kind='completion' then perform public.complete_project_task(task_id_value);
        else perform public.submit_lead_feedback(task_id_value,'{"note":"Normal feedback"}'); end if;
        allowed:=true;
        begin
          if scenario.kind='completion' then perform public.complete_project_task(task_id_value);
          else perform public.submit_lead_feedback(task_id_value,'{"note":"Normal feedback"}'); end if;
        exception when others then duplicate_denied:=true; end;
      exception when others then error_code:=sqlstate; end;
      reset role;
      if allowed then
        select feedback_scheduled_for=completed_at+interval '7 days' into schedule_ok from public.project_tasks where id=task_id_value;
        select count(*) into notification_count from public.notifications where task_id=task_id_value;
        select count(*) into outbox_count from public.email_outbox where task_id=task_id_value;
      end if;
      raise sqlstate 'Z0001';
    exception when sqlstate 'Z0001' then null; end;
    insert into security_results values(jsonb_build_object('kind',scenario.kind,'case',scenario.label,'allowed',allowed,'errorCode',error_code,'duplicateDenied',duplicate_denied,'sevenDays',schedule_ok,'notifications',notification_count,'outbox',outbox_count));
  end loop;
  for scenario in select label from (values ('anonymous'),('foreign'),('authorized')) c(label) loop
    allowed:=false;error_code:=null;
    begin
      meeting_id_value:=gen_random_uuid();
      insert into public.meetings(id,project_id,client_id,owner_id,owner_display_name,title,start_at,end_at,timezone,duration_minutes,created_by)
      values(meeting_id_value,pa,a.id,owner_id_value,'Security fixture owner','Disposable security meeting',now()+interval '20 days',now()+interval '20 days 30 minutes','UTC',30,a.auth_user_id);
      perform set_config('request.jwt.claim.sub',case when scenario.label='anonymous' then '' when scenario.label='foreign' then b.auth_user_id::text else a.auth_user_id::text end,true);
      perform set_config('request.jwt.claims',jsonb_build_object('sub',case when scenario.label='anonymous' then null when scenario.label='foreign' then b.auth_user_id else a.auth_user_id end,'role',case when scenario.label='anonymous' then 'anon' else 'authenticated' end)::text,true);
      perform set_config('role',case when scenario.label='anonymous' then 'anon' else 'authenticated' end,true);
      begin perform public.cancel_meeting(meeting_id_value,'Security regression');allowed:=true;
      exception when others then error_code:=sqlstate; end;
      reset role;
      if not allowed and (select status<>'scheduled' from public.meetings where id=meeting_id_value) then raise exception 'Rejected cancellation mutated meeting'; end if;
      raise sqlstate 'Z0001';
    exception when sqlstate 'Z0001' then null; end;
    insert into security_results values(jsonb_build_object('kind','cancel_meeting','case',scenario.label,'allowed',allowed,'errorCode',error_code));
  end loop;
end;
$test$;
select result from security_results;
rollback;
