# Individual message edit/delete — local implementation

Status: prepared locally; **Frankfurt migration approval required**. No push,
deployment, production message mutation, or provider configuration change.

## Existing architecture and audit evidence

Project and task conversations use `public.project_messages` and
`public.task_messages`, a shared Conversation component, cursor-paginated API,
account-scoped TanStack Query cache, and one central Supabase Realtime channel.
Message text is rendered as escaped React text with safe HTTP(S) link rendering.

Repository migrations and the November 11 captured Frankfurt catalog show no
edit/delete metadata and SELECT/INSERT policies only. `is_project_member` checks
enabled membership; `can_access_task` additionally checks assignment, visibility,
draft status and archive status for clients. Admin access to a conversation does
not establish ownership of its messages.

Today's fresh catalog connection failed before returning results. The prior
capture is evidence of the reviewed baseline, not a current live-schema audit.
Repeat the catalog comparison before any production migration.

Existing notification/read-receipt creation and inbox reopening triggers are
INSERT-only. Notification bodies describe the sender and task/project; they do
not copy the message text. Feedback/system events are not editable user messages.

## UI and behavior

`components/message-actions.tsx` supplies sender-only three-dot actions to the
shared Conversation component, covering Messages and standalone task/project
conversations. Desktop controls appear on hover/focus; touch controls stay visible.
Inline editing preserves text/newlines and uses the existing expanding textarea.
Save requires non-whitespace text, max 5,000 characters. Cancel does not persist.
Deletion requires a native modal dialog with initial Cancel focus and focus
restoration. Errors remain visible; persistence success precedes display changes.
Edited timestamps appear beside the original timestamp. Deletions display
“This message was deleted.” No actions appear for system, pending, received, or
already-deleted messages. Semantic theme tokens support both themes.

The conversation list/removal UI and mutation endpoint are not modified. No
auth, email, workflow, role, or existing inbox-removal migration is changed.

## Proposed database migration

`supabase/migrations/202611120001_message_edit_delete.sql` adds:

- `edited_at timestamptz`, `deleted_at timestamptz`, `message_version integer`
  to both existing message tables (default revision zero).
- A BEFORE INSERT trigger initializes only the new metadata, preventing callers
  from forging it. Existing INSERT triggers remain unchanged.
- `mutate_own_message(text,uuid,uuid,text,integer,text)` authenticated RPC.

The RPC uses `auth.uid()`, existing access helpers, an explicit archive check for
tasks including admins, sender ownership and `message_type='user'`. It locks the
target message and compares the expected revision before updating. A stale edit
returns conflict; repeated deletion is idempotent after access/ownership checks.
There is no time limit. No new UPDATE RLS policy or direct-write grant is added.
The SECURITY DEFINER RPC has an empty search_path and hard-coded table choices;
PUBLIC/anon EXECUTE is revoked. Existing SELECT RLS remains authoritative.

Deletion retains row ID, sender, resource, created timestamp, edit timestamp,
revision and deletion timestamp. It replaces body with the deletion placeholder
and clears attachment_url. There is **no retained original-body audit copy** in
this proposal: no existing requirement for one was found. This prevents normal
SELECT, previews and Realtime from revealing the removed content. It does not
erase copies already read or retained by recipients, external backups, or actual
Storage object binaries. Body deletion is not undoable through this feature.

No existing rows are rewritten by applying the migration. Only explicit future
authenticated message actions change the selected row. Receipts, notifications,
parents and message creation timestamps are not changed by those actions.

## Server and race handling

The new PATCH `/api/messages/[kind]/[resourceId]/[messageId]` route validates the
session, account header, strict same-origin JSON request, UUIDs, operation,
revision, size and body. It invokes the RPC through the session client, never a
service-role client. Ownership is enforced again in PostgreSQL, not by UI alone.
Demo mutations fail closed rather than pretending to save.

Revision-aware cache merges reject older responses, including stale newest and
older pages. Deleted rows cannot revert to visible content through a stale edit.
Mutation completion targets the original conversation key after a quick switch.
Editing an older row does not scroll history to the newest message. The original
chronological timestamp determines ordering throughout.

## Realtime, preview and inbox compatibility

The existing centralized manager adds exactly two UPDATE registrations, one for
each message table, without another channel, polling or full-page refresh.
Known rows update their existing cache position. Unknown rows trigger only an
authorized inventory refresh. UPDATE does not invoke mark-read, pending-send,
incoming-message or hidden-chat reopening paths. Latest-row previews update to
the edited body or deletion placeholder; timestamps are unchanged. Inventory
refetches use the existing authorized queries/hidden-key reconciliation.

