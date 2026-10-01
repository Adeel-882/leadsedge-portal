# Messages controls, unseen tasks and scrolling: read-only audit

October 1, 2026. Application source and Frankfurt live catalog/aggregates inspected. No application code, schema, RLS, publication, identities or business data changed in this pass. The proposed SQL is outside the migrations directory and has NOT been applied.

## Approval boundary

The user's requested unseen-task semantics cannot reliably use the current notification `read_at`. The request explicitly says to stop before changes when task seen-state needs a schema modification. Implementation and acceptance testing are therefore paused here; the previous turn's 315 passing tests are not presented as validation of these new requirements.

Approve the exact `docs/proposals/task-seen-state.sql` proposal to proceed with unseen tasks and the independent non-destructive UI work. Message deletion remains deferred and is not included in that approval.

## Current architecture findings

1. Project conversations already use `project_threads`, with a live UNIQUE(project_id) constraint. Message POST looks up the existing thread by project; it does not create a new chat for every outreach. Workspace `openProject()` reuses `project:<id>` or adds only a local cached row until its first message. The current plus button is icon-only. Its selector shows active projects and primary client labels, rather than all project memberships. The new client-first selector should read bounded admin-authorized membership data, group by client and reuse this same canonical thread. A project with multiple clients remains a shared project conversation, not a private direct message; the selector must say so.
2. `message_read_receipts` contains recipient_id, exactly one project_message_id/task_message_id, read_at and created_at. SELECT is restricted to the recipient. There is no authenticated UPDATE policy. Existing SECURITY DEFINER `mark_conversation_read` checks access and clears only the caller's applicable message receipts. There is no manual-reminder field.
3. Manual unread can be represented without falsifying incoming receipt state: use an own-user `notifications` row of type `conversation.reminder`, with a deterministic user+conversation event ID to make repeated clicks idempotent. Existing admin INSERT and own-user UPDATE policies can support this admin-only feature. Use a separate row indicator; the global badge can add one reminder for a conversation only when it has no genuine unread messages. Opening the conversation clears the reminder. Marking the currently open conversation unread must suspend its automatic acknowledgment until it is explicitly reopened, otherwise the current mounted Conversation would clear it immediately. Do not reset incoming receipts or invent an incoming message.
4. Both message tables contain id, resource ID, thread_id, sender_id, body, attachment_url, created_at and message_type. Neither has deleted_at/deleted_by, and neither has an authenticated UPDATE or DELETE policy. There is no current sender/admin deletion capability. Copy and related-resource actions are safe to implement; Delete should not be rendered yet. Soft deletion requires a separately reviewed tombstone/read model and explicit moderation policy. Adding only deleted_at while continuing to return original body/attachments would be incomplete. No deletion migration is proposed for execution in this pass; the task-seen SQL does not authorize deletion or new message policies.
5. Notifications contain user_id, task_id, project_id, type, read_at and presentation/link fields. They have no task-open timestamp. Bell's bulk-read API updates every unread notification for the current user. Individual Bell acknowledgment also sets read_at. The live `mark_conversation_read('task', ...)` function marks ALL caller notifications for that task read, even when opened from Messages rather than the task-detail page. Therefore notification read_at cannot prove the task was opened.
6. Frankfurt currently has 8 active, client-visible, unarchived tasks. Only 3 have a matching task.activated/task.assigned notification for their assigned client. Six task.activated notifications exist overall, all read. No past task-opening history can be recovered from this evidence.

## Proposed unseen-task model

Add nullable `notifications.task_seen_at`, independent of Bell read_at. Reuse the existing notification recipient and task relationships and existing notifications Realtime publication. No new table, RLS policy, RPC or publication change is proposed.

Application work after approval:

- Create one canonical assignment notification for every eligible new assignment, including manual creation, import, activation/visibility and reassignment paths. Separate this from assignment-email eligibility: emails remain restricted to imported Lead Assignment tasks as previously requested.
- Count DISTINCT task IDs among the current client's assignment notifications with task_seen_at IS NULL, intersected with the existing authenticated/RLS-authorized active, visible, unarchived, assigned task inventory. Do not count task comments, reminders, Bell notifications generally, or completed work. Count visible assigned tasks, not just tasks requiring completion.
- When a successfully authorized task detail is opened, acknowledge only that user's task-assignment rows for that specific task. Do not acknowledge merely by opening Tasks, Messages or Bell. Client timestamp is not authority; use the server time in the authenticated route.
- Keep Bell read_at independent. Completing/archiving makes the task ineligible for the badge even through an unusual path. Do not reset task_seen_at for an ordinary save.
- Reuse notifications INSERT/UPDATE and project_tasks events in the existing manager for targeted task-unseen cache reconciliation. No polling and no additional channel/publication.

### Backfill and security

Exact SQL: `docs/proposals/task-seen-state.sql`.

At rollout, mark existing assignment-notification rows as seen at the migration timestamp. This is a product backfill rule to avoid marking old work NEW, not evidence of historical opening. Do not create missing historical assignment notifications just to increase the badge. Future assignments get NULL task_seen_at until opened.

The existing own-user notification UPDATE policy governs the new field too: users can acknowledge their own state, never another user's. Application routes additionally verify client role, enabled client, current assignment and task access before acknowledging. Existing RLS policies are not weakened. A task notification alone never grants task access. The partial index supports the own-user unseen-assignment lookup. Roll out schema first, then code; old code ignores the new field while deployed.

## Projects table and scrolling diagnosis

`components/admin/dashboard-client.tsx:106` wraps the section in `overflow-hidden`. Line 111 wraps the table in `overflow-x-auto`, and its absolute row menu remains inside those overflow ancestors. Current repository source has NO explicit vertical max-height on this table. The screenshot's scrollbar should not be diagnosed as a removed fixed-height setting that does not exist. Horizontal auto overflow also makes the other axis compute to auto, so a tall absolute menu can create vertical scrollable overflow while its outer section clips it.

Proposed code fix: use natural page height and move the row menu to an existing/top-layer popover or body portal with viewport-aware placement, keyboard dismissal and focus handling. Keep horizontal table scrolling on smaller screens. Preserve search/status filters. The admin projects query currently has no explicit application limit or pagination; do not introduce a 1000-row renderer. Add bounded client display pages over existing data if needed for a long list, with server pagination reserved for a separate data-volume change.

`app/globals.css:171` explicitly sets `.message-list { overflow-y: auto; overscroll-behavior: contain; }`. This prevents native scroll chaining at the history boundary. Conversation contains no wheel/touchmove preventDefault handler; its preventDefault is only form submission. Change the embedded task conversation to native `overscroll-behavior-y: auto`, preserving intentional workspace containment where appropriate. Keep its history height/overflow, composer and pagination. Verify min-height/flex sizing. The current messages-change effect scrolls to the bottom on every history change, including Load Earlier; preserve the prior scroll anchor when prepending rather than blindly scrolling older-page loads to the newest message.

## Implementation/validation still pending

Clear New message/client-project selector with composer focus; row Mark read/reminder/Open project/Open lead menus; Copy message affordance; unseen-task state and badges; un-clipped project menus and natural page height; native task-history scroll chaining with prepend anchoring.

No new token, email, message, task or invitation was generated during this audit. Hostinger deployment/configuration was not changed. The screenshots are deployment evidence, not proof that the local repository contains a fixed-height table rule.

After approval: focused/full tests, typecheck, lint, clean build:frankfurt, admin/client browser validation and exactly one Frankfurt server. Live mobile gesture checks will be distinguished from CSS/source checks if the available browser tool cannot synthesize touch/trackpad input.
