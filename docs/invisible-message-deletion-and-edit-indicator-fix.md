# Invisible message deletion and edit-indicator fix

## Result — 2026-11-12 (Asia/Karachi)

The approved Frankfurt function-only migration is committed. Associated application
changes are local only: no Git push or Hostinger deployment. No additional migration
or environment variable is required for this release.

Authenticated local admin read/render/refresh verification passed using an existing
session. A new edit/delete across admin and client sessions remains pending an
identified, explicitly approved disposable conversation. Real client messages were
not edited, deleted, or sent for testing. Automated tests are not presented as live
cross-device proof.

## Database verification

Target: Frankfurt `tfrljxzknnhkynobvetg`, `eu-central-1`.
Applied ONLY `supabase/migrations/202611120002_exclude_deleted_message_unread.sql`.

The live function was compared with its reviewed definition before execution.
The exact previous definition is captured in the gitignored
`work/invisible-unread-rollback.sql`. CREATE OR REPLACE changes only the two
`deleted_at IS NULL` predicates. Function signature, bigint return, stable/security
characteristics, search_path, owner and grants are preserved. Authorization,
per-admin inbox exclusions, RLS, publication members and other functions are unchanged.
The SQL is transactional and its function replacement is reversible using the
captured definition; rollback requires no data restoration. No Auth/client export
was needed for this function-only change.

Windows formatting/dollar-quote handling in the safety-check runner initially
rejected the check before mutation. Those transactions did not commit. After fixing
the runner, the same approved SQL committed successfully. Post-commit comparison
confirmed exactly the two intended predicates changed.

Same-transaction original-row fingerprints and counts matched across all 25 public
application tables. Expected non-deleted unread counts were independently calculated
and matched the function for all 17 users. At inspection one project message was
already deleted, no task messages were deleted, and no unread receipts referenced a
deleted message. The new predicates protect future deletions without rewriting receipts.

| Table | Before | After |
| --- | ---: | ---: |
| project_messages | 10 | 10 |
| task_messages | 30 | 30 |
| projects | 13 | 13 |
| project_tasks | 17 | 17 |
| clients | 15 | 15 |
| message_read_receipts | 40 | 40 |
| notifications | 75 | 75 |

These are the current transaction's counts, not older snapshots from the previous
release. Existing application activity had added records before this transaction.
Execution evidence is in `work/invisible-unread-execution.log`; raw client data was
not exported. No message rows or receipt states changed in this migration.

## Root cause and implementation

The old MessageActions component deliberately rendered a tombstone bubble, while
Conversation rendered its timestamp, avatar and day separator. Conversation also
explicitly appended an Edited label. History and preview queries included deleted
rows; the unread function lacked a deletion predicate.

- History queries now filter `deleted_at` before the 50-row limit. Ordinary history
  APIs and server-rendered histories exclude deleted rows, including old deletions.
- Conversation filters before constructing the timeline. No deleted bubble, avatar,
  timestamp, empty spacer or orphan date separator is rendered. Empty histories use
  the ordinary No messages yet state. MessageActions defensively renders nothing
  for a tombstone. Edited labels are removed; original timestamps/order remain.
- The mutation acknowledgment carries an empty body for deletion and no attachment.
  Internal deletion identity/version metadata remains necessary for invalidation.
  It is not displayed as a normal message. The existing soft-delete RPC, sender-only
  permissions and optimistic concurrency checks are unchanged.
- Previews choose the latest visible message. A deleted-only sampled conversation
  remains in the inbox with an empty preview instead of disappearing. When deletions
  crowd a preview out of the existing bounded activity sample, a batched visible-row
  fallback resolves the remaining preview under session RLS. No per-thread N+1
  requests, new polling, channel, or database RPC is introduced.
- Receipt-based per-thread counts skip deleted messages. Global unread counts use
  the approved function. Receipts and notification data are not mutated.
- Deleted text is absent from conversation previews, so inbox search cannot match
  it. Task/project/client names remain searchable as before.
- Tombstones remain internal to revision-aware caches. Stale history, pagination,
  edit, UPDATE and inventory results cannot restore known deleted content. Newest
  page refresh removes absent rows within its authoritative range while preserving
  older history and sends received after the refresh began.
