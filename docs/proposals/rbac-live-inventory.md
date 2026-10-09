# Frankfurt authorization inventory — 2026-10-09

Read-only catalog snapshot; baseline 9cb5605610f4d3213c91f554f168088e9e1a47e4. No credentials, tokens, or cookie values.

## Existing administrators

- Adeel Ahmed: adeelahmed@broadigo.com, UUID dbf41fdf-2b4a-4f8c-a8da-6b34350dbc65, role admin; Auth confirmed true, banned false.
- Frankfurt Performance Admin: admin.frankfurt@performance.example.com, UUID c987cadf-3098-49d6-bd26-eddac2de9e99, role admin; Auth confirmed true, banned false.

## Live policies

### admin_settings: admins manage settings

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### automation_runs: admins read automation runs

SELECT; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK (none)
```

### availability_rules: admins manage own availability rules

ALL; PERMISSIVE; roles public.

```sql
USING (is_admin() AND (user_id = auth.uid()))
WITH CHECK (is_admin() AND (user_id = auth.uid()))
```

### availability_rules: members read owner availability rules

SELECT; PERMISSIVE; roles public.

```sql
USING (is_admin() OR (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.owner_id = availability_rules.user_id) AND is_project_member(p.id)))))
WITH CHECK (none)
```

### availability_settings: admins manage own availability settings

ALL; PERMISSIVE; roles public.

```sql
USING (is_admin() AND (user_id = auth.uid()))
WITH CHECK (is_admin() AND (user_id = auth.uid()))
```

### availability_settings: members read owner availability settings

SELECT; PERMISSIVE; roles public.

```sql
USING (is_admin() OR (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.owner_id = availability_settings.user_id) AND is_project_member(p.id)))))
WITH CHECK (none)
```

### calendar_connections: admins manage own calendar connection

ALL; PERMISSIVE; roles public.

```sql
USING (is_admin() AND (user_id = auth.uid()))
WITH CHECK (is_admin() AND (user_id = auth.uid()))
```

### clients: admins manage clients

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### clients: clients read self

SELECT; PERMISSIVE; roles public.

```sql
USING (auth_user_id = auth.uid())
WITH CHECK (none)
```

### email_deliveries: admins read deliveries

SELECT; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK (none)
```

### email_outbox: admins read email outbox

SELECT; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK (none)
```

### form_submissions: clients read own submissions

SELECT; PERMISSIVE; roles public.

```sql
USING ((submitted_by = auth.uid()) OR is_admin())
WITH CHECK (none)
```

### meetings: members read authorized meetings

SELECT; PERMISSIVE; roles public.

```sql
USING ((owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (clients client
     JOIN project_clients membership ON (((membership.client_id = client.id) AND (membership.project_id = meetings.project_id))))
  WHERE ((client.id = meetings.client_id) AND (client.auth_user_id = auth.uid()) AND (client.status <> 'disabled'::client_status)))))
WITH CHECK (none)
```

### message_read_receipts: users read own message receipts

SELECT; PERMISSIVE; roles public.

```sql
USING (recipient_id = auth.uid())
WITH CHECK (none)
```

### notifications: admins create notifications

INSERT; PERMISSIVE; roles public.

```sql
USING (none)
WITH CHECK is_admin()
```

### notifications: users read notifications

SELECT; PERMISSIVE; roles public.

```sql
USING (user_id = auth.uid())
WITH CHECK (none)
```

### notifications: users update notifications

UPDATE; PERMISSIVE; roles public.

```sql
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid())
```

### project_activity: members read project activity

SELECT; PERMISSIVE; roles public.

```sql
USING is_project_member(project_id)
WITH CHECK (none)
```

### project_clients: admins manage project links

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### project_clients: members read own project links

SELECT; PERMISSIVE; roles public.

```sql
USING (is_admin() OR (EXISTS ( SELECT 1
   FROM clients client
  WHERE ((client.id = project_clients.client_id) AND (client.auth_user_id = auth.uid()) AND (client.status = 'active'::client_status)))))
