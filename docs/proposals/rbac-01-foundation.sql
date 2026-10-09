-- PROPOSAL ONLY. Not applied, not in supabase/migrations.
-- Must be reviewed together with rbac-02-enforcement.sql and the application cutover.
-- Explicit approval of account backfill is required before executing ANY file.
begin;
create schema if not exists leadsedge_private;
revoke all on schema leadsedge_private from public, anon, authenticated;

create table public.admin_accounts (
  user_id uuid primary key references public.users(id) on delete restrict,
  admin_role text not null check (admin_role in ('super_admin','admin')),
  status text not null check (status in ('active','disabled')),
  preset_label text not null default 'Custom',
  revision bigint not null default 1 check (revision > 0),
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.admin_permissions (
  permission text primary key,
  management_only boolean not null default false
);
insert into public.admin_permissions(permission, management_only) values
 ('dashboard.view',false),
 ('clients.view',false),('clients.create',false),('clients.edit',false),('clients.delete',false),
 ('projects.view',false),('projects.create',false),('projects.delete',false),
 ('tasks.view',false),('tasks.create',false),('tasks.edit',false),('tasks.assign',false),
 ('templates.view',false),('templates.create',false),('templates.edit',false),('templates.delete',false),
 ('messages.view',false),('messages.send',false),
 ('meetings.view',false),('meetings.manage',false),
 ('invitations.send',false),('invitations.resend',false),
 ('settings.view',false),('settings.manage',false),
 ('admins.view',true),('admins.invite',true),('admins.manage_permissions',true),('admins.disable',true);
create table public.admin_permission_grants (
  user_id uuid not null references public.admin_accounts(user_id) on delete cascade,
  permission text not null references public.admin_permissions(permission),
  granted_by uuid not null references public.users(id),
  granted_at timestamptz not null default now(),
  primary key(user_id,permission)
);
create table public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check(email = lower(btrim(email))),
  full_name text not null check(length(btrim(full_name)) between 1 and 200),
  auth_user_id uuid references public.users(id) on delete restrict,
  invited_by uuid not null references public.users(id),
  preset_label text not null default 'Custom',
  status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  accepted_at timestamptz,
  check(expires_at > created_at),
  check((status = 'accepted') = (accepted_at is not null))
);
-- Expired pending invitations are transitioned under an email lock before a resend.
create unique index admin_one_pending_invitation on public.admin_invitations(email) where status='pending';
create table public.admin_invitation_grants (
  invitation_id uuid not null references public.admin_invitations(id) on delete cascade,
  permission text not null references public.admin_permissions(permission),
  primary key(invitation_id,permission)
);
create table public.admin_access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id) on delete restrict,
  target_id uuid references public.users(id) on delete restrict,
  invitation_id uuid references public.admin_invitations(id) on delete restrict,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

