begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('admin', 'client');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.client_status as enum ('invited', 'active', 'disabled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.project_status as enum ('active', 'completed', 'archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.task_status as enum ('draft', 'active', 'completed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.task_type as enum ('standard', 'form');
exception when duplicate_object then null; end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role public.user_role not null default 'client',
  full_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  display_name text not null,
  notification_preferences jsonb not null default '{"task_messages":true,"project_messages":true,"task_completed":true}'::jsonb,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references public.users(id) on delete set null,
  full_name text not null,
  email text not null unique,
  company text,
  status public.client_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  owner_id uuid not null references public.users(id),
  status public.project_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_clients (
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (project_id, client_id)
);

create unique index if not exists project_clients_one_primary_idx on public.project_clients(project_id) where is_primary;

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  title text not null,
  description text not null default '',
  task_type public.task_type not null default 'standard',
  sort_order integer not null default 0,
  client_visible boolean not null default true,
  requires_completion boolean not null default true,
  form_schema jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  template_task_id uuid references public.template_tasks(id) on delete set null,
  title text not null,
  description text not null default '',
  assignee_id uuid references public.clients(id) on delete set null,
  task_type public.task_type not null default 'standard',
  status public.task_status not null default 'draft',
  client_visible boolean not null default true,
  requires_completion boolean not null default true,
  form_schema jsonb,
  activated_at timestamptz,
  completed_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_threads (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.project_tasks(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.task_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  thread_id uuid not null references public.task_threads(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  attachment_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.project_threads(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  attachment_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.project_tasks(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  event_type text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  submitted_by uuid not null references public.users(id) on delete cascade,
  answers jsonb not null,
  submitted_at timestamptz not null default now()
);

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  email_type text not null,
  provider_id text,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects(owner_id);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists project_clients_client_idx on public.project_clients(client_id);
create index if not exists template_tasks_template_order_idx on public.template_tasks(template_id, sort_order);
create index if not exists project_tasks_project_status_idx on public.project_tasks(project_id, status);
create index if not exists project_tasks_assignee_idx on public.project_tasks(assignee_id);
create index if not exists task_messages_thread_created_idx on public.task_messages(thread_id, created_at);
create index if not exists project_messages_thread_created_idx on public.project_messages(thread_id, created_at);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, read_at, created_at desc);
create index if not exists task_activity_task_created_idx on public.task_activity(task_id, created_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
drop trigger if exists admin_settings_set_updated_at on public.admin_settings;
create trigger admin_settings_set_updated_at before update on public.admin_settings for each row execute function public.set_updated_at();
drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients for each row execute function public.set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at before update on public.templates for each row execute function public.set_updated_at();
drop trigger if exists template_tasks_set_updated_at on public.template_tasks;
create trigger template_tasks_set_updated_at before update on public.template_tasks for each row execute function public.set_updated_at();
drop trigger if exists project_tasks_set_updated_at on public.project_tasks;
create trigger project_tasks_set_updated_at before update on public.project_tasks for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, role, full_name)
  values (
    new.id,
    new.email,
    case when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin'::public.user_role else 'client'::public.user_role end,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.users where id = auth.uid() and role = 'admin') $$;

create or replace function public.current_client_id()
returns uuid language sql stable security definer set search_path = public
as $$ select id from public.clients where auth_user_id = auth.uid() limit 1 $$;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists(
    select 1 from public.project_clients pc
    join public.clients c on c.id = pc.client_id
    where pc.project_id = target_project_id and c.auth_user_id = auth.uid() and c.status <> 'disabled'
  )
$$;

create or replace function public.can_access_task(target_task_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists(
    select 1 from public.project_tasks pt
    join public.clients c on c.id = pt.assignee_id
    where pt.id = target_task_id
      and c.auth_user_id = auth.uid()
      and pt.client_visible
      and pt.status <> 'draft'
  )
$$;

create or replace function public.seed_default_template()
returns uuid language plpgsql security definer set search_path = public
as $$
declare template_uuid uuid;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select id into template_uuid from public.templates where name = 'Lead Assignment' and archived_at is null order by created_at limit 1;
  if template_uuid is null then
    insert into public.templates(name, description, created_by)
    values ('Lead Assignment', 'Assign a lead and collect structured feedback without mixing task conversations.', auth.uid())
    returning id into template_uuid;

    insert into public.template_tasks(template_id, title, description, task_type, sort_order, client_visible, requires_completion)
    values (template_uuid, 'Lead Assignment', '<h2>Lead details</h2><p>Add the lead information here before activating this task.</p>', 'standard', 1, true, true);

    insert into public.template_tasks(template_id, title, description, task_type, sort_order, client_visible, requires_completion, form_schema)
    values (template_uuid, 'Lead Feedback', '<p>Tell us how this lead worked out.</p>', 'form', 2, true, true,
      '[{"id":"lead-name","label":"Lead Name","type":"text","required":true},{"id":"feedback","label":"Feedback","type":"textarea","required":true},{"id":"rating","label":"Rating","type":"radio","required":true,"options":["Excellent","Good","Average","Poor"]},{"id":"connection","label":"Lead Connection","type":"radio","required":true,"options":["Yes","No"]},{"id":"score","label":"Lead Score","type":"radio","required":true,"options":["1","2","3","4","5"]}]'::jsonb);
  end if;
  return template_uuid;
end;
$$;

create or replace function public.setup_first_admin(display_name text, admin_timezone text default 'UTC')
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.users where role = 'admin' and id <> auth.uid()) then raise exception 'An administrator already exists'; end if;
  update public.users set role = 'admin', full_name = trim(display_name) where id = auth.uid();
  insert into public.admin_settings(user_id, display_name, timezone)
  values (auth.uid(), trim(display_name), admin_timezone)
  on conflict (user_id) do update set display_name = excluded.display_name, timezone = excluded.timezone;
  perform public.seed_default_template();
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
  insert into public.notifications(user_id, project_id, type, title, body)
  values (client_auth_user_id_input, created_project_id, 'project.invited', 'Welcome to Leadsedge Portal', 'You were invited to ' || trim(project_name_input) || '.');
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
    insert into public.project_tasks(project_id, template_task_id, title, description, assignee_id, task_type, status, client_visible, requires_completion, form_schema, activated_at)
    values (target_project_id, template_task_row.id, template_task_row.title || ' - ' || primary_client_name, template_task_row.description, primary_client_id, template_task_row.task_type, initial_task_status, template_task_row.client_visible, template_task_row.requires_completion, template_task_row.form_schema, case when initial_task_status = 'active' then now() end)
    returning id into created_task_id;
    insert into public.task_threads(task_id) values (created_task_id);
    insert into public.task_activity(task_id, actor_id, event_type, body) values (created_task_id, auth.uid(), 'task.imported', 'Imported from ' || template_task_row.title || ' template task');
    return next created_task_id;
  end loop;
end;
$$;

create or replace function public.complete_project_task(target_task_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; actor_name text; admin_user_id uuid;
begin
  select * into task_row from public.project_tasks where id = target_task_id for update;
  if task_row.id is null or task_row.status <> 'active' or not task_row.requires_completion or task_row.assignee_id <> public.current_client_id() then
    raise exception 'Task is not available for completion';
  end if;
  update public.project_tasks set status = 'completed', completed_at = now() where id = target_task_id;
  select full_name into actor_name from public.users where id = auth.uid();
  insert into public.task_activity(task_id, actor_id, event_type, body) values (target_task_id, auth.uid(), 'task.completed', actor_name || ' marked the task completed');
  select owner_id into admin_user_id from public.projects where id = task_row.project_id;
  insert into public.notifications(user_id, project_id, task_id, type, title, body)
  values (admin_user_id, task_row.project_id, target_task_id, 'task.completed', 'Task completed', actor_name || ' completed ' || task_row.title || '.');
end;
$$;

create or replace function public.activate_current_client()
returns void language sql security definer set search_path = public
as $$ update public.clients set status = 'active' where auth_user_id = auth.uid() and status = 'invited' $$;

create or replace function public.submit_form_task(target_task_id uuid, submitted_answers jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare task_row public.project_tasks%rowtype; submission_id uuid;
begin
  select * into task_row from public.project_tasks where id = target_task_id for update;
  if task_row.id is null or task_row.task_type <> 'form' or task_row.status <> 'active' or task_row.assignee_id <> public.current_client_id() then
    raise exception 'Form task is not available';
  end if;
  insert into public.form_submissions(task_id, submitted_by, answers) values (target_task_id, auth.uid(), submitted_answers) returning id into submission_id;
  perform public.complete_project_task(target_task_id);
  return submission_id;
end;
$$;

create or replace function public.on_task_message_created()
returns trigger language plpgsql security definer set search_path = public
as $$
declare sender_name text; sender_role public.user_role; task_title text; task_project_id uuid; project_owner_id uuid; client_user_id uuid; recipient_id uuid;
begin
  select full_name, role into sender_name, sender_role from public.users where id = new.sender_id;
  select pt.title, pt.project_id, p.owner_id, c.auth_user_id
    into task_title, task_project_id, project_owner_id, client_user_id
  from public.project_tasks pt
  join public.projects p on p.id = pt.project_id
  left join public.clients c on c.id = pt.assignee_id
  where pt.id = new.task_id;
  recipient_id := case when sender_role = 'admin' then client_user_id else project_owner_id end;
  insert into public.task_activity(task_id, actor_id, event_type, body) values (new.task_id, new.sender_id, 'task.comment', 'commented on this task');
  if recipient_id is not null and recipient_id <> new.sender_id then
    insert into public.notifications(user_id, project_id, task_id, type, title, body)
    values (recipient_id, task_project_id, new.task_id, 'task.message', 'New task comment', sender_name || ' commented on ' || task_title || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists task_message_created on public.task_messages;
create trigger task_message_created after insert on public.task_messages for each row execute function public.on_task_message_created();

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
  left join public.clients c on c.id = pc.client_id
  where p.id = new.project_id;
  recipient_id := case when sender_role = 'admin' then client_user_id else project_owner_id end;
  if recipient_id is not null and recipient_id <> new.sender_id then
    insert into public.notifications(user_id, project_id, type, title, body)
    values (recipient_id, new.project_id, 'project.message', 'New project message', sender_name || ' sent a message in ' || project_name_value || '.');
  end if;
  return new;
end;
$$;

drop trigger if exists project_message_created on public.project_messages;
create trigger project_message_created after insert on public.project_messages for each row execute function public.on_project_message_created();

alter table public.users enable row level security;
alter table public.admin_settings enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_clients enable row level security;
alter table public.templates enable row level security;
alter table public.template_tasks enable row level security;
alter table public.project_tasks enable row level security;
alter table public.task_threads enable row level security;
alter table public.task_messages enable row level security;
alter table public.project_threads enable row level security;
alter table public.project_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.task_activity enable row level security;
alter table public.form_submissions enable row level security;
alter table public.email_deliveries enable row level security;

create policy "admins read all users" on public.users for select using (public.is_admin() or id = auth.uid());
create policy "admins update users" on public.users for update using (public.is_admin()) with check (public.is_admin());
create policy "admins manage settings" on public.admin_settings for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage clients" on public.clients for all using (public.is_admin()) with check (public.is_admin());
create policy "clients read self" on public.clients for select using (auth_user_id = auth.uid());
create policy "members read projects" on public.projects for select using (public.is_project_member(id));
create policy "admins manage projects" on public.projects for all using (public.is_admin()) with check (public.is_admin());
create policy "members read project links" on public.project_clients for select using (public.is_project_member(project_id));
create policy "admins manage project links" on public.project_clients for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage templates" on public.templates for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage template tasks" on public.template_tasks for all using (public.is_admin()) with check (public.is_admin());
create policy "members read allowed tasks" on public.project_tasks for select using (public.is_admin() or (public.is_project_member(project_id) and assignee_id = public.current_client_id() and client_visible and status <> 'draft'));
create policy "admins manage project tasks" on public.project_tasks for all using (public.is_admin()) with check (public.is_admin());
create policy "members read task threads" on public.task_threads for select using (public.can_access_task(task_id));
create policy "admins manage task threads" on public.task_threads for all using (public.is_admin()) with check (public.is_admin());
create policy "members read task messages" on public.task_messages for select using (public.can_access_task(task_id));
create policy "members send task messages" on public.task_messages for insert with check (sender_id = auth.uid() and public.can_access_task(task_id) and exists(select 1 from public.task_threads t where t.id = thread_id and t.task_id = task_id));
create policy "members read project threads" on public.project_threads for select using (public.is_project_member(project_id));
create policy "admins manage project threads" on public.project_threads for all using (public.is_admin()) with check (public.is_admin());
create policy "members read project messages" on public.project_messages for select using (public.is_project_member(project_id));
create policy "members send project messages" on public.project_messages for insert with check (sender_id = auth.uid() and public.is_project_member(project_id) and exists(select 1 from public.project_threads t where t.id = thread_id and t.project_id = project_id));
create policy "users read notifications" on public.notifications for select using (user_id = auth.uid());
create policy "users update notifications" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins create notifications" on public.notifications for insert with check (public.is_admin());
create policy "members read task activity" on public.task_activity for select using (public.can_access_task(task_id));
create policy "admins manage task activity" on public.task_activity for all using (public.is_admin()) with check (public.is_admin());
create policy "clients read own submissions" on public.form_submissions for select using (submitted_by = auth.uid() or public.is_admin());
create policy "admins read deliveries" on public.email_deliveries for select using (public.is_admin());

grant execute on function public.setup_first_admin(text, text) to authenticated;
grant execute on function public.seed_default_template() to authenticated;
grant execute on function public.create_project_bundle(text, uuid, text, text, text) to authenticated;
grant execute on function public.import_template_tasks(uuid, uuid, uuid[], public.task_status) to authenticated;
grant execute on function public.complete_project_task(uuid) to authenticated;
grant execute on function public.submit_form_task(uuid, jsonb) to authenticated;
grant execute on function public.activate_current_client() to authenticated;

alter publication supabase_realtime add table public.task_messages;
alter publication supabase_realtime add table public.project_messages;
alter publication supabase_realtime add table public.notifications;

commit;