WITH CHECK (none)
```

### project_messages: members read project messages

SELECT; PERMISSIVE; roles public.

```sql
USING is_project_member(project_id)
WITH CHECK (none)
```

### project_messages: members send project messages

INSERT; PERMISSIVE; roles public.

```sql
USING (none)
WITH CHECK ((sender_id = auth.uid()) AND (message_type = 'user'::text) AND is_project_member(project_id) AND (EXISTS ( SELECT 1
   FROM project_threads thread
  WHERE ((thread.id = project_messages.thread_id) AND (thread.project_id = thread.project_id)))))
```

### project_tasks: admins manage project tasks

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### project_tasks: members read allowed tasks

SELECT; PERMISSIVE; roles public.

```sql
USING (is_admin() OR (is_project_member(project_id) AND (assignee_id = current_client_id()) AND client_visible AND (status <> 'draft'::task_status)))
WITH CHECK (none)
```

### project_threads: admins manage project threads

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### project_threads: members read project threads

SELECT; PERMISSIVE; roles public.

```sql
USING is_project_member(project_id)
WITH CHECK (none)
```

### projects: admins manage projects

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### projects: members read projects

SELECT; PERMISSIVE; roles public.

```sql
USING is_project_member(id)
WITH CHECK (none)
```

### task_activity: admins manage task activity

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### task_activity: members read task activity

SELECT; PERMISSIVE; roles public.

```sql
USING can_access_task(task_id)
WITH CHECK (none)
```

### task_messages: members read task messages

SELECT; PERMISSIVE; roles public.

```sql
USING can_access_task(task_id)
WITH CHECK (none)
```

### task_messages: members send task messages

INSERT; PERMISSIVE; roles public.

```sql
USING (none)
WITH CHECK ((sender_id = auth.uid()) AND (message_type = 'user'::text) AND can_access_task(task_id) AND (EXISTS ( SELECT 1
   FROM task_threads thread
  WHERE ((thread.id = task_messages.thread_id) AND (thread.task_id = thread.task_id)))))
```

### task_threads: admins manage task threads

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### task_threads: members read task threads

SELECT; PERMISSIVE; roles public.

```sql
USING can_access_task(task_id)
WITH CHECK (none)
```

### template_tasks: admins manage template tasks

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### templates: admins manage templates

ALL; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

### users: admins read all users

SELECT; PERMISSIVE; roles public.

```sql
USING (is_admin() OR (id = auth.uid()))
WITH CHECK (none)
```

### users: admins update users

UPDATE; PERMISSIVE; roles public.

```sql
USING is_admin()
WITH CHECK is_admin()
```

## Live application functions

### activate_current_client()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.activate_current_client()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ update public.clients set status = 'active' where auth_user_id = auth.uid() and status = 'invited' $function$

```

### book_client_meeting(uuid,timestamp with time zone,text,text,text)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.book_client_meeting(target_project_id uuid, requested_start timestamp with time zone, requested_timezone text, meeting_title text, meeting_description text DEFAULT ''::text)
 RETURNS meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### can_access_task(uuid)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.can_access_task(target_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### cancel_feedback_request(uuid)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.cancel_feedback_request(target_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### cancel_meeting(uuid,text)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.cancel_meeting(target_meeting_id uuid, reason_input text DEFAULT NULL::text)
 RETURNS meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### complete_project_task(uuid)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
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

```

### create_project_bundle(text,uuid,text,text,text)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.create_project_bundle(project_name_input text, client_auth_user_id_input uuid, client_full_name_input text, client_email_input text, client_company_input text DEFAULT NULL::text)
 RETURNS TABLE(project_id uuid, client_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### current_client_id()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.current_client_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select id from public.clients where auth_user_id = auth.uid() limit 1 $function$

```

### delete_project_bundle_admin(uuid,boolean,text,uuid)

