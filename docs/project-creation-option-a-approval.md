# Option A — migration approval checkpoint

Reviewed November 19, 2026. No migration, push, deployment, invitation, or production data modification was performed.

## Scope

Permanent migration-first repair only. The user's newer instruction supersedes the earlier Elite recovery recommendation: **do not restore deleted Elite projects or resend their invitations**. No restoration or resend is part of this release.

## Exact SQL proposed, in order

1. `supabase/migrations/202611190001_client_invitation_tracking.sql`
   SHA256: `8AE6FDFE05A46D21A653E53452B87C009137BB75EC2BF434AD8CAAE352763BC4`
2. `supabase/migrations/202611190002_project_creation_idempotency.sql`
   SHA256: `9C0E3668A922703F1EF77C1E2B1F4A7DFF6D4DEA01B4DF07683192C94C75FF22`

These files are the complete executable SQL for approval, not excerpts. Neither was changed during this review. Each has its own BEGIN/COMMIT, 5-second lock timeout, 30-second statement timeout and PostgREST schema notification. Execute individually with stop-on-error only after explicit approval; never run a bulk pending-migration command. If a file fails, stop and inspect; do not blindly rerun after a lost connection.

## Fresh Frankfurt compatibility findings

Read-only repeatable-read snapshot at 2026-11-19 19:57:19 Asia/Karachi, guarded Frankfurt project `tfrljxzknnhkynobvetg`, eu-central-1, PostgreSQL 17.6.

- Both proposed tables are absent, all seven proposed functions are absent, and neither version is in the migration ledger. No name collision detected.
- Referenced UUID keys and columns exist. Existing email delivery constraints accept `sent`/`failed`; invitation delivery inserts match these columns.
- Live `create_project_bundle(text,uuid,text,text,text)` returns `TABLE(project_id uuid,client_id uuid)` and enforces `is_admin()`. The wrapper matches this contract and preserves the original function.
- Existing `is_admin()` uses the authenticated user's public profile role. New request writes repeat this authorization check; request RLS limits reads to the owning administrator. Invitation tracking writes are service-role-only; authenticated administrators can read selected status columns, not credential fingerprints.
- Existing clients/projects/users update triggers are unchanged. No existing table policy, function grant, or Realtime publication membership is altered by either file.
- Existing bundle creation updates the selected client's name/company through its original upsert when a future administrator creates a project. That existing behavior is not a migration-time rewrite; the migrations never invoke the bundle.

Snapshot counts: clients 14; projects 12; project tasks 19; project messages 6; task messages 31; read receipts 37; notifications 73; email deliveries 15. These are a timestamped baseline, not a guarantee that normal production activity will freeze before deployment.

## Data preservation and locking

No top-level DELETE, UPDATE, TRUNCATE, DROP, backfill, or existing-record insertion occurs. DML within new function definitions executes only on future explicit calls. New foreign keys point FROM new tracking/request tables TO existing records. Their cascade rules can remove new tracking/request rows if a parent is explicitly deleted in future; they cannot cascade upward to delete clients, Auth identities, projects or email history.

Foreign-key creation briefly locks referenced tables; these are empty new tables with no existing rows to validate. Lock timeout prevents prolonged waiting but does not promise zero transient contention. No global advisory lock is added. Runtime idempotency locks concern an individual request row/unique key. Earlier disposable PostgreSQL tests verified concurrent duplicate requests create exactly one bundle. Production load testing was not performed.

## Recovery checkpoint — NOT YET READY

The existing encrypted application archive dated November 11 (November 12 Pakistan time) was independently read completely with pg_restore to NUL and its SHA256 matches its manifest. It excludes Auth data and its manifest says restoreTested=false. It is too old to establish recovery of today's application data.

A fresh export was attempted through the existing guarded exporter to the existing EFS-encrypted `C:\Users\adeel_utu7nye\AppData\Local\LeadsEdge-Recovery` directory. Automatic approval review rejected execution because verification authorization did not explicitly authorize exporting sensitive production application data to this destination. No fresh export was created. Do not bypass this block.

Required before migration approval/execution: explicit approval for that local application-data export, or verification of a current provider-managed recovery point. A new export must have encryption, hash, archive inventory and full-read verification. Archive verification alone must not be described as an actual restore test.

## Verification and release sequence

Previous unchanged local implementation validation: 607 tests passed, 1 skipped; typecheck, lint and Frankfurt standalone build passed; disposable PostgreSQL concurrency/isolation/rollback tests passed. Real desktop/mobile visual verification remains pending. This review did not modify application code or rerun the unchanged suite.

1. Resolve the recovery checkpoint, obtain explicit approval for these exact SQL files, and reconfirm live prerequisites immediately before applying.
2. Apply only 001; verify table/RLS/grants/three functions and Data API discovery. Apply only 002; verify table/own-admin policy/four functions and readiness through an approved administrator session. Record only these versions through the established migration-ledger mechanism after successful execution; do not apply unrelated migrations.
3. Compare existing metadata and data-integrity evidence before/after, accounting for legitimate concurrent activity; verify original bundle, existing policies/triggers and Realtime members unchanged. Do not send invitations as part of migration verification.
4. Prepare a focused Git diff/commit and final checks. Provide the exact commit and release steps before push/deployment authorization. No new Hostinger environment variable is needed. Do not deploy this app before both migrations are verified.
5. After approved deployment, use an explicitly approved disposable test account/project for invitation acceptance. Never restore or resend deleted Elite invitations.

If either transaction fails it rolls back its own file. If 001 succeeds and 002 fails, stop; do not deploy the new app. Keep the additive tracking objects. If application rollback is later needed, restore the prior artifact first; retain both new tables and their audit/request history. The prepared idempotency function rollback is in `docs/project-creation-idempotency-rollback.sql`; it is not authorized for execution here.