-- Arbitrary actor lookup stays outside the Data API. Only trusted functions call it.
create function leadsedge_private.has_permission(actor uuid, required_permission text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
 select exists (
   select 1 from public.admin_accounts a join public.users u on u.id=a.user_id
   join public.admin_permissions p on p.permission=required_permission
   where a.user_id=actor and a.status='active' and u.role='admin'
     and (a.admin_role='super_admin' or (not p.management_only and exists (
       select 1 from public.admin_permission_grants g where g.user_id=actor and g.permission=p.permission
     )))
 );
$$;
create function public.has_admin_permission(required_permission text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
 select leadsedge_private.has_permission(auth.uid(), required_permission);
$$;
create function leadsedge_private.is_admin_identity()
returns boolean language sql stable security definer set search_path = pg_catalog as $$
 select exists(select 1 from public.users where id=auth.uid() and role='admin')
     or exists(select 1 from public.admin_accounts where user_id=auth.uid());
$$;
-- Useful in restrictive RLS: clients retain existing policies; admin identities
-- must pass authoritative permission checks even when disabled or misconfigured.
create function public.admin_permission_gate(required_permission text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
 select not leadsedge_private.is_admin_identity() or public.has_admin_permission(required_permission);
$$;

do $$ declare t text; begin
 foreach t in array array['admin_accounts','admin_permissions','admin_permission_grants','admin_invitations','admin_invitation_grants','admin_access_audit'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy admin_accounts_read on public.admin_accounts for select to authenticated
 using(user_id=auth.uid() or public.has_admin_permission('admins.view'));
create policy admin_permissions_read on public.admin_permissions for select to authenticated
 using(exists(select 1 from public.admin_accounts where user_id=auth.uid() and status='active'));
create policy admin_grants_read on public.admin_permission_grants for select to authenticated
 using(user_id=auth.uid() or public.has_admin_permission('admins.view'));
create policy admin_invitations_read on public.admin_invitations for select to authenticated using(public.has_admin_permission('admins.view'));
create policy admin_invitation_grants_read on public.admin_invitation_grants for select to authenticated using(public.has_admin_permission('admins.view'));
create policy admin_access_audit_read on public.admin_access_audit for select to authenticated using(public.has_admin_permission('admins.view'));

-- All management writes use a single serialization lock. No client table writes.
-- expected_revision prevents an old browser from overwriting a newer decision.
create function public.set_admin_access(target uuid, expected_revision bigint,
  desired_role text, desired_status text, desired_permissions text[], desired_preset text)
returns bigint language plpgsql security definer set search_path = pg_catalog as $$
declare previous public.admin_accounts%rowtype; next_revision bigint;
  previous_grants jsonb;
begin
 perform pg_advisory_xact_lock(193721,1);
 if not public.has_admin_permission('admins.manage_permissions')
    or not public.has_admin_permission('admins.disable') then raise exception 'Access denied' using errcode='42501'; end if;
 if target=auth.uid() then raise exception 'Use another Super Admin to change your access'; end if;
 select * into previous from public.admin_accounts where user_id=target for update;
 if not found or previous.revision<>expected_revision then raise exception 'Administrator changed; refresh first'; end if;
 if desired_role not in ('admin','super_admin') or desired_role is null
    or desired_status not in ('active','disabled') or desired_status is null
    or desired_permissions is null then raise exception 'Invalid access configuration'; end if;
 if exists(select 1 from unnest(desired_permissions) v(permission)
   left join public.admin_permissions p using(permission) where p.permission is null or p.management_only)
 then raise exception 'Unknown or reserved permission'; end if;
 if previous.admin_role='super_admin' and previous.status='active'
    and (desired_role<>'super_admin' or desired_status<>'active')
    and not exists(select 1 from public.admin_accounts where user_id<>target and admin_role='super_admin' and status='active')
 then raise exception 'The last active Super Admin cannot be removed'; end if;
 select coalesce(jsonb_agg(permission order by permission),'[]'::jsonb) into previous_grants
 from public.admin_permission_grants where user_id=target;
 update public.admin_accounts set admin_role=desired_role,status=desired_status,
   preset_label=coalesce(nullif(btrim(desired_preset),''),'Custom'), revision=revision+1,updated_at=now()
 where user_id=target returning revision into next_revision;
 delete from public.admin_permission_grants where user_id=target;
 insert into public.admin_permission_grants(user_id,permission,granted_by)
 select target,permission,auth.uid() from (select distinct unnest(desired_permissions) permission) g;
 insert into public.admin_access_audit(actor_id,target_id,action,before_state,after_state)
 values(auth.uid(),target,'admin.access_changed',to_jsonb(previous)||jsonb_build_object('permissions',previous_grants),
 jsonb_build_object('role',desired_role,'status',desired_status,'permissions',desired_permissions,'revision',next_revision));
 return next_revision;
end;
$$;

-- One-time membership acceptance AFTER the existing Auth verification has
-- established the invited user's session. A raw link never promotes a user.
create function public.accept_admin_invitation(invitation_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare invitation public.admin_invitations%rowtype;
begin
 perform pg_advisory_xact_lock(193721,1);
 select * into invitation from public.admin_invitations where id=invitation_id for update;
 if auth.uid() is null or invitation.id is null or invitation.auth_user_id is distinct from auth.uid()
   or invitation.status<>'pending' or invitation.expires_at<=now()
   or not leadsedge_private.has_permission(invitation.invited_by,'admins.invite')
   or not exists(select 1 from auth.users where id=auth.uid() and lower(email)=invitation.email and email_confirmed_at is not null)
 then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if exists(select 1 from public.clients where auth_user_id=auth.uid())
   or exists(select 1 from public.admin_accounts where user_id=auth.uid())
 then raise exception 'Identity already belongs to a client or administrator'; end if;
 if exists(select 1 from public.admin_invitation_grants g join public.admin_permissions p using(permission)
   where g.invitation_id=invitation.id and p.management_only) then raise exception 'Reserved permission'; end if;
 -- Invites create ordinary admins only; promotions require set_admin_access.
 update public.users set role='admin' where id=auth.uid();
 insert into public.admin_accounts(user_id,admin_role,status,preset_label)
 values(auth.uid(),'admin','active',invitation.preset_label);
 insert into public.admin_permission_grants(user_id,permission,granted_by)
 select auth.uid(),permission,invitation.invited_by from public.admin_invitation_grants where admin_invitation_grants.invitation_id=invitation.id;
 update public.admin_invitations set status='accepted',accepted_at=now() where id=invitation.id;
 insert into public.admin_access_audit(actor_id,target_id,invitation_id,action)
 values(auth.uid(),auth.uid(),invitation.id,'admin.invitation_accepted');
end;
$$;

revoke all on all functions in schema leadsedge_private from public,anon,authenticated;
revoke all on function public.has_admin_permission(text), public.admin_permission_gate(text),
 public.set_admin_access(uuid,bigint,text,text,text[],text),public.accept_admin_invitation(uuid) from public,anon,authenticated;
grant execute on function public.has_admin_permission(text),public.admin_permission_gate(text),
 public.set_admin_access(uuid,bigint,text,text,text[],text),public.accept_admin_invitation(uuid) to authenticated;
commit;
