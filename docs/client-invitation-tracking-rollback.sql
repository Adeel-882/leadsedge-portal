-- Deploy the previous application first. Preserve all invitation history.
begin;
set local lock_timeout = '5s';
drop function public.prepare_client_invitation_attempt(uuid,uuid,uuid,text,text,timestamptz,integer);
drop function public.finish_client_invitation_delivery(uuid,boolean,text);
drop function public.record_client_invitation_sign_in(text,uuid);
-- Deliberately retain the additive table and its read-only admin policy.
-- Removing it would destroy invitation audit history and needs separate approval.
notify pgrst, 'reload schema';
commit;
