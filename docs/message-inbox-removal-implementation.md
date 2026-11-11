# Select & Delete Chats — local implementation

## Approval boundary

Implemented locally. Frankfurt was inspected only in READ ONLY transactions;
no production schema, publication, permissions, identities or data were modified.
No push or deployment. The feature defaults OFF via
`LEADSEDGE_INBOX_REMOVAL_ENABLED=false` until the migration receives separate approval.

## Live Frankfurt compatibility (2026-11-11)

Read-only catalog results are retained locally in `work/inbox-live-catalog.json`
and `work/phase9-inbox-constraints.txt` (schema metadata, no message bodies).

- Live `get_unread_message_count` body exactly matches the latest repository
  definition after whitespace normalization. Return type bigint, SECURITY DEFINER,
  public search path, authenticated/service-role execution are preserved.
- `is_admin`, `is_project_member` and `can_access_task` are present with expected
  admin checks and client membership/assignment/visibility/disabled-account gates.
  None is replaced by this migration.
- users/projects/project_tasks have UUID primary keys matching the new foreign
  keys. Message and parent tables have RLS enabled.
- Existing message RLS and grants were inspected; the migration changes none.
- The existing task/project AFTER INSERT notification triggers are preserved.
- No visibility table exists. Realtime currently contains project_tasks,
  project_messages, task_messages, notifications and message_read_receipts.
  Add only the new visibility table. The app adds two own-user INSERT/UPDATE
  registrations to the existing single admin channel, never a second channel.

No schema drift requiring changes to existing authorization was found. The final
SQL improves the proposal's locking: one short transaction advisory lock is taken
before visibility writes and before user-message insert side effects. It covers
bulk and multi-resource operations without opposite resource lock orders. This
briefly serializes user-message inserts and visibility mutations; transactions
perform no external calls. Existing PostgreSQL transaction isolation and failure
rollback still apply. System messages skip this lock/reopening path.

## Final SQL and rollback

- `supabase/migrations/202611110001_message_inbox_visibility.sql` is the exact
  locally tested migration. It has NOT been applied to Frankfurt.
- `docs/message-inbox-removal.proposed.sql` mirrors that final SQL.
- `docs/message-inbox-removal.rollback.sql` restores the captured live unread
  function and removes the new triggers/RPC/publication membership, while keeping
  personal visibility preferences recoverable in the owner-protected table.

## Behavior

Administrators get a per-row three-dot action and Select chats mode with separate
checkboxes, selected count, Delete selected and Cancel selection. Checkboxes are
siblings of the thread-opening button. The native modal dialog traps focus,
defaults to Cancel, supports Escape, restores focus, and explains that shared
messages, projects and tasks remain. Removal supports up to 100 conversations in
one atomic operation. Errors leave rows intact with a retryable error.

The endpoint requires an authenticated admin, same-origin JSON, a strict bounded
schema and the current user's Supabase session. It accepts no user identity and
uses no service-role credentials. The database RPC independently checks auth,
admin role, resource existence and authorization. Direct visibility writes are
not granted to browser roles. A client/anonymous caller cannot use the RPC.

After successful persistence, the current inbox is updated and authoritative
counts/inventory are refetched. In-flight inventory/count requests are cancelled
through the existing synchronization coordinator. Hidden keys also accompany
server-loaded data so open-project retention and stale deep links cannot silently
restore hidden chats. Active removal selects a remaining conversation or a clean
empty state and replaces the URL. Search/filtering use the remaining inventory.

Project/task detail links still expose authorized original history. Explicitly
opening a project chat restores the current viewer's visibility. A new genuine
user message restores hidden conversations, including an admin's message sent
from a project/task detail page. System messages do not restore them. No duplicate
thread or task is created.

Unread receipts are NOT marked read by hiding. Hidden conversations do not count
toward that admin's message badge. On reopening, all still-unread older messages
count again until normal reading clears them. Notification rows, delivery and
notification unread counts are unchanged. Other admins and clients retain their
history and visibility.

## Validation

`scripts/test-inbox-database.mjs` creates a new disposable loopback-only PostgreSQL
database, uses historical repository migrations for schema/RLS/notification
triggers, applies the exact new migration, and creates two synthetic admins and
one synthetic client. It never loads .env or connects remotely. The unrelated
historical pg_cron registration is omitted because Windows PostgreSQL lacks it;
the migration under test is unmodified. The database is removed after the run.

