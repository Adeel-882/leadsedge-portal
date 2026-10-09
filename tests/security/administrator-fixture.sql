-- Disposable LOCAL database only. Minimal current role/RLS/identity model.
create schema auth;
do $$begin create role anon nologin; exception when duplicate_object then null; end;$$;
do $$begin create role authenticated nologin; exception when duplicate_object then null; end;$$;
do $$begin create role service_role nologin bypassrls; exception when duplicate_object then null; end;$$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
grant usage on schema public,auth to authenticated,anon,service_role;
create table auth.users(id uuid primary key,email text unique,created_at timestamptz default now(),email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create type public.user_role as enum('admin','client');
create table public.users(id uuid primary key references auth.users(id),email text unique not null,role public.user_role not null default 'client',full_name text not null,created_at timestamptz default now());
create table public.clients(id uuid primary key default gen_random_uuid(),auth_user_id uuid references public.users(id),email text unique not null,status text not null default 'active');
create table public.projects(id uuid primary key default gen_random_uuid(),owner_id uuid references public.users(id));
create table public.project_clients(project_id uuid references public.projects(id),client_id uuid references public.clients(id));
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.users where id=auth.uid() and role='admin') $$;
create function public.is_project_member(target_project_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.is_admin() or exists(select 1 from public.project_clients pc join public.clients c on c.id=pc.client_id where pc.project_id=target_project_id and c.auth_user_id=auth.uid() and c.status<>'disabled') $$;
create function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into public.users(id,email,role,full_name) values(new.id,new.email,'client'::public.user_role,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(new.email,'@',1)))
 on conflict(id) do update set email=excluded.email,full_name=excluded.full_name;
 return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
create policy "admins read all users" on public.users for select using(public.is_admin() or id=auth.uid());
create policy "admins update users" on public.users for update using(public.is_admin()) with check(public.is_admin());
create policy "admins manage clients" on public.clients for all using(public.is_admin()) with check(public.is_admin());
create policy "clients read self" on public.clients for select using(auth_user_id=auth.uid());
create policy "admins manage projects" on public.projects for all using(public.is_admin()) with check(public.is_admin());
create policy "members read projects" on public.projects for select using(public.is_project_member(id));
grant all on all tables in schema public to authenticated,service_role;
grant select on all tables in schema public to anon;
-- Existing trusted admin and ordinary client fixtures, never Frankfurt accounts.
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000001','admin-a@example.test',now()),
 ('10000000-0000-4000-8000-000000000020','client@example.test',now());
update public.users set role='admin' where email='admin-a@example.test';
insert into public.clients(auth_user_id,email) values('10000000-0000-4000-8000-000000000020','client@example.test');
insert into public.projects(id,owner_id) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
insert into public.project_clients select '20000000-0000-4000-8000-000000000001',id from public.clients;
