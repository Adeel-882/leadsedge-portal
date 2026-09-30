# Phase 6 — browser query cache results

## Outcome and evidence

The browser now retains authenticated business data in memory across ordinary navigation. It does not cache authorization decisions or authenticated server responses globally. Audit: [performance-phase-6-client-cache-audit.md](performance-phase-6-client-cache-audit.md).

Before: Server Components repeated business reads on every route request; request-ID dedup helped only inside one request. Message switching discarded both latest history and loaded earlier pages. Automatic Vinext Link prefetch issued private shell requests for many visible links.

After: TanStack Query **5.104.0** (React19-compatible), one browser QueryClient per authenticated identity/role, standard client provider, server initialData on document loads, authorized JSON loaders on navigation when data is missing/stale. Existing bootstrap, request dedup, Supabase session and RLS remain in place. No Redis, persistent browser cache, new Realtime subscriptions, schema, infrastructure or identity changes.

The first implementation failed a real browser measurement: Vinext removes `RSC` from `next/headers` via its FLIGHT_HEADERS filter. A naive `headers().get('rsc')` check therefore fetched business data again on every navigation. The corrected boundary checks standard `Accept: text/x-component`, which Vinext's installed navigation implementation sends and preserves. Regression tests cover a navigation with Accept present and RSC absent. This uses normal framework navigation, not a private RSC cache or persistent-shell experiment.

## Cache ownership and keys

`['private', viewerId, role, resource, ...scalarArguments]`, centralized in `lib/query-cache.ts`. People keys include normalized search/page; task keys include task ID; message keys include kind and resource ID. Role-specific endpoints independently verify current viewer/role and the expected-viewer header before reading data. Message APIs also reject mismatched expected viewers. Resource access remains RLS/application-authorized.

Composite screen keys intentionally own dashboard project/client/meeting data and portal home project/task/activity/meeting data. The identical home task-list projection additionally seeds the shared `tasks` key with its original timestamp; it is not refetched on the first Tasks visit after Home. We did not split every backend query into independent browser requests.

|Data|Freshness|Unused retention|Focus behavior|
|---|---:|---:|---|
|Templates list|5min|15min|no focus refetch|
|People metadata|2min|10min|no focus refetch|
|Project metadata within dashboard/home|45s with composite|10min|no focus refetch|
|Dashboard / home|45s|10min|no focus refetch|
|Tasks / per-ID task detail|45s|10min|no focus refetch|
|Meetings|45s|10min|no focus refetch|
|Conversation inventory|30s|10min|existing visibility refresh retained|
|Message history|5min|10min|existing live subscription / 60s fallback retained|
|Unread counts|20s|10min|existing visibility/event/60s refresh retained|

Stale mounted queries can refetch on remount/reconnect. No global `refetchOnMount:false` hides stale data. Stable data does not refetch merely on focus. Explicit local mutations invalidate affected data immediately. Metadata in cache is for display, never an authorization predicate. Cross-user mutations appear through current subscriptions (messages) or the documented stale window for other data; broader Realtime invalidation is future work.

## Routes and loading

Migrated: admin dashboard/projects index, People list/search/pages, Templates list, Meetings list, Messages inventory/history; portal Home, Tasks list, task detail, Meetings, Messages inventory/history. Existing markup, task actions, feedback forms and split-pane workspace are reused.

Intentionally server-managed: admin project detail/tasks/editor, person detail tabs, template editor, settings/calendar/availability; meeting detail, notifications and account pages. Low-frequency workflows were not converted indiscriminately. Mutations in those editors still invalidate affected migrated screens.

Document loads hydrate initial data without a duplicate browser business-data fetch. Ordinary route navigation still waits for the authoritative server boundary and may show its existing route loading fallback. Once that boundary returns, fresh cache data renders without a second loading/empty cycle. This does **not** make every full-route click literally instantaneous: bootstrap/network/streaming latency remains. In-page conversation returns are local and do not issue a history GET while fresh.

Default RSC Link prefetch is disabled in authenticated UI. Navigation links selectively prefetch the appropriate JSON query on hover/focus, only for known dashboard/list/meeting destinations and only when stale. Messages history is fetched on selection, never speculatively for every row. Browser Back/Forward retains ordinary Vinext behavior.

## Message history, sending and reads

Each kind/ID has an independent useInfiniteQuery entry. Newest50 initially; cursor-based Load Earlier. At most10 pages/500 retained messages, including long optimistic-sending sessions; a visible cap notice explains the bound. Returning A→B→A preserves earlier pages. No entire-history load.

Sending appends a temporary message to the correct query, sends once, replaces it with the saved result, and updates the inventory preview. Failure removes only that optimistic item, preserving other received messages, and displays the failure. No unrelated task/template/meeting queries or whole route refresh.