Passed: persistent single/bulk hiding across independent connections; own-row
RLS; other-admin/client preservation; direct-write, anonymous and client denial;
invalid-bulk atomic rollback; unread exclusion and restoration; notification and
receipt preservation; system-message exclusion; new-message reopening; concurrent
hide/insert in both serial orders with a deterministic lock barrier; preservation
of parent records and shared project/task message access.

Application tests cover single/bulk RPC calls, explicit restore, spoofed identity,
cross-origin denial, invalid/oversized selection, disabled/demo environments,
database failure, hidden-thread cache retention, own-account Realtime registration
and invalidation, plus the existing messaging suite.

Provider limitation: local PostgreSQL validates persistence/security/concurrency,
not Supabase's hosted websocket transport. Two-tab delivery through actual hosted
Realtime remains a post-migration acceptance check. Demo mutation is deliberately
disabled rather than pretending that a frontend-only removal is persistent.

## Production execution plan — requires separate approval

1. Reconfirm the live catalog has not changed; capture the unread function,
   grants, policy/trigger list and publication membership; create a managed
   database backup/checkpoint before migration.
2. Apply ONLY `202611110001_message_inbox_visibility.sql` transactionally. Do not
   run an indiscriminate migration push: this checkout contains unrelated work,
   including the unfinished Multi-Admin migration.
3. Verify new table/RLS/grants/functions/triggers and exactly one new publication
   member. Existing message/receipt/notification and parent row counts must match.
4. Release only reviewed feature files from the verified deployment baseline;
   exclude unfinished Multi-Admin and unrelated checkout changes. Initially keep
   the feature flag false. Enabling the flag is a separate deployment/config step.
5. Enable only after approved migration verification. Test own-inbox removal,
   refresh, unread/notification counts and real two-tab reopening with approved
   disposable communication. Do not create production test identities silently.
6. Rollback: disable the flag first (all history remains), then roll back the
   application. If database rollback is needed, recheck and execute the supplied
   rollback SQL. Retain visibility state until explicitly approved for removal.

## Changed files

- .env.example
- app/admin/layout.tsx
- app/api/messages/visibility/route.ts
- app/globals.css
- components/cache/messages.tsx
- components/inbox-removal-dialog.tsx
- components/messages-workspace.tsx
- lib/inbox-visibility.ts
- lib/message-workspace.ts
- lib/queries.ts
- lib/query-cache.ts
- lib/realtime-sync.ts
- lib/screen-data.ts
- scripts/test-inbox-database.mjs
- supabase/migrations/202611110001_message_inbox_visibility.sql
- tests/inbox-visibility.test.ts
- tests/project-chat-selector-and-import.test.ts
- tests/realtime-sync.test.ts
- docs/message-inbox-removal.proposed.sql
- docs/message-inbox-removal.rollback.sql
- docs/message-inbox-removal-implementation.md

## Browser evidence

The built standalone app was checked in explicit local demo mode at desktop
1440x900 and mobile 390x844, in light and dark themes. Confirmed single-row menu,
bulk checkboxes and counter without navigation, confirmation text, Cancel/Escape,
search, modal fit, and unchanged conversation/history/composer. A rejected demo
mutation showed an error and retained the conversation. Successful removal and
refresh persistence were tested through the real local database and the endpoint
tests, not represented as successful demo UI deletion. Hosted browser success and
two-tab websocket delivery remain pending the approved backend rollout.

Screenshots: work/inbox-ui/desktop-selection.png,
work/inbox-ui/desktop-confirmation.png, work/inbox-ui/mobile-confirmation.png.

Disabling the feature flag after removals is an emergency UI/mutation switch. For
full rollback consistency, also restore the old unread RPC with the rollback SQL;
otherwise the migrated RPC will still exclude previously hidden conversations.

## Final check results

- Full suite: 513 passed, 1 skipped (61 test files passed, 1 skipped).
- Typecheck: passed.
- Lint: passed, no warnings.
- `npm run build:frankfurt`: passed, standalone output generated.
- Real local PostgreSQL migration/security/concurrency run: passed.
- Final browser focus check: Cancel returned focus to the originating three-dot
  control; two original conversations remained and no dialog stayed open.
- Temporary demo server and isolated PostgreSQL cluster stopped after validation.

This is a local implementation ready for migration review, not a claim that the
production feature or hosted end-to-end acceptance is already complete.