Security definer: true. Configuration: ["search_path=public, auth"]. Grants: ["postgres=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.delete_project_bundle_admin(target_project_id uuid, delete_client boolean, expected_project_name text, requesting_admin_id uuid)
 RETURNS TABLE(project_deleted boolean, client_deleted boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$

```

### get_admin_client_last_login(uuid)

Security definer: true. Configuration: ["search_path=public, auth"]. Grants: ["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.get_admin_client_last_login(target_client_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  result timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then
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

```

### get_admin_people(text,integer,integer)

Security definer: true. Configuration: ["search_path=public, auth"]. Grants: ["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
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
  if auth.uid() is null or not public.is_admin() then
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

```

### get_portal_bootstrap()

Security definer: false. Configuration: ["search_path=public"]. Grants: ["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
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
        users.role = 'admin'
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

```

### get_unread_counts()

Security definer: false. Configuration: ["search_path=public"]. Grants: ["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.get_unread_counts()
 RETURNS TABLE(unread_messages bigint, unread_notifications bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    public.get_unread_message_count() as unread_messages,
    (
      select count(*)
      from public.notifications
      where user_id = auth.uid()
        and read_at is null
    ) as unread_notifications;
$function$

```

### get_unread_message_count()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
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
  where receipt.recipient_id = auth.uid()
    and receipt.read_at is null
    and (
      (pm.id is not null and pm.message_type = 'user' and public.is_project_member(pm.project_id))
      or (tm.id is not null and tm.message_type = 'user' and public.can_access_task(tm.task_id))
    )
$function$

```

### handle_new_auth_user()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.users (id, email, role, full_name)
  values (
    new.id,
    new.email,
    'client'::public.user_role,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;
  return new;
end;
$function$

```

### import_template_tasks(uuid,uuid,uuid[],task_status)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
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
$function$

```

### is_admin()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.users where id = auth.uid() and role = 'admin') $function$

```

### is_project_member(uuid)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.is_project_member(target_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_admin() or exists(
    select 1 from public.project_clients pc
    join public.clients c on c.id = pc.client_id
    where pc.project_id = target_project_id and c.auth_user_id = auth.uid() and c.status <> 'disabled'
  )
$function$

```

### mark_conversation_read(text,uuid)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.mark_conversation_read(target_kind text, target_resource_id uuid)
 RETURNS TABLE(read_messages integer, read_notifications integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### on_project_message_created()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
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
$function$

```

### on_task_message_created()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
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
$function$

```

### process_due_feedback_requests()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["postgres=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.process_due_feedback_requests()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return public.process_due_feedback_requests_job();
end;
$function$

```

### process_due_feedback_requests_job()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["postgres=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.process_due_feedback_requests_job()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### queue_feedback_email(project_tasks,text)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["postgres=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.queue_feedback_email(task_row project_tasks, event_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### request_feedback_now(uuid)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.request_feedback_now(target_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### save_availability(text,smallint,smallint,integer,smallint,jsonb)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.save_availability(timezone_input text, duration_input smallint, buffer_input smallint, notice_input integer, advance_input smallint, rules_input jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### seed_default_template()

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.seed_default_template()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

```

### set_updated_at()

Security definer: false. Configuration: null. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$

```

### setup_first_admin(text,text)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.setup_first_admin(display_name text, admin_timezone text DEFAULT 'UTC'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext('leadsedge.setup_first_admin'));
  if exists(select 1 from public.users where role = 'admin') then raise exception 'An administrator already exists'; end if;
  update public.users set role = 'admin', full_name = trim(display_name) where id = auth.uid();
  insert into public.admin_settings(user_id, display_name, timezone)
  values (auth.uid(), trim(display_name), admin_timezone)
  on conflict (user_id) do update set display_name = excluded.display_name, timezone = excluded.timezone;
  perform public.seed_default_template();
end;
$function$

```

### submit_form_task(uuid,jsonb)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
CREATE OR REPLACE FUNCTION public.submit_form_task(target_task_id uuid, submitted_answers jsonb)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.submit_lead_feedback(target_task_id, submitted_answers) $function$

```

### submit_lead_feedback(uuid,jsonb)

Security definer: true. Configuration: ["search_path=public"]. Grants: ["postgres=X/postgres","authenticated=X/postgres","service_role=X/postgres"].

```sql
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

```
