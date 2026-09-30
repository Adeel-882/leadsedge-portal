# Phase 7 — Realtime cache synchronization

## Status: audit complete; publication approval required

September 29, 2026. Phase 3 implementation has **not started**. The requested stop condition was reached in the live Frankfurt catalog: `public.project_tasks` is absent from `supabase_realtime`. No application code, schema, publication, RLS, Auth, business data or running server configuration was changed in this phase. This document distinguishes current findings from the proposed implementation; it is not an acceptance report for completed Realtime synchronization.

Baseline: **255 tests in 31 files passed** (`work/phase7-baseline-tests.log`). The accepted Phase 2 build remains running. No new sign-in token or email was generated. No test message was sent and no task status was changed.

## Live Frankfurt evidence

Read the catalog through the existing Frankfurt pooler, inside `BEGIN READ ONLY ... COMMIT`. Both linked project identity and pooler username were checked against `.env.frankfurt.local`; region guard required `eu-central-1`. Password was passed in the child process environment and never printed. The direct database hostname failed DNS resolution; the already configured Frankfurt pooler succeeded. No Seoul or Tokyo connection was attempted.

Catalog queries: `pg_publication`, `pg_publication_tables`, `pg_class`, `pg_policies` and table SELECT privileges. Safe results: `work/phase7-publication-audit.txt`; reproducible read-only helper: `work/phase7-publication-audit.mjs`.

Publication `supabase_realtime` has `puballtables=false`, INSERT=true, UPDATE=true, DELETE=true. Its complete table list is:

|Table|Published now|RLS enabled|Replica identity|
|---|---|---|---|
|public.project_messages|Yes|Yes|default|
|public.task_messages|Yes|Yes|default|
|public.message_read_receipts|Yes|Yes|full|
|public.notifications|Yes|Yes|default|
|public.project_tasks|**No**|Yes|default|
|public.meetings|No|Yes|default|

Messages, receipts and notifications are already eligible for Postgres Changes. Catalog membership proves configuration, not actual browser delivery/reconnect health; a subscription acknowledgment alone would not prove event delivery either.

Live SELECT policy predicates:

- Project messages: `is_project_member(project_id)`.
- Task messages: `can_access_task(task_id)`.
- Receipts: `recipient_id = auth.uid()`.
- Notifications: `user_id = auth.uid()`.
- Tasks: admin, or project member + directly assigned current client + client-visible + not draft; separate admin ALL policy uses `is_admin()`.
- Meetings: owner or an enabled client with the matching client/project membership.

Table SELECT grants exist for authenticated and anon roles, but RLS remains enabled. A grant alone is not proof of anonymous row visibility. Do not remove policy checks or use the service role for subscriptions.

## Existing architecture

Phase 2 uses account/role-scoped in-memory TanStack Query5.104.0. Keys are `['private', viewerId, role, resource, ...args]`. Browser QueryClient survives ordinary navigation, is replaced on identity/role change, and clears on logout/full-document departure. No private server singleton or browser persistence. Server bootstrap, explicit task-resource guard, APIs and RLS remain authoritative.

`lib/supabase/client.ts` supplies one browser Supabase client. Multiple channels ordinarily multiplex through that client's WebSocket; they are not separate WebSockets per thread.

|Current owner|Channel subscriptions|Action on event|
|---|---|---|
|`components/unread-counts.ts:46`|notifications `*` filtered by user; receipts `*` filtered by recipient|150ms debounced unread API fetch|
|`components/messages-workspace.tsx:129`|project INSERT; task INSERT; receipts `*` filtered by recipient|reload conversation inventory; message events ignore system messages|
|`components/conversation.tsx:80`|selected kind/table INSERT filtered by project/task ID|other-user communication marks read, then fetches newest history|
|`components/admin/messages-client.tsx:24`|two message INSERT subscriptions plus receipts|legacy `router.refresh`; no active page imports this component|

Normal steady-state channel counts per tab, both roles: **1 channel /2 registrations** on a screen without a conversation; **2 /3** on a task/project detail with a conversation; **3 /6** on desktop Messages with a selected conversation. Mobile Messages without an open pane has2 /5. Counts are source-derived, not live socket telemetry. Each same-account browser tab has its own client and channels.

Cleanup exists: each effect calls `removeChannel`, clears its interval and removes visibility listeners. There is no proven permanent channel leak. However, Messages workspace's callback depends on the selected key, causing subscription teardown/rejoin when changing threads. Receipt events overlap shell/workspace subscriptions, and selected-message events overlap workspace/conversation subscriptions. Temporary overlap is possible while asynchronous removal completes. Status callbacks do not explicitly track degradation or reconcile missed events after rejoin.

