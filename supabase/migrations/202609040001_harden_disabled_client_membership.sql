begin;

-- Only active portal clients may read their own project membership rows.
-- Administrator access remains governed by the existing is_admin() helper.
drop policy if exists "members read own project links" on public.project_clients;
create policy "members read own project links"
on public.project_clients
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.clients client
    where client.id = project_clients.client_id
      and client.auth_user_id = auth.uid()
      and client.status = 'active'
  )
);

commit;
