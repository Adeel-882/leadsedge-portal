-- Restore the previous application first. Preserve request history/tombstones.
begin;
set local lock_timeout='5s';
drop function public.finish_project_creation(uuid,text,jsonb);
drop function public.create_project_bundle_once(uuid,text,text,uuid,text,text,text);
drop function public.claim_project_creation(uuid,text);
drop function public.project_creation_readiness();
-- Keep public.project_creation_requests; deleting it would discard retry protection.
-- Existing invitation tracking and original create_project_bundle are unchanged.
notify pgrst,'reload schema';
commit;