Active split-pane code does not call `router.refresh` for these events; it already partially synchronizes via API refetches. Therefore the suggested “before = manual refresh required” baseline would be inaccurate. The real issue is overlapping subscriptions, redundant fetches, periodic discovery and no explicit reconnect protocol.

## Current unread and pagination model

`message_read_receipts` is the unread source. `202608280001_message_classification_and_feedback_submission.sql` replaces earlier functions to exclude system messages and enforce project/task access. Receipt creation is tied to user messages. `mark_conversation_read` clears only the requested conversation and relevant notifications; its returned deltas currently update browser counts. Notifications remain a separate count.

Receipt payloads identify recipient and message ID, not a complete conversation/sender projection. A receipt may refer to a message outside retained history. Local plus/minus arithmetic on every event would therefore risk double counting, ordering races and cross-tab drift. Published receipt INSERT/UPDATE supports authoritative, batched unread/inventory reconciliation.

History: newest50 with cursor Load Earlier, up to10 pages/500 messages. `appendMessage` deduplicates by server ID and reflows bounded pages. Sending has an optimistic temporary ID, followed by API replacement. The current subscription skips own-message events; it does not prove both arrival orders of optimistic/API/Realtime reconciliation. Phase 3 must explicitly test event-before-response and response-before-event, pending rows and out-of-order timestamps.

## Required approval and exact proposed change

Required table: **public.project_tasks**. Needed to discover task activation/status/completion/feedback changes from another session without polling. A task-message event is not a reliable substitute: not every task update creates a user message or notification.

Proposed SQL, **not executed and not added to migrations**:

```sql
begin;
alter publication supabase_realtime add table public.project_tasks;
commit;
```

Recheck membership immediately before applying after approval, to avoid duplicate addition. No columns, policies, triggers, replica identity or Auth settings need to change for new-row INSERT/UPDATE payloads. No meeting publication change is proposed; meetings can remain staleTime + mutation invalidation.

