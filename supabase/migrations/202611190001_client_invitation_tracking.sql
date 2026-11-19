begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Additive: never backfill or infer credential use from last_sign_in_at.
create table public.client_invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  credential_fingerprint text not null unique check (credential_fingerprint ~ '^[0-9a-f]{64}$'),
  credential_type text not null check (credential_type in ('invite', 'magiclink')),
  created_at timestamptz not null default clock_timestamp(),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','failed')),
  sent_at timestamptz,
  signed_in_at timestamptz,
  email_delivery_id uuid unique references public.email_deliveries(id) on delete set null,
  check (expires_at > issued_at),
  check ((delivery_status = 'sent') = (sent_at is not null))
);
create index client_invitation_attempts_latest_idx on public.client_invitation_attempts(project_id,client_id,created_at desc,id desc);
alter table public.client_invitation_attempts enable row level security;
revoke all on public.client_invitation_attempts from public,anon,authenticated;
grant select(id,client_id,project_id,created_at,issued_at,expires_at,delivery_status,sent_at,signed_in_at,email_delivery_id) on public.client_invitation_attempts to authenticated;
grant all on public.client_invitation_attempts to service_role;
create policy "administrators read invitation status" on public.client_invitation_attempts for select to authenticated using (public.is_admin());

create function public.prepare_client_invitation_attempt(client_id_input uuid, project_id_input uuid, auth_user_id_input uuid, fingerprint_input text, credential_type_input text, issued_at_input timestamptz, expiry_seconds_input integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare attempt_id uuid;
begin
  if expiry_seconds_input is null or expiry_seconds_input < 1 or expiry_seconds_input > 604800 or issued_at_input is null or issued_at_input > clock_timestamp() + interval '1 minute' then
    raise exception 'Invalid invitation validity window';
  end if;
  if not exists (
    select 1 from public.clients c join public.users u on u.id=c.auth_user_id join auth.users a on a.id=u.id
    join public.project_clients pc on pc.client_id=c.id
    where c.id=client_id_input and pc.project_id=project_id_input and c.auth_user_id=auth_user_id_input
      and u.role='client' and c.status <> 'disabled' and lower(a.email)=lower(c.email)
  ) then raise exception 'Client invitation association unavailable'; end if;
  insert into public.client_invitation_attempts(client_id,project_id,auth_user_id,credential_fingerprint,credential_type,issued_at,expires_at)
  values(client_id_input,project_id_input,auth_user_id_input,fingerprint_input,credential_type_input,issued_at_input,issued_at_input + make_interval(secs => expiry_seconds_input))
  returning id into attempt_id;
  return attempt_id;
end;
$$;

-- Delivery and its existing history record are finalized atomically and once.
create function public.finish_client_invitation_delivery(attempt_id_input uuid, accepted_input boolean, provider_id_input text)
returns void language plpgsql security definer set search_path = '' as $$
declare attempt public.client_invitation_attempts; delivery_id uuid;
begin
  select * into attempt from public.client_invitation_attempts where id=attempt_id_input for update;
  if not found or accepted_input is null then raise exception 'Invitation attempt unavailable'; end if;
  if attempt.delivery_status <> 'pending' then return; end if;
  insert into public.email_deliveries(client_id,project_id,email_type,provider_id,status,error_message)
  values(attempt.client_id,attempt.project_id,'client_invitation',case when accepted_input then provider_id_input else null end,
    case when accepted_input then 'sent' else 'failed' end,case when accepted_input then null else 'Email provider did not accept invitation' end)
  returning id into delivery_id;
  update public.client_invitation_attempts set delivery_status=case when accepted_input then 'sent' else 'failed' end,
    sent_at=case when accepted_input then clock_timestamp() else null end,email_delivery_id=delivery_id where id=attempt.id;
end;
$$;

-- Only the trusted server calls this AFTER verifyOtp + session + authorization.
-- No authenticated/anonymous API caller can record success, even for themselves.
create function public.record_client_invitation_sign_in(fingerprint_input text, auth_user_id_input uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare matched_id uuid;
begin
  update public.client_invitation_attempts i set signed_in_at=coalesce(i.signed_in_at,clock_timestamp())
  where i.credential_fingerprint=fingerprint_input and i.auth_user_id=auth_user_id_input
    and exists(select 1 from public.clients c join public.users u on u.id=c.auth_user_id
      join public.project_clients pc on pc.client_id=c.id
      where c.id=i.client_id and c.auth_user_id=i.auth_user_id and c.status='active' and u.role='client' and pc.project_id=i.project_id)
  returning i.id into matched_id;
  return matched_id is not null;
end;
$$;

revoke all on function public.prepare_client_invitation_attempt(uuid,uuid,uuid,text,text,timestamptz,integer), public.finish_client_invitation_delivery(uuid,boolean,text), public.record_client_invitation_sign_in(text,uuid) from public,anon,authenticated;
grant execute on function public.prepare_client_invitation_attempt(uuid,uuid,uuid,text,text,timestamptz,integer), public.finish_client_invitation_delivery(uuid,boolean,text), public.record_client_invitation_sign_in(text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
