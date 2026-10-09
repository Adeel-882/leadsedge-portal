-- Pending approval: do not apply to Frankfurt until explicitly authorized.
-- Equal administrators; existing admin/client enum and is_admin() stay unchanged.
begin;
create table public.administrator_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check(email=lower(btrim(email)) and length(email)<=254),
  full_name text not null check(length(btrim(full_name)) between 2 and 120),
  invited_by uuid not null references public.users(id) on delete restrict,
  auth_user_id uuid references public.users(id) on delete restrict,
  status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
  delivery_status text not null default 'preparing' check(delivery_status in ('preparing','sent','failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '24 hours'),
  accepted_by uuid references public.users(id) on delete restrict,
  accepted_at timestamptz,
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  check(expires_at>created_at),
  check((status='accepted')=(accepted_at is not null and accepted_by is not null))
);
create unique index administrator_one_pending_email on public.administrator_invitations(email) where status='pending';
create index administrator_invitations_identity on public.administrator_invitations(auth_user_id);
alter table public.administrator_invitations enable row level security;
revoke all on public.administrator_invitations from public, anon, authenticated;
grant select on public.administrator_invitations to authenticated;
create policy "admins read administrator invitations" on public.administrator_invitations
 for select to authenticated using(public.is_admin());

-- Browser writes to role/id/email are never part of profile editing.
-- Existing Settings and People forms update full_name only.
revoke update on public.users from public, anon, authenticated;
grant update(full_name) on public.users to authenticated;

create function public.prepare_administrator_invitation(full_name_input text, email_input text, previous_id uuid default null)
returns public.administrator_invitations language plpgsql security definer set search_path=pg_catalog as $$
declare normalized text := lower(btrim(email_input)); invitation public.administrator_invitations%rowtype;
 previous public.administrator_invitations%rowtype; target uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or full_name_input is null or length(btrim(full_name_input)) not between 2 and 120
 then raise exception 'Invalid invitation details' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-invite:'||normalized,0));
 if previous_id is not null then
   select * into previous from public.administrator_invitations where id=previous_id for update;
   if previous.id is null or previous.email<>normalized or previous.status not in ('pending','expired')
   then raise exception 'Invitation cannot be resent' using errcode='23505'; end if;
   if previous.created_at > now()-interval '60 seconds' and previous.delivery_status<>'failed'
   then raise exception 'Please wait one minute before resending' using errcode='23505'; end if;
   target := previous.auth_user_id;
 end if;
 -- No client conversion, including pending/disabled clients and orphan profiles.
 if exists(select 1 from public.clients where lower(email)=normalized or (target is not null and auth_user_id=target))
 or exists(select 1 from public.users where lower(email)=normalized and (target is null or id<>target or role='admin'))
 or exists(select 1 from auth.users where lower(email)=normalized and (target is null or id<>target))
 then raise exception 'Email already belongs to an account' using errcode='23505'; end if;
 update public.administrator_invitations set status='expired' where email=normalized and status='pending' and expires_at<=now();
 if previous.id is not null then
   update public.administrator_invitations set status='revoked',revoked_by=auth.uid(),revoked_at=now() where id=previous.id;
 end if;
 if exists(select 1 from public.administrator_invitations where email=normalized and status='pending')
 then raise exception 'An invitation is already pending' using errcode='23505'; end if;
 insert into public.administrator_invitations(email,full_name,invited_by,auth_user_id)
 values(normalized,btrim(full_name_input),auth.uid(),target) returning * into invitation;
 return invitation;
end;
$$;

-- Service-only binding verifies the exact reserved identity; a browser-supplied
-- role or metadata field alone can never grant access.
create function public.bind_administrator_invitation(invitation_id uuid, target_user_id uuid, actor_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare invitation public.administrator_invitations%rowtype; identity_row auth.users%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select * into invitation from public.administrator_invitations where id=invitation_id;
 if invitation.id is null then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-invite:'||invitation.email,0));
 select * into invitation from public.administrator_invitations where id=invitation_id for update;
 select * into identity_row from auth.users where id=target_user_id;
 perform 1 from public.users where id=target_user_id for update;
 if invitation.invited_by<>actor_id or invitation.status<>'pending' or invitation.expires_at<=now()
 or not exists(select 1 from public.users where id=actor_id and role='admin')
 or identity_row.id is null or lower(identity_row.email)<>invitation.email
 or (invitation.auth_user_id is not null and invitation.auth_user_id<>target_user_id)
 or (invitation.auth_user_id is null and (identity_row.created_at<invitation.created_at
   or identity_row.raw_user_meta_data->>'administrator_invitation' is distinct from invitation.id::text))
 or not exists(select 1 from public.users where id=target_user_id and role='client' and lower(email)=invitation.email)
 or exists(select 1 from public.clients where auth_user_id=target_user_id or lower(email)=invitation.email)
 then raise exception 'Invitation identity conflict' using errcode='42501'; end if;
 update public.administrator_invitations set auth_user_id=target_user_id where id=invitation.id;
end;
$$;

create function public.record_administrator_invitation_delivery(invitation_id uuid, delivered boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 update public.administrator_invitations set delivery_status=case when delivered then 'sent' else 'failed' end
 where id=invitation_id and status='pending';
end;
$$;

create function public.revoke_administrator_invitation(invitation_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare invitation public.administrator_invitations%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 select * into invitation from public.administrator_invitations where id=invitation_id;
 if invitation.id is null then raise exception 'Invitation unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-invite:'||invitation.email,0));
 update public.administrator_invitations set status='revoked',revoked_by=auth.uid(),revoked_at=now()
 where id=invitation_id and status in ('pending','expired');
 if not found then raise exception 'Invitation is no longer pending' using errcode='23505'; end if;
end;
$$;

create function public.accept_administrator_invitation(invitation_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare invitation public.administrator_invitations%rowtype; identity_email text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into invitation from public.administrator_invitations where id=invitation_id;
 if invitation.id is null then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-invite:'||invitation.email,0));
 select * into invitation from public.administrator_invitations where id=invitation_id for update;
 perform 1 from public.users where id=auth.uid() for update;
 select lower(email) into identity_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if invitation.status<>'pending' or invitation.expires_at<=now() or invitation.auth_user_id is distinct from auth.uid()
 or identity_email is distinct from invitation.email
 or not exists(select 1 from public.users where id=invitation.invited_by and role='admin')
 or not exists(select 1 from public.users where id=auth.uid() and role='client' and lower(email)=invitation.email)
 or exists(select 1 from public.clients where auth_user_id=auth.uid() or lower(email)=invitation.email)
 then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 update public.users set role='admin',full_name=invitation.full_name where id=auth.uid();
 update public.administrator_invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;
 return auth.uid();
end;
$$;

-- Serialize client linkage with acceptance, closing the concurrent client-create
-- vs invitation-accept race. No existing rows or client RLS policies are rewritten.
create function public.guard_client_account_role()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare target_role public.user_role;
begin
 if new.auth_user_id is not null then
   select role into target_role from public.users where id=new.auth_user_id for share;
   if target_role is distinct from 'client'::public.user_role then raise exception 'Client identity required' using errcode='23514'; end if;
 end if;
 return new;
end;
$$;
create trigger client_identity_role_guard before insert or update of auth_user_id on public.clients
for each row execute function public.guard_client_account_role();

revoke all on function public.prepare_administrator_invitation(text,text,uuid),public.revoke_administrator_invitation(uuid),
 public.accept_administrator_invitation(uuid),public.bind_administrator_invitation(uuid,uuid,uuid),
 public.record_administrator_invitation_delivery(uuid,boolean),public.guard_client_account_role() from public,anon,authenticated;
grant execute on function public.prepare_administrator_invitation(text,text,uuid),public.revoke_administrator_invitation(uuid),
 public.accept_administrator_invitation(uuid) to authenticated;
grant execute on function public.bind_administrator_invitation(uuid,uuid,uuid),public.record_administrator_invitation_delivery(uuid,boolean) to service_role;
commit;