Security implications: this enables another transport for task rows allowed by existing SELECT/RLS policies. New-row payloads contain task fields, not just IDs; handlers must never log payloads and must use current identity and validated scope. Prefer INSERT/UPDATE subscriptions; avoid broad DELETE subscriptions. **The existing publication also publishes DELETE. Supabase documents that DELETE events do not receive ordinary row-level authorization, so adding this table can expose deleted task identifiers to a subscriber requesting deletes.** Avoiding DELETE in this app does not change that platform limitation. Do not silently change publication-wide DELETE behavior, because that affects existing tables. Approval must take this caveat into account. Source: [Supabase Postgres Changes, old records and limitations](https://supabase.com/docs/guides/realtime/postgres-changes).

Access-removing updates (reassignment, making private/draft, membership changes) may no longer be visible to the former reader. Realtime alone cannot guarantee immediate cache revocation. Keep route/API permission enforcement and bounded revalidation/reconnect handling. Do not represent cached scope checks as an alternative to RLS.

## Proposed event-to-cache matrix (not implemented)

All keys below retain the current viewer/role prefix. Unobserved keys may be marked stale without triggering fetches. Never invalidate all private data for a normal event.

|Event|Direct update where sufficient|Targeted reconciliation|Do not touch|
|---|---|---|---|
|Project user-message INSERT|existing `messages/project/id` pages; known inventory preview/time|unread/inventory as required for authoritative counts or unknown thread metadata|tasks, templates, people, meetings, other histories|
|Task user-message INSERT|existing `messages/task/id` pages; known preview/time|unread/inventory where incomplete|unrelated tasks, templates, people, meetings|
|Own receipt INSERT/UPDATE|no event-based count arithmetic|`unread`, conversation inventory; coalesced after pending local read|histories and unrelated screen data|
|Task INSERT/UPDATE after approval|avoid inventing a full joined task projection|exact `task/id`, `tasks`, home/dashboard; inventory only for title/status/visibility or new thread relevance|templates, unrelated task details, message history|
|Own notification INSERT/UPDATE|no changes to message count inferred from notification|unread notification projection; Home activity if relevant|message histories, templates, people|
|Meeting change|none in Phase 3|existing local mutation invalidation; stale revalidation|no new channel|

For a previously unknown conversation, invalidate the authorized inventory first. Do not create a cache entry from an unchecked foreign ID. For known histories, validate table/kind, resource ID, row shape, message_type and active account generation before applying. Sender name/role joins are absent from database row events; reuse verified existing sender metadata or a neutral display label, then reconcile metadata as necessary. Do not assume the raw row equals the API projection.

## Proposed centralized manager and lifecycle

One manager beneath the existing authenticated QueryProvider, owning one channel per browser tab/session identity and role. Use the existing Supabase browser client. Replace component-owned subscriptions only after central behavior is verified.

Candidate channel registrations: project INSERT, task-message INSERT, own receipt INSERT + UPDATE, own notification INSERT + UPDATE, task INSERT + UPDATE after approval: **one channel /8 registrations** for both normal client and admin. This is a design target, not a measured implementation. Keep user filters on receipts/notifications; message/task delivery still relies on RLS, with resource filtering where feasible. One tab must not create a channel per visited conversation. Admin traffic can span more authorized rows; monitor event rates before broader deployment.

Identity generation/cancellation guards must ignore late callbacks. Explicitly dispose old subscriptions before starting the next identity; remove channel, timers and event handlers on logout/unmount/page departure. Existing logout BroadcastChannel is solely a session-clear signal; no new cross-tab data BroadcastChannel is proposed.

Conversations register which resource is mounted/visible, not their own database channel. A new message updates that resource's cache; only an actually open visible conversation may request a scoped read acknowledgment. Background messages update rail metadata without changing selection. Serialize read requests, cancel pre-read count fetches and schedule trailing authoritative reconciliation so an older response cannot restore unread counts cleared locally. Receipt events from another tab converge through the same authoritative endpoints.

Use message ID dedup and a bounded event-ID/version set; preserve earlier pages and enforce500. Existing pending send IDs are reconciled with the actual response ID; duplicate server-ID events must not append another row. An event received before the API response must converge when that response replaces the temporary row. Do not guess same-body sends are identical.

Batch uncertain invalidations in a short window (proposed150–250ms) with one in-flight fetch per key and a trailing reconciliation if more events arrive. A burst of20 receipts must not cause20 fetches. Guard unread races with pending read state rather than repeated count subtraction.

On subscribed/re-subscribed, reconcile the initial fetch-to-subscription gap and any missed events: unread, inventory, mounted dynamic summaries and **only newest page** of an open conversation. Never call InfiniteQuery's all-pages refetch for reconnect. Mark inactive dynamic data stale for its next use. Channel failure should show degraded freshness; SDK reconnect retries plus reconnection/online/visibility reconciliation replace periodic polling, without assuming event replay exists.

## Polling and freshness plan

Currently a visible Messages page has three60s timer owners. A timer cycle can start unread GET, inventory GET, selected PATCH and newest-history GET; receipt side effects can trigger additional fetches. This is a source-derived request shape, not a measured Phase 3 before/after number. Visibility triggers also exist for unread and inventory. Legacy unused admin inbox has another timer in source.

After reliable delivery is verified, remove the three active dynamic-data timers and redundant component event subscriptions. Preserve explicit error/retry and bounded reconnect/visibility reconciliation. Do not remove timers before the replacement is proven. No `refetchInterval` was found in current query configuration.

No staleTime changes made. Current: message history5min, inventory30s, unread20s, tasks/home/dashboard/meetings45s, people/projects metadata2min, templates5min; unused retention10min except templates15min. Proposed starting adjustment only after delivery validation: inventory/unread2min, history remains5min, tasks45s retained initially because access-removal events are not guaranteed. Keep finite fallback freshness. Stable templates/profile/settings/configuration and old activity history do not gain subscriptions.

## Validation still required after approval

Implementation tests must cover manager lifecycle, no duplicate channel on navigation, stale identity callbacks, scoped foreign-ID rejection, direct project/task inserts, both optimistic-event arrival orders, bounded pagination, background selection stability, receipt/read race convergence, exact task invalidation, no browser scheduling computation, reconnect newest-only reconciliation, bursts and no idle polling.

Real browser validation must cover separate admin/client sessions, two tabs of one account, selected/background message delivery in both directions, unread read acknowledgment across tabs, task changes and reconnection. Use authorized synthetic staging messages and reversible task changes, avoiding completion-trigger side effects on business fixtures. Do not log payload bodies or credentials. Current legacy Realtime test has an obsolete synthetic email and generates a token; it was inspected, **not run**.

No Phase 3 network gains are claimed. Phase 2's accepted13 HTTP /35 Supabase sequence remains the baseline; live bidirectional event tests, new cache-sync tests, typecheck/lint and clean Frankfurt acceptance build await implementation. The255-test baseline was rerun successfully in this audit. The accepted running build has not been stopped or replaced.

Next phase recommendation remains cold-load round-trip reduction through authorized aggregation/BFF, supported by traces. Do not change database region or remove bootstrap/resource checks to improve headline counts.

## Approval requested

Approve adding **only `public.project_tasks`** to Frankfurt's existing `supabase_realtime` publication, with the DELETE/identifier limitation described above, then continuing the application implementation and validation. Meetings stays outside Realtime. No RLS, schema columns, identities, Auth, SMTP or other infrastructure changes are requested.
