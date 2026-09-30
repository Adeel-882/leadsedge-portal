# Phase 7 — Realtime cache synchronization

## Acceptance status

Completed September 30, 2026. Phase 3 adds event-driven synchronization to the accepted Phase 2 account-scoped TanStack Query cache. The approved publication addition was applied only in Frankfurt. Full suite: **283 tests across 32 files passed**, including 28 focused Realtime tests. A separate live SDK reconnect test also passed. Typecheck, lint and a clean `npm run build:frankfurt` passed.

One normal standalone Frankfurt Node listener remains on port 3000: PID **5168**, command `node --env-file=.env.frankfurt.local dist/standalone/server.js`. Canonical browser origin is `http://127.0.0.1:3000`. The temporary validation helper on port 3016 was closed and its process exited. Final browser inspection showed one manager, status `live`, and one actual SDK channel.

The original read-only audit is preserved in [the audit report](performance-phase-7-realtime-cache-sync-audit.md). The previous navigation benchmark is in [Phase 6 results](performance-phase-6-client-cache-results.md). This report does not substitute new measurements for that historical benchmark.

## Before this phase

Phase 2 already provided account/role-scoped QueryClient instances, initial server hydration, targeted mutation invalidation, bounded cached histories and logout isolation. Query keys remain `['private', viewerId, role, resource, ...args]`. Private data is not placed in a shared server cache or persisted to browser storage.

The audit found three overlapping active subscription owners, three Messages polling timers, and six desktop event registrations across those owners. Conversation, unread and workspace components could independently reconcile overlapping state. An unused legacy admin inbox also contained obsolete subscription/refresh timer logic. The active owners were consolidated and that obsolete logic removed. The new manager is not layered over the old subscriptions.

## Frankfurt publication