Opening a conversation still PATCHes only that conversation. Counts update from actual returned receipt deltas. Cached history does not imply cached read authorization. No mark-all-read-on-inbox behavior. The top badge still represents accessible unread project + task communication. Existing subscriptions/poll handlers are preserved and write into the new storage; no new Realtime-driven invalidation system was added.

Live check: task history50 → Load Earlier100 → project conversation → same task100. The return issued **no history GET**; only the existing read acknowledgement ran. No new live message was sent. Rollback and scoped send behavior are covered by isolated tests.

## Targeted mutation matrix

|Mutation|Affected cache resources|Broad route refresh|
|---|---|---|
|Project create/delete/change/invitation status|dashboard, projects metadata, people, home, conversations|removed in dashboard/People|
|Person edit|people, dashboard, projects metadata|retained for server person detail|
|Template create/duplicate/archive/edit|templates, template detail namespace|removed on list; retained in server editor|
|Task completion/feedback|exact task detail, tasks, home, dashboard|removed for client task actions|
|Admin task edit/import|tasks, task detail namespace, summaries|retained for server project/task editor|
|Meeting book/cancel|meetings, home, dashboard|removed; keep normal destination navigation|
|Message send|that history + conversation preview|removed|
|Conversation read|that inventory row + global receipt delta|removed|

Imported project tasks are never invalidated as a side effect of editing the reusable template.

Remaining `router.refresh` sites: `settings-form` (server profile/settings shell), `admin/availability-form` (server availability), `admin/calendar-connection` (server connection state), `admin/invite-button` (server invitation state), `admin/person-profile-client` (server profile detail), `admin/tasks-client` (two import/add branches, server task list), `admin/task-editor` (save/request/cancel feedback, server task detail), `admin/template-editor` (three editor mutations, server template detail). `admin/messages-client` retains two legacy polling/subscription calls but has no active page import; the active split-pane path uses neither. Data-only refreshes were removed completely from dashboard, People list, Templates list, client completion/feedback, meeting book/cancel, and active Conversation.

## Security and error behavior

No auth route or origin/PKCE/TokenHash changes. No Supabase settings, RLS, schema or fixture changes. APIs continue to use the session-bound server client. Authoritative bootstrap rejects disabled accounts. Explicit resource access helpers remain in task/message paths. Task routes recheck the existing task-access helper on every navigation, including a warm browser-cache hit; the JSON endpoint independently checks access. This deliberately retains a resource permission read alongside bootstrap. Foreign manipulated IDs cannot obtain data. The cache never provides a fallback for401/403/404.

Provider changes identity before rendering another account's children and clears the previous cache. Sign-out clears cache; a transient BroadcastChannel logout signal clears other tabs and makes them revalidate. Full-document departure clears memory; BFCache restoration reloads to revalidate. No localStorage, persistence, or cross-user server singleton. Admin→client was checked live after sign-out; admin↔client and client A→B transitions are also unit tested.

Background data errors preserve usable existing data with retry UI. Permission/not-found failures hide the resource. Mutation failure is visible and optimistic messages roll back. Existing non-cache editor business logic remains server-managed.

## Measurements

Counts refer to instrumented Node HTTP requests and session-scoped Supabase fetches, excluding static assets and proxy-internal JWKS/refresh. Per-open acknowledgement includes a write RPC, so total “Supabase calls” is more precise than “reads.” Temporary local observer records only paths/methods/status/timing/byte counts and correlation IDs. No credentials, message contents, cookies or URL queries are recorded.

|Fresh return|Before business reads|After business reads|Authoritative reads retained|
|---|---:|---:|---|
|Admin Dashboard|3|0|bootstrap|
|Portal Home|4|0|bootstrap|
|Portal Tasks after Home|1|0|bootstrap|
|Portal Messages inventory/history|6|0|bootstrap + per-open read permission/ack|
|Conversation A→B→A history|1 history GET|0 history GET|read permission/ack|

Initial measured client sequence before:27 nonstatic HTTP requests /62 Supabase calls. Intermediate revised-cache sequence:13 /34. The accepted build adds the deliberate task-route resource permission check: **13 /35**, including first visits and three read acknowledgements. This removes all17 automatic shell-prefetch requests observed in the baseline. Final acceptance measurements are recorded below.

|Route|Baseline Node response ms|Cached-build Node response ms|
|---|---:|---:|
|Admin Dashboard return1|770|483|
|Admin Dashboard return2|1733|437|
|Admin Dashboard return3|1383|646|
|Portal Home return1|1727|805|
|Portal Home return2|1044|347|
|Portal Tasks|524|446|
|Portal Messages return route|1378|282|

