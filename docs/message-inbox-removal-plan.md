# Administrator inbox removal — approval checkpoint

Status: proposal only. No application behavior, database, production data,
permissions or Realtime publication changed. No push or deployment.

## Evidence from the current repository

- `components/messages-workspace.tsx`: rows select conversations; there is no
  persisted hide/delete operation. Search/filtering operates on returned threads.
- `lib/queries.ts`, `getAdminMessageInbox`: builds the inbox from project/task
  user messages and the viewer's unread receipts. There is no visibility filter.
- The initial schema defines shared `project_threads`, `task_threads`,
  `project_messages` and `task_messages`. Deleting these is not per-user removal.
- `202608270002_message_read_receipts.sql` defines recipient-specific read state,
  not inbox visibility. Repurposing it would misrepresent messages as read.
- `202608280001_message_classification_and_feedback_submission.sql` supplies the
  latest repository definition of `get_unread_message_count`: authorized unread
  project/task user messages only. `get_unread_counts` delegates to it.
- `lib/realtime-sync.ts` already refreshes conversations/unread counts for new
  user messages, including unknown threads. This supports reopening hidden chats.

This is repository evidence, not a claim about the exact deployed database.
No production connection was made. Before applying anything, compare live
tables, grants, policies, message triggers and unread function definitions with
the repository. Preserve any additional live protections; stop on differences.

## Proposed persistence

Exact draft SQL: `docs/message-inbox-removal.proposed.sql`. Deliberately outside
`supabase/migrations` so ordinary migration tooling cannot apply it accidentally.

One `message_inbox_visibility` table stores the administrator, either a project
or task foreign key, hidden flag, last removal time and reopening time. Unique
indexes guarantee one state row per viewer/conversation. Foreign-key cascades
only clean visibility state when its parent is independently removed; hiding
never deletes the parent or messages.

RLS permits reading only one's own state and only while an administrator.
Authenticated callers get no direct write grants. The bounded, transactional
`set_own_inbox_visibility` RPC obtains the viewer from `auth.uid()`, checks the
administrator role, resource existence and current access, and accepts no user
ID. Bulk requests allow up to 100 resources; invalid targets roll back the batch.

Two additive message-insert triggers reopen visibility on genuine user messages,
including a new message sent by the administrator from a task/project deep link.
System messages do not reopen chats. Shared transaction advisory locks serialize
removal with new messages independently of client-supplied message timestamps.
Existing notification and message triggers are not replaced. Removing a chat
does not insert a message, notification or receipt.

The unread RPC retains existing conditions and excludes this administrator's
hidden conversations. Existing unread receipts are preserved, not marked read.
When reopened, all still-unread messages count again until read normally. Client
counts remain unchanged. This distinction must be covered in acceptance tests.

Add only the new visibility table to Realtime, subscribing to own-row INSERT and
UPDATE events. This synchronizes the same administrator's other tabs/devices
without polling. UPDATE rather than DELETE allows normal owner-only RLS delivery.

## Application implementation after approval

1. Add a role-checked, same-origin mutation endpoint with validated project/task
   IDs, bounded bulk input and the user's session client; never service-role
   writes or a submitted viewer ID. Persist successfully before removing rows.
2. Filter hidden rows server-side in the shared admin inbox loader so SSR, refresh,
   inbox endpoints, search and filters agree. Fail visibly on visibility-query
   errors rather than silently presenting removed chats as active.
3. Add sibling checkbox, conversation-opening button and three-dot menu controls
   (no nested buttons). Admin-only Select chats toolbar, selected count, Delete
   selected and Cancel selection. Preserve scroll regions and composer.
4. Use one accessible confirmation dialog for single/bulk removal, descriptive
   preservation text, focus management, Escape/Cancel and red destructive action.
   Required single title: "Delete this conversation from your inbox?"
5. Cancel in-flight inbox/unread requests during the mutation; invalidate/refetch
   authoritative inbox and badge after success. Coalesce own visibility events
   through the existing Realtime manager. Do not clear message history caches.
6. If the active thread is removed, replace its URL with the next visible thread
   or clean inbox URL; do not let fallback selection reopen the hidden thread.
7. Task/project deep links retain current access and history. Explicit Project
   Chat selection can restore only the caller's visibility via the same RPC
   (`hide=false`), including zero-message conversations. A new user message also
   restores the inventory normally. Neither operation creates duplicate threads.

## Validation required before release

Database integration: two administrators plus a client; own-state CRUD boundaries,
forged user IDs, anonymous/client denial, invalid/bulk atomicity, parent/message
counts unchanged, own unread counts, unaffected other-user counts, incoming/system
messages, explicit restore, and concurrent insert/removal in both serial orders.
Use a disposable isolated database first; do not manufacture production identities.

Application/UI: single/bulk/cancel, selection without opening, refresh, search,
filters, stale-query races, same-admin multi-tab updates, new messages reopening,
active selection/empty state, authorized deep links, zero-message project chat,
keyboard/focus, desktop/mobile and both themes. Preserve current composer tests.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` after the
implementation. Supply an explicit verified environment for the build; generic
build historically risks loading the old local configuration. No feature tests
or builds have been run at this proposal-only checkpoint, and no end-to-end
deletion behavior is claimed to work yet.

## Application / migration order and rollback

After explicit approval: capture exact live unread function, grants, policies,
trigger list and publication membership; create a database backup/checkpoint.
Validate the reviewed SQL in isolation. Assign a new migration filename only
after review; do not edit existing migrations. Apply approved migration before
deploying dependent UI. No existing business data backfill is needed.

Rollback application first. Restore the captured unread function verbatim, remove
the two newly added reopen triggers and their function, then remove the new
publication membership and mutation RPC. Retain the visibility table until the
user approves dropping it, so personal removal preferences remain recoverable.
Without the feature all shared conversations remain available; no communications
need recovery because none were deleted. Rollback must not remove other tables,
policies, publication members or unrelated application changes.

Approval requested for this schema/persistence design before proceeding with
database-backed implementation and validation. Production application of the
migration, push and deployment remain separate explicitly authorized actions.