Before approval, `project_tasks` was absent. The approved operation was equivalent to:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tasks;
```

The guarded application and verification returned exactly these five tables:

| Published table | Application events |
| --- | --- |
| public.project_messages | INSERT |
| public.task_messages | INSERT |
| public.message_read_receipts | INSERT, UPDATE; current recipient filter |
| public.notifications | INSERT, UPDATE; current user filter |
| public.project_tasks | INSERT, UPDATE |

Publication flags were not changed: INSERT/UPDATE/DELETE remain enabled at the publication level; `puballtables=false`. The application has **no task DELETE subscription or DELETE-driven cache logic**. Meetings, templates and project/client metadata were not added. RLS remains enabled; receipts retain their existing full replica identity, other audited tables retain default replica identity.

Read-only catalog evidence used the existing Frankfurt pooler after direct-host DNS resolution failed. Environment/project and region guards passed. No Seoul or Tokyo connection was made. Safe evidence: `work/phase7-publication-audit.txt` and `work/phase7-publication-approved.txt`.

## Centralized ownership and lifecycle

`RealtimeProvider` lives inside the existing account/role QueryProvider. `RealtimeSync` owns one channel with eight event registrations per authenticated tab, for both normal clients and admins. One browser Supabase client multiplexes the transport; switching conversations does not create a channel per conversation.

Startup waits for removal of the previous channel, checks that the browser session user matches the server-provided cache identity, and binds that session to Realtime before subscribing. Generation guards discard callbacks from replaced owners. Logout, account replacement and page departure remove the channel and clear pending work, open-thread callbacks and deduplication state. Existing cache clearing is preserved. Temporary structured Realtime debug logging was removed before the accepted build.

A browser-only delivery failure was caught despite passing unit tests: independent SDK sessions received the inserted message while the browser history stayed unchanged. Explicit session matching and `realtime.setAuth()` before channel subscription resolved subsequent live browser delivery. This proves the observed failure and successful remedy; the SDK's precise internal timing mechanism was not independently instrumented. Auth routes, login flows, permissions and settings were not changed.

Each tab has its own bounded manager. Multiple tabs therefore create multiple channels, intentionally; this phase does not introduce cross-tab leader election. A small interrupted-updates notice exposes retry/reconciliation if the transport becomes degraded.

## Event → cache behavior

All keys below retain the current account/role prefix. No event calls whole-page `router.refresh()`.

| Event | Direct cache action | Authorized reconciliation |
| --- | --- | --- |
| Known project user-message INSERT | Append by server ID to an existing project history; update matching preview/time | Unread + conversation inventory; scoped read acknowledgment when that conversation is open and visible |
| Known task user-message INSERT | Same operation for the matching task history | Same unread/inventory and scoped task read behavior |
| Message in a background thread | Update that cached history if present and its rail preview/time | Unread/inventory only; current selection and selected history preserved |
| Message for an unknown thread | Do not create a history from event contents | Inventory/unread APIs discover authorized conversations |
| Own receipt INSERT/UPDATE | No speculative counter arithmetic | Unread + inventory; authoritative counts converge across tabs |
| Own notification INSERT/UPDATE | No message-count inference | Unread resource + home summary |
| Known task INSERT/UPDATE | Never copy raw task event data into task cache | Exact affected task detail, task list, home/dashboard; inventory only when it displays the task |
| Unknown/foreign task hint | Never insert task contents or create a detail cache | Authorized active task list only |
| Rejoin / online / visible return | Preserve cached histories and earlier pages | Dynamic metadata, active summaries/task details, selected newest history page and scoped read acknowledgment |

System messages are ignored by the user-message append path. Unread remains the existing server-calculated accessible communication count; notifications are not added to it. Related APIs and RLS remain authoritative, including assignment, disabled-client and client-visibility rules.

## Messages, optimistic sends and pagination

Unique server IDs deduplicate repeated delivery. Timestamp ordering prevents delayed events from rearranging history incorrectly. A bounded 1,000-event seen set limits dedup memory. Unknown senders use existing cached metadata when available, otherwise a neutral label pending authoritative data.

For a pending own send, the manager holds matching own events until the API response replaces the temporary row, then merges by server ID. Tests cover event-first and response-first ordering, failed sends and independent same-account messages. Live client and admin browser sends each rendered exactly one final message.

History retains newest-50 loading, Load Earlier and the 500-message/ten-page bound. Reconciliation fetches only the newest page, retaining loaded older pages. When an offline gap exceeds one page, an explicit gap cursor allows Load Earlier to fill that interval without dropping older cached pages. Multi-page gap and retention cases are tested. Final-build browser validation loaded 100 messages, switched away and back, and retained all 100 with one channel.

Opened empty admin project conversations survive inventory refresh only while the authorized project list still contains their project. Background discovery does not force a different selected conversation.

## Read receipts and unread convergence

Opening a visible thread acknowledges only that thread through its existing scoped endpoint. Receipt events do not mark other conversations read. Pending unread/inventory requests are cancelled before a read acknowledgment, and reconciliation waits for acknowledgments rather than allowing old counts to race newer read state.

Own receipt events refresh lightweight authoritative counts and inventory. Cross-tab validation showed a background-project unread badge appear in a second client tab and clear after that project was opened/read in the first tab. The task and project receipt paths remain distinct; no global mark-all-read action was added.

## Tasks, meetings and notifications

Task events are invalidation hints. The API/database supplies current status, `completed_at`, `feedback_state` and `feedback_scheduled_for`. There is no browser calculation of the seven-day schedule. Only affected task resources and relevant summaries are invalidated; unrelated task details, templates, people and meetings are untouched by task events.

Meetings remain on Phase 2 stale-time caching and targeted mutation invalidation. Adding them to Realtime was neither approved nor necessary for this phase. Existing own-user notification delivery is integrated into the central manager and query cache without conflating notification and message counts.

## Reconnect and burst handling

A 200 ms debounce coalesces targeted keys. One flush runs at a time, with a trailing pass for intervening events. A test with 20 receipt events produces one unread refetch. Unique message payloads still merge directly rather than waiting for a history reload.

Initial subscription and subsequent rejoin reconcile lightweight dynamic data to close the fetch/subscribe gap. This adds bounded initial reconciliation traffic; it is not a cold-load optimization. Inactive detail queries are marked stale; active resources are fetched. The selected conversation refreshes only its newest page, not every retained page. Online and visibility return also trigger bounded repair. Built-in reconnect refetch is disabled for the manager-covered resources to avoid overlapping recovery owners.

The live reconnect test used the production manager and a real authenticated SDK: disconnect, reconnect, return to `live`, one retained channel and exactly one selected newest-page request after rejoin. This was a live transport test, not a browser-offline simulation.

All redundant Messages intervals were removed. Stale-time checks on access and explicit reconnect/visibility repair remain; neither is periodic polling.

## Final freshness values

| Resource | staleTime | gcTime | Change |
| --- | --- | --- | --- |
| Message history | 5 minutes | 10 minutes | Preserved; newest-page repair |
| Conversation inventory | 2 minutes | 10 minutes | Increased from 30 seconds |
| Unread | 2 minutes | 10 minutes | Increased from 20 seconds |
| Tasks/detail, home/dashboard, meetings | 45 seconds | 10 minutes | Preserved |
| Projects, people | 2 minutes | 10 minutes | Preserved |
| Templates | 5 minutes | 15 minutes | Preserved |

No Infinity stale time or persistent private cache was introduced.

## Live validation and security evidence

| Scenario | Result |
| --- | --- |
| Admin project message → client browser | Arrived without navigation/manual refresh; no history GET |
| Client project message → admin browser | Arrived once without manual refresh |
| Background project message | Preview/unread updated; selected project stayed selected |
| Admin task message → client task conversation | Arrived once without manual refresh |
| Browser optimistic sends | One final row each for client and admin |
| Cross-tab read state | Second client tab's unread cleared after scoped read in first tab |
| Task update | Client task UI changed without refresh; original business fields subsequently restored |
| Conversation switching / earlier pages | One manager/channel; 100 loaded messages retained |
| Logout/account switch | Returned to sign-in, then admin workspace without client cache leakage; lifecycle removal covered by tests |
| Foreign task | Client SELECT returned zero rows versus one for its own task; admin received foreign update, client did not |
| Reconnect | Real SDK transport rejoined; one channel and one selected newest-page repair |
| Idle with two client tabs | Zero application HTTP requests over 87.1 seconds |

The available browser automation offered one browser profile; Chrome was unavailable. Admin/client browser tests ran sequentially with independent, concurrently authenticated SDK counterpart sessions. Two same-account client tabs were exercised simultaneously. Thus live delivery in both directions is established, but two different accounts in simultaneous separate browser profiles were not available for automation and remain a useful manual check.

Manipulated project/task event tests verify that unknown event contents cannot populate private histories/task details. Live RLS evidence: admin observed three task updates (two own-fixture updates plus one foreign probe), client observed two, and foreign task delivery to client was zero. No service-role credential is used by application browser subscriptions. The bundle audit scanned 68 public files: Frankfurt URL present, Seoul URL absent, private-secret matches zero, canonical local origin present, no workers runtime configuration.

RLS and server authorization remain the security boundary, not browser filters. Realtime cannot promise immediate eviction when a row becomes invisible under RLS and therefore no longer produces a deliverable update; authorized reconciliation remains necessary. This phase adds no permission-revocation protocol or DELETE support.

## Measured request behavior

For the selected-project admin→client delivery after the browser fix, the server audit showed the sending POST, a scoped recipient read PATCH, one unread GET and one inventory GET. The receiving UI issued **zero history GETs and zero route/page GETs**. This is a direct payload merge plus three related reconciliation/acknowledgment requests, not zero total network activity.

Idle evidence (`work/phase7-idle-result.json`) recorded **0 application HTTP requests in 87.1 seconds** with two client tabs, exceeding the former 60-second polling interval. WebSocket protocol traffic is not application HTTP polling and is excluded from that number.

The former polling pattern implied at least four requests per minute for the relevant open-screen configuration from source inspection; that is a source-derived baseline, not a newly measured paired run. Phase 2's historical navigation measurement remains 13 application requests / 35 Supabase calls. That exact navigation sequence was not rerun as a new Phase 3 benchmark, and no further percentage or cold-load improvement is claimed.

## Verification artifacts

- `work/phase7-tests-final.log`: 283 tests / 32 files passed, including existing auth, RLS/isolation, Messages, caching and scheduling regressions.
- `tests/realtime-sync.test.ts`: 28 focused cases covering ownership/lifecycle, scoped event behavior, optimistic ordering, pagination/gaps, receipts, task targeting, foreign payloads and burst/reconnect repair.
- `work/phase7-reconnect-live.log`: one additional real Frankfurt SDK reconnect test passed; test script/config are ignored local validation artifacts.
- Typecheck and lint passed after the final source edits; lint log: `work/phase7-lint-final.log`.
- `work/phase7-build-accepted.log`: clean `build:frankfurt` passed after identifying/stopping only the previous LeadsEdge listener and clearing only its verified build output path.
- `work/phase6-bundle-audit.json`: existing audit helper rerun against this accepted build, 68 public files. Historical Phase 6 report retains its original measurement.
- `work/phase7-ready.stdout.log`: final `start:frankfurt`; stderr empty at final inspection.

## Files changed in this phase

- Added `lib/realtime-sync.ts`, `components/realtime-provider.tsx`, `tests/realtime-sync.test.ts`.
- Updated `components/query-provider.tsx`, `components/conversation.tsx`, `components/messages-workspace.tsx`, `components/unread-counts.ts` and `components/cached-screen.tsx` to use the central owner and scoped cache repair.
- Removed obsolete subscription/timer logic from `components/admin/messages-client.tsx`.
- Updated `lib/query-cache.ts`, `lib/message-cache.ts`, `lib/message-workspace.ts` for freshness, pagination/gap merging and authorized open-project retention.
- Updated subscription-ownership expectations in `tests/client-messages-inbox.test.ts`, `tests/message-classification-and-feedback.test.ts`, `tests/messages-split-pane.test.ts`.
- Added this acceptance report and preserved the original audit separately. Ignored `work/` artifacts contain validation tooling and safe measurements.

The repository already contained substantial work from previous phases; this list does not claim those earlier changes as part of Realtime implementation.

## Staging mutations and scope

The only configuration mutation was the approved `project_tasks` publication membership. No schema, RLS, Auth configuration, identity, template or scheduling model changed. No SMTP, Cloudflare, Hostinger, DNS, Seoul, Tokyo or billing work occurred.

Controlled live validation generated one approved no-email sign-in per staging account and seven synthetic test messages (five project, two task). Test messages remain for audit; they were not silently deleted. Normal read receipts/notification read state changed as conversations were read. Synthetic task 06 was toggled with feedback disabled for the probe, then its original status, completion and feedback fields were restored. A same-value foreign task 16 status update tested RLS delivery. Database update triggers advanced `updated_at` on those probes; timestamp side effects were not represented as a complete transaction rollback.

Temporary sessions were held by the loopback helper in memory. That helper and its SDK channels are now closed. The browser's normal application session remains available for manual testing. Tokens, message bodies, cookies and credentials are not included in this report.

## Remaining limits and Phase 4 recommendation

One channel per tab bounds subscription ownership, but recipient fanout and RLS authorization still cost backend work as clients/tabs scale. Lightweight authoritative unread/inventory endpoints still run after communication changes. Initial join deliberately repairs races and may add initial requests. No meeting Realtime, task DELETE handling or immediate RLS-revocation eviction was added.

For Phase 4, measure cold authenticated route waterfalls separately from warm navigation: server bootstrap duplication, sequential authorized data reads, payload size and expensive SQL/RPC calls. Use traces and query plans before proposing aggregation or indexes. Preserve the account-scoped cache and this event-driven update path; no Redis, infrastructure expansion or database mutation is justified by the current measurements alone.