Reconnect refreshes retained older pages for open conversations. Inactive message
queries are invalidated for refresh on return while retaining revision guards.
The existing message tables are already in `supabase_realtime`; no publication
change is proposed. Live publication UPDATE settings and authenticated delivery
must still be verified before acceptance; local unit callbacks are not proof of
provider websocket delivery.

Unread semantics remain unchanged: an unread receipt counts until the existing
read action acknowledges it, including the readable deletion placeholder. No
edit/delete operation marks receipts read or changes another administrator's
visibility. Existing hidden-conversation behavior remains intact.

## Validation

- Existing loopback-only PostgreSQL, synthetic identities/data, no production
  credentials: existing inbox-removal suite plus new migration tests passed.
- Own admin/client project/task edits and deletions, other-sender rejection,
  anonymous denial, disabled/draft/hidden/archived task denial, missing membership,
  invalid body, system-message denial, concurrent edits and edit/delete races,
  stale-version denial, repeated delete, unchanged timestamps/parents/receipts/
  notifications/unread count, and hidden-chat preservation passed.
- Final full JS regression run: **525 passed, 1 existing skip** (62 test files
  passed, 1 skipped). Typecheck and lint passed; final `build:frankfurt` exited 0
  and generated standalone output. A pagination cursor typing issue found during
  validation was corrected before the successful final typecheck/build.
- Final logs: `work/message-edit-final-tests.log`,
  `work/message-edit-final-typecheck.log`, `work/message-edit-final-lint.log`,
  `work/message-edit-final-build.log`; synthetic PostgreSQL results:
  `work/message-edit-database.log`.
- Proposed migration SHA-256:
  `C85F631F512751B2ED0D752B4CDC04901DD47D56DDB508801E40973416F6ADA8`.
- Authenticated provider browser tests are pending an approved test environment
  with this migration. Production messages were not used for destructive tests.

### Visual checks actually performed

The standalone app ran on `127.0.0.1:3108` in explicit demo mode with synthetic
messages and no mutation persistence. Verified an own-message menu and absence
of actions on the received message, original text prefilled in the editor,
multiline replacement followed by Cancel restoring the original, and the exact
delete confirmation copy with initial Cancel focus and restored menu focus.
Inspected the light desktop dialog and dark 390x844 mobile dialog. Mobile had no
horizontal document overflow. No Delete confirmation was submitted. The demo
server and synthetic PostgreSQL cluster were stopped afterward.

This does not claim successful authenticated browser persistence or live
Supabase websocket delivery. Those remain explicit acceptance requirements.

## Files

- `components/message-actions.tsx`: new per-message UI.
- `components/conversation.tsx`: shared actions, metadata and revision-safe history.
- `app/globals.css`: only additive individual-message styles.
- `app/api/messages/[kind]/[resourceId]/[messageId]/route.ts`: constrained mutation.
- `app/api/messages/[kind]/[resourceId]/route.ts`: return revision metadata on send.
- `lib/queries.ts`, `lib/types.ts`: read/map message metadata.
- `lib/message-edit.ts`, `lib/message-cache.ts`: validation and revision guards.
- `lib/realtime-sync.ts`: centralized UPDATE handling and reconciliation.
- `lib/demo-data.ts`: synthetic revision metadata for visual inspection only.
- `tests/message-edit.test.ts`, `tests/realtime-sync.test.ts`: regression coverage.
- `scripts/test-message-edit-database.mjs`: synthetic PostgreSQL tests, including
  the unchanged existing inbox-removal test scenarios.
- `supabase/migrations/202611120001_message_edit_delete.sql`: proposed migration.
- This report.

No conversation-removal component, endpoint, visibility query, or migration was
rewritten. The new migration is not applied to Frankfurt.

## Rollout approval checkpoint

1. Review the exact new SQL and confirm deletion retention semantics above.
2. In an approved isolated Supabase environment, compare schema/RLS/grants and
   INSERT triggers; apply only the proposed migration with a recovery checkpoint.
3. Deploy the corresponding app build there. The new SELECT columns require the
   migration first; do not deploy this app change against the old schema.
4. Test two authenticated senders in project/task conversations across tabs and
   devices; prove UPDATE delivery under SELECT RLS, refresh persistence, older
   pages, clients, disabled accounts, and existing inbox removal. Use test data
   only. No extra publication changes without approval.
5. Separately approve Frankfurt migration, then app deployment. Never bulk-apply
   unrelated pending migrations. Keep unfinished administrator work out of any
   focused release; current checkout is not automatically a production baseline.

## Rollback

Roll back the application to the verified pre-feature deployment. Keep additive
columns and metadata so deleted content stays deleted and chronology is retained.
If required, revoke authenticated EXECUTE on the new RPC to disable mutations.
Do not drop metadata columns, resurrect deleted bodies, restore over production,
or roll back the working inbox-removal migration. Previously deleted message
bodies cannot be recovered from this feature's tombstones.
