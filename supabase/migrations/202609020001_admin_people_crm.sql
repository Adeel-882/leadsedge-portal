begin;

-- Optional CRM profile fields. Existing client rows remain valid and retain
-- NULL values until an administrator supplies the information.
alter table public.clients add column if not exists title text;
alter table public.clients add column if not exists phone text;

alter table public.clients drop constraint if exists clients_title_length_check;
alter table public.clients add constraint clients_title_length_check
  check (title is null or length(title) <= 160);

alter table public.clients drop constraint if exists clients_phone_length_check;
alter table public.clients add constraint clients_phone_length_check
  check (phone is null or length(phone) <= 40);

-- Trigram indexes keep contains-style admin search responsive without loading
-- all client records into React. They do not alter query authorization.
create extension if not exists pg_trgm;
create index if not exists clients_full_name_trgm_idx
  on public.clients using gin (full_name gin_trgm_ops);
create index if not exists clients_email_trgm_idx
  on public.clients using gin (email gin_trgm_ops);
create index if not exists clients_company_trgm_idx
  on public.clients using gin (company gin_trgm_ops);
create index if not exists projects_project_name_trgm_idx
  on public.projects using gin (project_name gin_trgm_ops);

-- Admin-only, server-paginated People list. This exposes only the client's
-- own Auth last-sign-in timestamp; it never exposes Auth tokens or metadata.
create or replace function public.get_admin_people(
  search_text text default '',
  page_number integer default 1,
  page_size integer default 25
)
returns table (
  id uuid,
  auth_user_id uuid,
  full_name text,
  email text,
  company text,
  title text,
  phone text,
  status public.client_status,
  created_at timestamptz,
  last_login_at timestamptz,
  project_count bigint,
  project_names text[],
  first_project_id uuid,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
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
      min(project.id) as first_project_id
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
$$;

revoke all on function public.get_admin_people(text, integer, integer)
  from public, anon;
grant execute on function public.get_admin_people(text, integer, integer)
  to authenticated;

-- Detail pages use this narrow helper instead of service-role browser access or
-- an N+1 Auth Admin lookup. It returns one timestamp and nothing else from Auth.
create or replace function public.get_admin_client_last_login(target_client_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, auth
as $$
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
$$;

revoke all on function public.get_admin_client_last_login(uuid)
  from public, anon;
grant execute on function public.get_admin_client_last_login(uuid)
  to authenticated;

commit;
