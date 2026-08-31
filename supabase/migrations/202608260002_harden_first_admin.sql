begin;

-- User-controlled auth metadata must never grant an application role.
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
    'client'::public.user_role,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;
  return new;
end;
$$;

-- Serialize first-admin promotion and lock the route after the first success.
create or replace function public.setup_first_admin(display_name text, admin_timezone text default 'UTC')
returns void language plpgsql security definer set search_path = public
as $$
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
$$;

grant execute on function public.setup_first_admin(text, text) to authenticated;

commit;