Browser observed click-to-visible samples include automation overhead: admin Dashboard returns1007/2033/1709ms before vs1104/1011/1189ms after. Client Messages return2540ms before vs275ms after; Home second return1313ms vs801ms. A cached task thread with100 retained messages returned in927ms including tool overhead and observation. These are small sequential samples over variable network latency, not percentile benchmarks.

Cold document reads are unchanged: admin4, portal5; no immediate duplicate browser business fetch. Client document response3796ms before vs2333ms after in these samples; admin1678ms vs3845ms. Cold load is not reliably improved and the first new route may add API authorization round trips. For example first client Messages now has route bootstrap1 + inventory6 + history3 instead of a single7-call server route, before acknowledgement. First task-detail navigation also adds an independently authorized endpoint. This tradeoff is explicit; warm revisits, not cold-load speed, are the demonstrated win. Do not infer SQL improvements.

Browser Back/Forward baseline177/91ms already reused framework history. Reconnect/true tab-focus network conditions were not forcibly changed; their policies are source/unit verified. A few browser locator waits reported timeouts despite visible matches; those timings were excluded. Server logs showed Vinext stream-cancellation errors when leaving in-flight requests; no private data or successful-cache corruption resulted. No claim of a complete browser Web Vitals lab.

## Validation and follow-up

255 tests in31 files pass, including auth, Messages isolation/read state, template copy and completion-relative timing, query freshness/hydration, account separation, bounded pagination, rollback, targeted invalidation and authoritative task-route permission checks on warm navigation. Typecheck and lint pass. Live admin: dashboard, People, templates, template editor7-day timing, Messages and Meetings checked. Live client: Home, Tasks/detail, Messages, empty project conversation, Meetings, admin redirect and foreign task denial checked. The direct foreign-project API browser URL was blocked by the browser tool; existing API authorization tests cover that case. No business fixture edits, SMTP/DNS or infrastructure changes. Only approved temporary sign-ins and normal per-conversation read acknowledgements occurred.

Phase3: preserve scoped keys and add reviewed subscription/event invalidation for tasks/projects/meetings, coalesce unread and inventory signals, and measure reconnect behavior. Then consider authorized BFF aggregation to reduce cold-navigation permission round trips. Do not remove server authority to achieve zero total requests. Keep request dedup and bootstrap. Consider loading-shell UX separately with Vinext-supported navigation; do not revive custom private RSC prefetch.

## Final acceptance — September 29, 2026

After the task-route permission guard, the full suite passed **255 tests /31 files**. Typecheck and lint passed. Removed only the verified repository `dist` build output, with port3000 free, and completed a clean **`npm run build:frankfurt`** successfully. Build logs retain upstream plugin timing warnings; no build error.

The accepted-build browser sequence, run uninterrupted within the freshness windows, is recorded in ignored local evidence `work/phase6-accepted.json`, HTTP audit IDs50–62. Static files are excluded in both before/after application-request counts. Browser times include automation overhead.

|Client step|Node route response ms|Route Supabase calls|Additional API work|Browser observed ms|
|---|---:|---:|---|---:|
|Home document|3341|5|none|3573|
|Messages first visit|229|1|inventory6 + history3 + read ack3|3111|
|Home return|676|1|none|1334|
|Tasks|209|1|none; shares Home's task projection|865|
|Task04|432|2|task payload5 + read ack3|2704|
|Messages return|340|1|read ack3; no inventory/history GET|1028|
|Home return2|876|1|none|1597|

Total **13 HTTP /35 Supabase calls**, versus baseline **27 /62**: approximately52% fewer application requests and44% fewer Supabase calls. The remaining task-route calls are bootstrap plus current resource access. No duplicate business fetch followed the server-hydrated Home document. Back/Forward remained functional (345/80ms observed); foreign task16 was again denied on the accepted build.

An earlier, deliberately documented slower final walkthrough crossed freshness/poll intervals: **15 HTTP /42 Supabase calls**, including Home's expected stale refresh5 and unread poll2. Fresh-cache results must not be interpreted as a promise that stale screens never refresh. First-visit task/API authorization adds overhead; cold response improvements remain unproven. The admin measurements above were from the same cache implementation before the final client-only task-route guard; no additional sign-in link was generated to repeat them.

Bundle audit:67 public build files checked; Frankfurt public URL present, Seoul URL absent, zero matches for private secret environment values, canonical configured origin127.0.0.1:3000, no workers.dev runtime configuration. This is a value-leak check, not a general security certification.

Temporary observation was disabled after measurements. The app is left running through **`npm run start:frankfurt`**, with one verified Node listener on port3000. No business fixture data, auth implementation, RLS, schema, SMTP or infrastructure was changed by this cache phase. Both approved temporary sign-ins were used once; no further token/email was generated.
