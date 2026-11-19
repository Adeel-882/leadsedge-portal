begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Separate approval required. No existing business table or function is rewritten.
create table public.project_creation_requests (
  administrator_id uuid not null references public.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  -- Retain committed IDs as tombstones even after an explicit project deletion.
  -- Do not block existing deletion or allow an old request to recreate it.
  project_id uuid,
  client_id uuid,
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key(administrator_id,request_id)
);
alter table public.project_creation_requests enable row level security;
revoke all on public.project_creation_requests from public,anon,authenticated;
grant select on public.project_creation_requests to authenticated;
grant all on public.project_creation_requests to service_role;
create policy "admins read own creation requests" on public.project_creation_requests for select to authenticated using(administrator_id=auth.uid() and public.is_admin());

-- Invoked as a read-only GET through PostgREST before any Auth or project writes.
create function public.project_creation_readiness() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare signature text; routine regprocedure;
begin
  if not public.is_admin() then return false; end if;
  if to_regclass('public.client_invitation_attempts') is null or to_regclass('public.project_creation_requests') is null then return false; end if;
  foreach signature in array array[
    'public.prepare_client_invitation_attempt(uuid,uuid,uuid,text,text,timestamp with time zone,integer)',
    'public.finish_client_invitation_delivery(uuid,boolean,text)',
    'public.record_client_invitation_sign_in(text,uuid)'
  ] loop
    routine:=to_regprocedure(signature);
    if routine is null or not has_function_privilege('service_role',routine,'execute') then return false; end if;
  end loop;
  if not has_table_privilege('service_role','public.client_invitation_attempts','SELECT')
    or not has_table_privilege('service_role','public.client_invitation_attempts','INSERT')
    or not has_table_privilege('service_role','public.client_invitation_attempts','UPDATE') then return false; end if;
  return true;
end;
$$;

create function public.claim_project_creation(request_id_input uuid,payload_hash_input text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare attempt public.project_creation_requests; inserted integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not public.project_creation_readiness() then raise exception 'Project creation infrastructure unavailable'; end if;
  insert into public.project_creation_requests(administrator_id,request_id,payload_hash)
  values(auth.uid(),request_id_input,payload_hash_input) on conflict do nothing;
  get diagnostics inserted=row_count;
  select * into strict attempt from public.project_creation_requests where administrator_id=auth.uid() and request_id=request_id_input;
  if attempt.payload_hash<>payload_hash_input then raise exception 'Idempotency key payload mismatch'; end if;
  return jsonb_build_object('acquired',inserted=1,'projectId',attempt.project_id,'clientId',attempt.client_id,'result',attempt.result);
end;
$$;

-- Request record and original bundle are committed in the SAME transaction.
create function public.create_project_bundle_once(request_id_input uuid,payload_hash_input text,project_name_input text,client_auth_user_id_input uuid,client_full_name_input text,client_email_input text,client_company_input text default null)
returns table(project_id uuid,client_id uuid) language plpgsql security definer set search_path='' as $$
declare attempt public.project_creation_requests; created record;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into strict attempt from public.project_creation_requests where administrator_id=auth.uid() and request_id=request_id_input for update;
  if attempt.payload_hash<>payload_hash_input then raise exception 'Idempotency key payload mismatch'; end if;
  if attempt.project_id is not null then return query select attempt.project_id,attempt.client_id; return; end if;
  select * into strict created from public.create_project_bundle(project_name_input,client_auth_user_id_input,client_full_name_input,client_email_input,client_company_input);
  update public.project_creation_requests r set project_id=created.project_id,client_id=created.client_id where r.administrator_id=auth.uid() and r.request_id=request_id_input;
  return query select created.project_id,created.client_id;
end;
$$;

create function public.finish_project_creation(request_id_input uuid,payload_hash_input text,result_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.project_creation_requests r set result=coalesce(r.result,result_input)
  where r.administrator_id=auth.uid() and r.request_id=request_id_input and r.payload_hash=payload_hash_input
    and r.project_id is not null and result_input->>'projectId'=r.project_id::text;
  if not found then raise exception 'Project result unavailable'; end if;
end;
$$;
revoke all on function public.project_creation_readiness(),public.claim_project_creation(uuid,text),public.create_project_bundle_once(uuid,text,text,uuid,text,text,text),public.finish_project_creation(uuid,text,jsonb) from public,anon;
grant execute on function public.project_creation_readiness(),public.claim_project_creation(uuid,text),public.create_project_bundle_once(uuid,text,text,uuid,text,text,text),public.finish_project_creation(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
