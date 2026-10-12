\set ON_ERROR_STOP on
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'Assertion failed: %',label; end if; end;$$;
create function pg_temp.must_deny(statement text) returns void language plpgsql as $$begin
 begin execute statement; exception when others then return; end;
 raise exception 'Expected rejection: %',statement;
end;$$;
-- LOCAL ONLY: compatibility fixture using Frankfurt function definitions read 2026-10-09.
-- Rolled back; no Frankfurt connection. Minimal supporting tables, not full production schema.
begin;
alter table public.users add column updated_at timestamptz default now();
alter table public.clients add column updated_at timestamptz default now(), add column full_name text, add column company text;
alter table public.projects add column project_name text;
alter table public.project_clients add column is_primary boolean default false;
create table public.project_threads(project_id uuid references public.projects(id));
create table public.notifications(user_id uuid,project_id uuid,type text,title text,body text,target_url text);
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients for each row execute function public.set_updated_at();
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
$function$;

set role authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
update public.users set full_name='Updated Admin' where id=auth.uid();
select pg_temp.assert_true((select full_name='Updated Admin' from public.users where id=auth.uid()),'admin settings name update permitted');
update public.users set full_name='Updated Client' where email='client@example.test';
select pg_temp.assert_true((select full_name='Updated Client' from public.users where email='client@example.test'),'People linked client name update permitted');
select * from public.create_project_bundle('Existing client project','10000000-0000-4000-8000-000000000020','Client','client@example.test',null);
select * from public.create_project_bundle('Repeated existing client project','10000000-0000-4000-8000-000000000020','Client','client@example.test',null);
select pg_temp.assert_true((select count(*)=1 from public.clients where email='client@example.test'),'existing client upsert retains one identity');
reset role;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000099','new-client@example.test');
set role authenticated;
select * from public.create_project_bundle('New invited client project','10000000-0000-4000-8000-000000000099','New Client','new-client@example.test',null);
select pg_temp.assert_true((select count(*)=1 from public.clients where auth_user_id='10000000-0000-4000-8000-000000000099'),'new client invitation can link initial client profile');
select pg_temp.must_deny($q$select * from public.create_project_bundle('Invalid admin client','10000000-0000-4000-8000-000000000001','Admin','admin-a@example.test',null)$q$);
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000020';
update public.users set full_name='Unauthorized edit' where id=auth.uid();
select pg_temp.assert_true((select full_name='Updated Client' from public.users where id=auth.uid()),'existing client profile RLS unchanged');
reset role;
rollback;
