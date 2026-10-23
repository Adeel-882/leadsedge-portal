# Lead Assignment draft and notification fix

23 October 2026. Local changes only; supersedes the previous request to import workflows as Active.

## Cause

`components/admin/tasks-client.tsx` explicitly sent `initialStatus: 'active'`. The import endpoint forwarded it as `initial_task_status` to `import_template_tasks` and immediately called `queueAssignmentEmails`. The repository function copies that status and sets `activated_at` for Active imports. Consequently the assignment recipient query saw an active, client-visible, assigned Lead Assignment and queued its email and bell notification even when its description was untouched template copy. It previously did not check description content.

The prior empty editor behavior came from `leadDetailsEditorValue`: it substituted an empty paragraph for stock instructions only in the editor. This was not persisted initialization and could differ from the description held in component state.

## Changes

### Import is always preparation

- `components/admin/tasks-client.tsx` now explicitly sends Draft. Imported Status remains absent. Manual task creation retains its existing draft behavior.
- `app/api/admin/tasks/import/route.ts` independently supplies the literal `draft` to the RPC, regardless of a caller's old/malicious Active payload. It no longer imports or calls the assignment queue/delivery functions.
- The existing RPC creates the project task, template association, assignee, thread, activity, ordering and feedback fields as before. Its Draft path leaves activation time unset.
- After the RPC, the endpoint reads only the newly returned task IDs, constrained to the destination project and Draft status. For a Lead Assignment with blank/stock instructions it stores `<p>Lead Detail</p>`. Custom template descriptions are preserved.
- Initialization updates compare the original description and require Draft status, protecting concurrent edits. This is a new-import operation, never an editor-open or mass-update operation.
- If this post-import initialization fails, the endpoint reports the already committed imported count with a visible warning instructing the administrator to enter details and not import again. It does not falsely report that the entire import failed and encourage duplicates. The imported tasks still remain Draft, with no assignment events.

### Default text and formatting

`lib/lead-details-copy.ts` now separates import-only initialization from editor display. `leadDetailsEditorValue` returns existing descriptions unchanged: removing the text and saving a draft does not reinsert it. The initializer is idempotent and preserves custom rich content. Existing descriptions are never rewritten just by opening the editor.

The default is actual editable paragraph HTML, not a placeholder. Existing CSS gives it weight 400 and left/start alignment. The rich-text editor, sanitizer and Messages design are unchanged by this fix. Browser-generated bold, safe paste, mixed formatting and paragraph preservation retain the previous regression coverage.

### Intentional activation

`app/api/admin/tasks/[taskId]/route.ts` loads the persisted template relationship. Lead Assignment classification uses the source template name, not the editable task title or a request-supplied flag; renaming an imported task cannot bypass the check.

For Draft → Active on an imported Lead Assignment, the server rejects empty markup, whitespace/non-visible content, default-only “Lead Detail”/“Lead Details”, and untouched stock instructions. It returns HTTP 400 with:

> Enter actual lead details before activating this Lead Assignment. The default Lead Detail text is not sufficient.

The existing editor displays this error. Draft saves, including deliberately clearing text, remain allowed. Other template categories retain their activation requirements. This is a content-presence check, not an assertion that arbitrary entered information is factually correct.

The task update compares the previously read status and checks that a row was returned. A competing status transition returns HTTP 409 instead of performing duplicate activation side effects. The existing status selector and Activate task action remain available.

### Visibility and notifications

The repository's existing client-access query excludes Draft tasks. Existing SQL task-access/RLS definitions also exclude drafts and enforce assignment/membership/client visibility. These policies were inspected in repository migrations, not changed. Draft status provides privacy even though the future `client_visible` flag remains set for eventual activation.

Imported-lead activation uses the existing assignment outbox for its bell event as well as its email, instead of also making the separate non-idempotent activation notification insert. Non-lead workflow notification handling remains separate and requires client visibility.

`lib/assignment-email.ts` additionally reads current description and rejects empty/default-only lead content both when queuing and immediately before delivery. It continues to require Active, non-archived, client-visible, completion-required tasks from the Lead Assignment template, a linked enabled client profile and project membership.

Delivery behavior retained:

