# Frankfurt migration 002 — execution and read-only verification

## Execution

Applied only `supabase/migrations/202611190002_project_creation_idempotency.sql` following explicit user approval. SHA256 matched `9C0E3668A922703F1EF77C1E2B1F4A7DFF6D4DEA01B4DF07683192C94C75FF22` immediately before execution. Guarded target: `tfrljxzknnhkynobvetg`, eu-central-1 pooler, database postgres. Migration 001 was not rerun.

Preflight confirmed migration 001's empty table, RLS, grants, three functions and HTTP 200 table/OpenAPI discovery. Migration 002's table/functions were absent and its ledger version was absent. Inspected existing schema matched the previous reviewed snapshot.

The approved November 19 recovery archive was reverified: SHA256, full decoding to NUL, Windows EFS encryption and account-only ACL all passed. No backup restore was performed.

psql ON_ERROR_STOP executed the exact approved file in its existing transaction. Exit code 0. Execution output: BEGIN, SET, SET, CREATE TABLE, ALTER TABLE, REVOKE, GRANT, GRANT, CREATE POLICY, four CREATE FUNCTION operations, REVOKE, GRANT, NOTIFY, COMMIT. No separate mutation or migration was executed.

## Objects and authorization

- public.project_creation_requests exists, RLS enabled, zero rows.
- Policy: authenticated SELECT only where administrator_id=auth.uid() AND is_admin().
- authenticated has SELECT but no direct INSERT, UPDATE or DELETE. anon has no SELECT.
- project_creation_readiness(), claim_project_creation(uuid,text), create_project_bundle_once(uuid,text,text,uuid,text,text,text), finish_project_creation(uuid,text,jsonb) all exist.
- All four are SECURITY DEFINER with empty search_path. authenticated has EXECUTE; anon does not. Function bodies retain their administrator checks.
- Read-only transaction tests used SET LOCAL ROLE authenticated and transaction-local claims for existing administrator/client profiles. Administrator readiness=true, client readiness=false, missing-identity readiness=false. These are database-role tests, not newly issued sessions or browser sign-ins. The transaction ended with ROLLBACK; no identities were created or updated.
- PostgREST OpenAPI HTTP 200 exposes all seven RPCs from both migrations. The new table's GET returned 200. Anonymous GET of readiness returned 401 as expected. No write RPC was invoked. Authenticated HTTP end-to-end testing remains pending separate approval; database execution privileges and role-context readiness were verified directly.

## Existing data preservation

Counts and ordered aggregate full-row fingerprints matched across all 25 preexisting application tables and auth.users/auth.identities (27 tables). No raw Auth data was exported. The migration 001 table remained empty. New request table remains empty.

| Records | Before | After |
|---|---:|---:|
| Auth users | 16 | 16 |
| Auth identities | 16 | 16 |
| Clients | 14 | 14 |
| Projects | 12 | 12 |
| Project tasks | 19 | 19 |
| Project messages | 6 | 6 |
| Task messages | 31 | 31 |
| Read receipts | 37 | 37 |
| Notifications | 73 | 73 |
| Email deliveries | 15 | 15 |
| Email outbox | 23 | 23 |

Inspected existing columns, constraints, original bundle/admin functions and their grants, triggers, RLS policies and Realtime membership also matched. No Elite project was restored/deleted and no invitation was sent or resent.

## Application compatibility and remaining work

The installed signatures match the reviewed application's claim, bundle and finish parameters. Its readiness dependency now returns true for an administrator, and service-role discovery finds the required tracking table/RPCs. This verifies the missing database prerequisites, not end-to-end project creation or email delivery. The user reports the application is already deployed; no independent Hostinger commit verification or new deployment occurred here.

Neither approved SQL file inserts a migration-ledger row. Both object sets are installed, but future migration tooling must reconcile their ledger entries separately before running migrations. Do not rerun either file or issue a bulk migration command. No ledger change was included in this execution.

Wait for separate approval identifying an authorized test account before creating a project, sending an invitation, validating sign-in tracking or testing duplicate requests through the live application. No push/redeployment is currently indicated by these checks.

Evidence: work/migration002-execution.log, work/migration002-prerequisite.json, work/migration002-before.json, work/migration002-after.json, work/migration002-verification.json, work/migration002-api-verification.json, work/migration002-pre-schema.json, work/migration002-post-schema.json.
