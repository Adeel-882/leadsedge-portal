# Frankfurt migration 001 — applied and verified

Applied only `202611190001_client_invitation_tracking.sql`, SHA256 `8AE6FDFE05A46D21A653E53452B87C009137BB75EC2BF434AD8CAAE352763BC4`, after explicit approval. Connection guarded to project `tfrljxzknnhkynobvetg`, eu-central-1 pooler, database `postgres`. The encrypted recovery archive passed checksum, encryption, account-only ACL and full decoding checks immediately before execution.

Execution used psql with ON_ERROR_STOP and the exact file's existing BEGIN/COMMIT; exit code 0. Output confirmed CREATE TABLE, CREATE INDEX, ALTER TABLE, grants/revocations, CREATE POLICY, three CREATE FUNCTION operations, NOTIFY and COMMIT. No additional SQL mutation or migration was run. In particular, the file does not write the Supabase migration ledger, and no separate ledger insertion was authorized/executed; future tooling must reconcile version 202611190001 before attempting bulk migrations. Do not rerun the already-applied file.

Postflight confirmed the empty invitation attempts table, enabled RLS, administrator-only SELECT policy and the ten approved status-column SELECT grants. Anonymous users have no table grants. The three RPCs are SECURITY DEFINER with an empty search_path; service_role can execute them, anon/authenticated cannot. No RPC was invoked. Data API GET returned 200 for the table and OpenAPI, with all three RPC paths visible. No extra schema-cache refresh was needed.

Counts and ordered aggregate full-row fingerprints matched across all 25 preexisting public tables plus auth.users and auth.identities. Only aggregate fingerprints were returned; no Auth rows or credentials were exported. Auth users 16, Auth identities 16, clients 14, projects 12, tasks 19, project messages 6, task messages 31, read receipts 37, notifications 73, email deliveries 15 before and after. Existing inspected columns, constraints, functions, grants, triggers, RLS policies and Realtime membership also matched.

Migration 002 table and readiness function remain absent. Project creation is not yet operational through the new guarded path. No project or identity was created, no invitation was sent, no Elite record was restored/deleted, and no push or deployment occurred. Stop for separate approval of migration 002.

Local safe evidence: work/migration001-execution.log, work/migration001-before.json, work/migration001-after.json, work/migration001-verification.json, work/migration001-post-schema.json.
