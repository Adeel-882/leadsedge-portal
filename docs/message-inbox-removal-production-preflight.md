# Frankfurt inbox migration — production preflight

Status: APPROVED MIGRATION APPLIED AND VERIFIED. Hostinger activation pending.

## Final handoff

- User will verify and deploy personally; Hostinger tab closed without changes.
- Regression rerun: 513 passed, 1 skipped. Initial restricted execution failed
  on Windows temporary-cache renames before running tests; normal permitted
  execution passed. Typecheck, lint, and `build:frankfurt` all exited 0.
- Deploy the reviewed application version containing inbox removal, then set
  `LEADSEDGE_INBOX_REMOVAL_ENABLED=true` in Hostinger and restart/redeploy so
  the running server receives it. Do not rerun the already-applied migration.
- Refresh `/admin/messages`. Expect Select chats above the inbox and a menu
  beside each row. Confirm removal only on an approved test conversation first.
- Production browser deletion, refresh persistence, second-admin/client checks,
  and incoming-message reopening remain for user acceptance. Database catalog
  and atomic integrity verification passed; these are not substitutes for the
  browser acceptance tests or proof of the deployed commit.

## Live execution (2026-11-11)

The user subsequently instructed proceeding directly on Frankfurt without new
installations or a private restore test. The encrypted backup was retained as a
prerequisite; no restore test is claimed.

- Full custom-format read-only PostgreSQL export completed in the private EFS
  AES-256 directory outside the repository. Archive size: 2,587,318 bytes.
  Archive SHA-256:
  `4eb428fc8d9c6c43e5a304c9b52c65e814af915678e9c629f3918eed6d66ebf9`.
- Archive inventory includes required Auth/application tables. `pg_restore`
  successfully read the whole archive to the null output device. This verifies
  archive readability, NOT restoration into a compatible database. External
  Storage object binaries and provider-managed encryption keys are not supplied
  by a PostgreSQL logical dump; it is not a complete provider disaster snapshot.
- Immediately preceding execution, all six reviewed catalog sections matched.
- Only `202611110001_message_inbox_visibility.sql` was applied, with its reviewed
  SHA-256 enforced. Transactional guards added a repeatable-read snapshot,
  3-second lock timeout, 30-second per-statement timeout, and integrity assertions.
- COMMIT succeeded. Row counts plus ordered row fingerprints across 51 existing
  public/Auth tables matched before and after inside the same transaction.
  All 17 users retained the same unread counts. No existing records were changed
  by the migration. Concurrent legitimate writes are outside that snapshot.
- Post-commit read-only verification confirmed the new empty visibility table,
  owner/admin SELECT RLS, no authenticated direct writes, restricted RPC grants,
  both new BEFORE INSERT triggers and both original notification triggers.
- Realtime retained all five original members and added only
  `message_inbox_visibility`. No advisory lock waiters were observed afterward.
- No live chat-removal or new-message acceptance test performed yet. No messages
  sent, identities created, authentication sessions changed, or test data added.
- Local application commit containing the feature:
  `4d6d1ef70defd844ebcefd9a9d5707f4dc62702c`. This is NOT yet verified as the
  Hostinger deployment commit. Hostinger browser currently requires sign-in.
- No feature flag change, GitHub push, or Hostinger deployment performed.
  Rollback SQL remains `docs/message-inbox-removal.rollback.sql`; disable the
  application flag first. Never restore over production without separate approval.

Earlier sections below are historical checkpoints, superseded by this execution.

## Follow-up after recovery/deployment approval (2026-11-11)

- User explicitly approved an encrypted local recovery export, isolated restore,
  this migration only, focused deployment, and later feature activation.
- Created a private recovery directory outside Git/deployment paths at
  `%LOCALAPPDATA%/LeadsEdge-Recovery`. Windows EFS reports AES-256 encryption.
  Inherited permissions were removed; access is restricted to the current
  Windows user and SYSTEM. No database contents have been exported there.
- Fresh read-only Frankfurt inventory confirms PostgreSQL 17.6 with
  `supabase_vault` 0.3.1 and `pg_cron` 1.6.4, alongside the ordinary PostgreSQL
  extensions. Database size at check: 33,664,147 bytes.
- Available portable PostgreSQL 17.11 lacks `supabase_vault` and `pg_cron`.
  Previous synthetic migration tests deliberately omitted historical scheduler
  setup; they do not prove that a complete production recovery restores.
- WSL reports it is not installed. Docker Desktop is not installed at its
  standard location and no Docker executable is available on PATH.
- A complete compatible restore cannot currently be verified on this machine.
  Do not silently omit provider schemas/extensions or substitute stubs and call
  that a verified complete backup. A compatible isolated Linux/Supabase runtime
  is needed, with outbound integrations disabled before loading any data.
- No production export, migration, feature activation, push, or deployment was
  performed in this follow-up. Existing data is unchanged. The feature remains
  pending; production application commit has not yet been verified.
- Next prerequisite: arrange a compatible isolated recovery environment. Local
  WSL/container installation is a machine-level setup change and may require
  elevation/restart. Do not transfer the recovery data to another service.

## Earlier preflight evidence

- Live functions, columns, RLS policies, triggers, grants and publication match
  the previously reviewed snapshot exactly (normalized catalog comparison).
- Current catalog and unread function saved to the gitignored
  work/inbox-migration-checkpoint directory.
- Reviewed SQL SHA256:
  03FF815EFCDF1168F651C07614707154833637E8125FFD54876BE1D206336735
- The migration contains no DML against existing business/message/receipt tables.
- Exact migration and isolation/concurrency tests passed again in disposable
  local PostgreSQL. Existing messages, tasks/projects, receipt and notification
  behavior remained intact in the fixture.
- Load tests: 8 clients, 200 transactions per scenario, zero failures/deadlocks.
  Baseline message latency: average 3.85ms, p95 10.56ms, max 28.79ms.
  New trigger: average 13.67ms, p95 29.11ms, max 42.36ms.
  Mixed removal/messages: average 13.76ms, p95 24.95ms, max 34.99ms.
  These are local PostgreSQL timings, not production/network latency guarantees.
- Read-only Frankfurt aggregate at check time: 1 project user message and 0 task
  user messages in 24h; no other active transactions or conflicting advisory key.
- Authenticated Supabase dashboard: Free Plan does not include project backups;
  PITR is unavailable without the Pro add-on. No provider recovery point verified.
- Automatic approval review rejected the attempted full public/auth/history dump
  as beyond the approval to confirm an existing recovery point. No data export
  was performed. Separate explicit approval is needed for that private export.
- No migration, flag, publication, production data, GitHub or Hostinger changes.

Next: obtain approval for a private local recovery archive (contains client data
and Auth records), validate restoration in isolation, then repeat live preflight
and apply only the exact approved migration. Do not enable the feature flag yet.