- Unique `task-assigned:<taskId>:<clientId>` outbox key.
- Existing queued/sent lookup, atomic worker claim and stable Resend `assignment/<outboxId>` key.
- Matching bell event tied to the outbox ID; historical bell events are retained.
- Frozen queue-time email payload and existing reconciliation window.
- Editing an already available active lead does not enqueue again; normal activation retries do not create a second delivery.
- The published hosted template, subject, variable contract, task deep link and provider configuration are unchanged.

Pending old empty-lead outbox entries fail the delivery eligibility recheck and are cancelled by the normal worker. Already-sent mail cannot be recalled. No worker or real delivery was invoked during this task.

## Validation

- `npm test`: **502 passed, 1 skipped**; 59 test files passed, one skipped.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build:frankfurt`: passed, standalone output generated.
- `git diff --check`: passed.

New/updated tests cover an Active import request being forced to Draft, default persistence, custom content/category preservation, initialization failures, admin-only import, blank/default activation rejection, repeated draft saves, renamed-lead activation, active-save retries, competing transitions, non-lead workflows, safe formatting, unavailable/empty email recipients, delivery deduplication and client draft exclusion followed by active access. The existing authorization, messaging, formatting and hosted-email tests continue to pass. Provider and database operations in these tests are mocked; they are not live-provider acceptance evidence.

Files changed:

- `app/api/admin/tasks/import/route.ts`
- `app/api/admin/tasks/[taskId]/route.ts`
- `components/admin/tasks-client.tsx`
- `lib/lead-details-copy.ts`
- `lib/assignment-email.ts`
- `tests/template-import-active.test.ts` (retained filename; now tests forced Draft)
- `tests/lead-activation.test.ts`
- `tests/lead-draft-visibility.test.ts`
- `tests/assignment-email.test.ts`
- `tests/invitation-branding-and-editor.test.ts`
- `tests/messages-import-formatting.test.ts`
- `tests/template-workflow-scheduling.test.ts`
- This report.

## Browser verification and limits

Used the actual Frankfurt standalone build at `http://127.0.0.1:3000` in existing synthetic demo mode without loading server credentials. Verified the real import modal retains template/workflow selection and contains no status dropdown; synthetic submission succeeds. Opened the real task editor, selected Draft, entered normal “Lead Detail” text and saved through the UI. DOM inspection showed exactly `<p>Lead Detail</p>`, computed weight `400`, alignment `start`. Existing custom demo lead details remained available on reopening; no stored production descriptions changed.

Screenshots: `work/lead-draft-ui/import.png` and `work/lead-draft-ui/editor-draft.png`.

The browser text was entered explicitly to inspect rendering; it is not proof of automatic initialization from a real database import. Existing demo endpoints acknowledge writes but do not persist imports/status changes and bypass database activation checks. Consequently persisted import → reopen → rejected activation → valid activation → delivery remains an isolated-environment acceptance test. The real route logic and queue are covered by automated tests. No production email was sent, no real client identity was used and no production record was modified. The local server remains in clearly labeled demo mode.

## Deployment and database boundary

No migration is required for this application path: the repository's latest `202610050001_preserve_imported_template_title.sql` RPC already accepts Draft and defaults to Draft. No live Frankfurt function inspection or database mutation was performed here. A production application deployment is required before these changes affect the live portal; none was pushed or deployed.

The existing admin-authorized database RPC still accepts an explicit Active parameter from direct SQL/SDK callers. This release forces Draft at the application HTTP boundary and does not alter administrator database capabilities. If database-wide enforcement against direct RPC/admin-table calls is desired, it needs a separately approved function/trigger migration after comparing the live function; no such migration has been created or applied. No Supabase Auth, RLS, schema, Multi-Admin, Messages, SMTP or provider-template changes are included.

## Already-imported empty Active tasks

Do not bulk-edit or delete tasks. Review each suspected empty active task individually. Where appropriate, use the existing admin editor to move it to Draft, enter real details and save. Then intentionally activate it after review. Do not change completed tasks as part of this cleanup.

Previously sent assignment email/outbox rows remain deduplicated. Reactivating the same task for the same client does not deliberately send a second assignment email. If a client needs a correction or a previously failed delivery needs reconciliation, handle that separately through an approved communication/reconciliation process; do not reset outbox keys or create duplicate tasks to force a resend. This task made no changes to historical active/completed tasks or delivery records.