- Existing Realtime UPDATE subscriptions update both participants' caches and
  refresh unread counts/previews through the existing batched coordinator. UPDATE
  never requests receipt marking or reopens a hidden inbox. Deletion does not force
  a scroll to the bottom when the visible message count shrinks.

The existing bounded inbox discovery window remains; this change does not redesign
conversation discovery. Preview fallback can require more than one batched read for
very long deletion-heavy histories. Database tombstones remain available internally
under existing RLS; ordinary application history responses filter them, while Realtime
retains the mutation metadata required to remove cached rows.

## Exact application files changed

- `app/api/messages/[kind]/[resourceId]/[messageId]/route.ts`
- `components/cached-screen.tsx`
- `components/conversation.tsx`
- `components/message-actions.tsx`
- `lib/message-cache.ts`
- `lib/message-visibility.ts` (new)
- `lib/queries.ts`
- `lib/realtime-sync.ts`

Tests:
- `tests/client-conversation-threads.test.ts`
- `tests/message-edit.test.ts`
- `tests/messages-split-pane.test.ts`
- `tests/invisible-message-history.test.ts` (new)
- `tests/invisible-messages.test.ts` (new)

Release also includes the approved migration and this report. The pre-existing
change to `docs/message-edit-delete-implementation.md` records the previous recovery;
it is not new application functionality. Unrelated files must not be staged blindly.

## Tests and verification

- Full suite: 541 passed, 1 skipped (existing skipped test).
- Typecheck: passed.
- Lint: passed.
- `npm run build:frankfurt`: passed; standalone output generated.
- `git diff --check`: passed (Windows newline notices only).

Coverage includes previous/new deletions, project/task history pagination across
100 mixed visible/deleted rows, empty histories, deleted-only task retention,
preview fallback, deleted receipt exclusion, stale page/edit/UPDATE/preview races,
admin/client cache synchronization, original timestamp preservation, and absent
Edited text. Existing ownership, inbox removal and authorization tests remain passing.

The first test invocation failed before collecting tests because the restricted
Windows temporary folder denied test-runner file renames. The complete suite then
ran successfully with normal temporary-directory access. No test dependencies were
installed. No application authentication, email, task workflow, or RLS changes made.

## Deployment checkpoint and instructions

1. Complete authenticated checks in an explicitly disposable project/task conversation
   with admin and client sessions against the local Frankfurt build. Verify delete,
   refresh, preview fallback, unread count and cross-session UPDATE behavior.
2. Review the exact eight application files, five test files, approved migration and
   report. Stage explicit paths; avoid `git add .` if unrelated work exists.
3. Commit and push only after release approval. GitHub/Hostinger auto-deployment may
   start immediately on push, so treat pushing as the release action.
4. Keep Hostinger's current production origin and other settings unchanged. There is
   no new feature flag. Keep the existing inbox-removal flag at its current value.
5. The Frankfurt prerequisite is ALREADY applied; do not run bulk migrations or
   reapply unrelated SQL. Deploy the reviewed application, then refresh both sessions
   and validate the same disposable conversation in production.
6. Roll back only the application to the prior working deployment if necessary.
   The new unread-count function is compatible with the previous app. Preserve
   deletion metadata and rows. If function rollback itself becomes necessary,
   review/apply its captured original definition, never restore message content.

Nothing has been pushed or deployed by this task.

## Authenticated local browser evidence

The final Frankfurt standalone build is running at http://127.0.0.1:3000 with one
Node listener (PID 16364 at verification). The existing local admin session loaded
and refreshed the inbox successfully. In the Eliters test project, the browser
showed three message rows with original timestamps and no Edited label or deletion
placeholder. A read-only aggregate confirmed four stored user-message rows: three
visible, one soft-deleted, and one of the visible rows internally edited. Thus the
old deletion is absent and existing edited content has no visible edit indicator
after refresh. No new message mutation was performed. Normal app viewing may
acknowledge the current administrator's own receipts through the unchanged read flow.

The first local launch could not be reached due to restricted process networking;
it was stopped and restarted with normal local network access. The browser then
loaded the authenticated application. No firewall or security setting was changed.

Client-session visual acceptance and a new cross-session deletion remain pending.
The user was asked to identify a disposable conversation for mutation testing.
