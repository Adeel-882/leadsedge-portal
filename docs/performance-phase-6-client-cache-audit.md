# Phase 6 — client cache audit (before application changes)

Date: 2026-09-29. Frankfurt standalone Node, canonical http://127.0.0.1:3000. Baseline: 27 test files / 219 tests, typecheck and lint passed. No schema, auth, RLS or staging-data changes.

## Evidence and limits

Read the current source, installed Vinext link implementation, bootstrap and request dedup, all major pages and mutation refresh sites. Measured the authenticated existing client browser session against production standalone. Temporary ignored `work/phase6-observe.mjs` observes Node HTTP paths, methods, byte counts, timing and correlates existing PERF_DEBUG records using AsyncLocalStorage. It records no query strings, headers, credentials or bodies. Raw evidence: `work/phase6-baseline2.json` and corresponding stdout log. The first observer lacked correlation; its zero read counts are invalid and are not used. The corrected run below is authoritative.

Admin browser measurements remain pending explicit sign-in approval (a previous automatic approval review rejected creating an admin link). Admin counts below are source-derived, not claimed live measurements. The browser tool does not expose Resource Timing; browser timings below measure click-to-visible locator, including automation overhead, rather than Web Vitals. Node TTFB is response-write timing, not browser network TTFB. Blur/reconnect cannot be instrumented faithfully with the available browser surface; existing effect behavior is source-audited.

## Current architecture

Server Components load all business data on each normal route navigation. Authenticated layouts resolve signed claims plus the authoritative get_portal_bootstrap RPC. React cache and the trusted request-ID bridge deduplicate identical GETs and two read-only RPCs within one request. Nothing reuses those results across navigation. Supabase RLS and explicit client-access checks remain authoritative. No service role is required by these browser-facing reads.

Client UI state survives only within its mounted component. Messages selection uses local history and fetch, but A→B→A requests A again. Older pages are discarded on remount. Unread counts have an existing local hook, delta events, Realtime and a 60-second visible-tab fallback. Messages inventories and histories have existing subscriptions and polling; no new Realtime invalidation is proposed in this phase.

Vinext default Link auto-prefetch requests a dynamic shell for visible routes. Ten extra shell requests occurred around the initial home load, each costing one bootstrap RPC. Six more task-link shells were observed on the tasks list. These requests are distinguishable by small shell-only response, one bootstrap call and no business reads; the standard `purpose` header is absent. This is not SQL duplication within a request.

## Request map

All counts below exclude proxy JWKS/session refresh and include one bootstrap RPC unless indicated. Common shell has no immediate unread API request; visibility/events/60s can issue get_unread_counts later.

|Screen|Business reads / RPC|Stages after layout|Repeats/remount behavior|
|---|---|---|---|
|Admin dashboard/projects|projects embedded memberships/task counts, clients, next meetings (3)|parallel, meetings after viewer|all three on every navigation|
|Admin people|RPC get_admin_people, q/page (1)|role + RPC parallel|same search/page repeated|
|Admin templates|templates embedded task count (1)|parallel layout|list repeated; details separately fetched|
|Admin meetings|meetings (1)|role then meetings|repeated|
|Admin messages|project metadata + recent project/task activity + unread receipts (4), selected history (1)|inventory parallel then selected history|5 repeated + read PATCH|
|Admin settings|admin_settings, calendar_connections, availability rules/settings (4)|role then parallel queries|repeated; keep on server initially|
|Portal home|projects, task list, notifications(5), next meeting (4)|parallel after authoritative viewer|all repeated|
|Portal tasks|project_tasks with assignee/project filters (1)|after viewer|identical task list already fetched on home|
|Portal task detail|task details, newest50 messages, authorized task, client projects (4)|first stage parallel; access/project second stage|5 total measured; read PATCH follows|
|Portal messages|projects, tasks, unread receipts, recent project/task activity (5), selected newest50 (1)|viewer → projects/tasks → receipts/activity → selected|7 total measured + read PATCH|
|Portal meetings|active projects, meetings (2)|role then parallel|repeated; slot API separate|

Project and task inventories share metadata already read for portal home/tasks. Different projections (task access vs detail; inventory activity vs history) cannot safely be deduplicated just because they hit the same table. No SQL/schema changes needed.

## Client navigation evidence

Corrected sequential run: home document → Messages → home → tasks → task04 → Messages → home. No mutation other than existing per-open read acknowledgement. 27 nonstatic HTTP requests: 7 actual route loads, 17 shell prefetches, 3 read PATCHes. 62 Supabase calls: 36 route reads, 17 shell bootstrap calls, 9 read-ack calls (including 3 write RPCs). HTTP correlation excludes proxy internal fetches.

|Actual route|Supabase calls|Node TTFB ms|Response ms|Payload bytes|
|---|---:|---:|---:|---:|
|Home document|5|1650|3796|8989 compressed|
|Messages first|7|361|1602|22565|
|Home return|5|877|1727|18654|
|Tasks|2|255|524|46879|
|Task04|5|250|1064|15550|
|Messages return|7|379|1378|22565|
|Home return2|5|328|1044|18654|

Earlier same-session browser click-to-visible sample: home document 2892ms, Messages 3018ms, home return 1012ms, tasks 889ms, Messages return 2540ms, home return 1313ms. Back/Forward 177/91ms (Vinext history reuse), so do not claim those need replacing. Network variability makes single samples directional only. Route revisits refetch unchanged business data conclusively.

## Freshness, keys and mutation matrix

Keys start `['private', viewerId, role, resource, ...stable scalar arguments]`. Never cache authorization outcomes. The provider is keyed to authenticated identity/role, recreated server-side per render/request and stable in the browser. Logout clears memory. No persistence/localStorage. APIs validate the current role and optional expected-viewer header to prevent a response from another account entering an old cache.

|Resource|staleTime|gcTime|Stale display|Invalidated by|
|---|---:|---:|---|---|
|templates/list + detail|5min|15min|yes|template create/edit/archive/duplicate|
|projects/people|2min|10min|yes, never authorize|project/person changes|
|dashboard/home|45s|10min|yes|project, task, meeting, notification changes|
|tasks/list + per-ID detail|45s|10min|yes for display, action server checks|task completion/feedback/editor/import|
|meetings|45s|10min|yes; availability always checked|book/cancel|
|conversation inventory|30s|10min|yes|send/read; existing refresh signals preserved|
|message history per kind/ID|5min|10min|yes|send/read callbacks; existing poll/subscription refresh|
|unread|20s|5min|briefly|read delta/server refresh|
|settings/security/membership|server authority|none for authorization|never for access|keep existing server checks|

History retains newest50 plus at most 9 earlier pages (500 messages); once cap reached show explicit cap rather than dropping newest messages. No entire-history fetch. Optimistic send updates only history, then preview on success; failure rolls back its temporary item and shows error. Task completion invalidates exact detail, list/home, relevant admin dashboard; template edits do not invalidate independent imported tasks. Booking affects meetings/home/dashboard. Broad router.refresh remains for unmigrated server detail/editor/settings or permission transitions, with relevant cache invalidation added where needed.

## Priority and Phase 1 acceptance gate

1. Five highest-value repeats: portal projects, portal task list, home notifications/next meeting composite, conversation inventory, selected message history. Admin dashboard composite similarly high by source inspection.
2. Highest cost: Messages (7 calls + read acknowledgement) and home (5), task detail (5). Default shell prefetch adds many security reads. This is cross-request repetition, not identical-read failures inside one request.
3. Cache rendered business data in browser memory, scoped to account and role, for the times above.
4. Session, role, disabled status, membership, foreign-ID checks and all mutation permission checks remain authoritative on the server/RLS. Browser cache cannot authorize.
5. Existing request-scoped dedup handles bootstrap and identical Supabase GET URLs within one request, including split RSC/SSR environments. Preserve it.
6. All normal return navigations create new request IDs, so business reads repeat. New cache addresses that.
7. TanStack Query supports React18/19. npm registry currently reports stable 5.104.0, peer `^18 || ^19`; installed React19.2.6 qualifies. Standard client provider + initialData use no special RSC prefetch machinery. Official guidance: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr and https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults . Runtime persistence still must be verified after build.
8. Reuse unread delta hook, request dedup, bootstrap, all authorization/query helpers and message APIs. Do not replace auth or subscriptions.
9. Keys: identity prefix + dashboard/home/projects/people(q,page)/templates/tasks/task(id)/meetings/conversations/messages(kind,id)/unread. Shared factory; parameters scalar and normalized.
10. Expected fresh return business read reduction: home 4→0, tasks1→0, inventory5→0, selected history1→0; admin dashboard3→0, templates1→0, people1→0. One authoritative bootstrap per ordinary RSC navigation remains. Read acknowledgement remains for genuinely opened threads. Cold document hydration should add zero duplicate browser data reads. These are design targets, not measured after-results.

HIGH: cache screens and messages, remove auto private shell prefetch. MEDIUM: targeted mutation invalidation and shared list seeding. LOW: settings/detail editors (infrequent visits, leave server managed). A standard cache is compatible; proceed to implementation, then runtime verification. The goal is zero redundant business reads, not eliminating necessary security checks.

## Admin baseline addendum (unchanged baseline build)

After explicit approval, one no-email admin sign-in was completed through the existing local confirmation flow. While source changes were underway, the original standalone build was still running, so these are genuine before measurements. Sequence: dashboard → Messages → dashboard → People → dashboard → Templates → dashboard.

|Route|Supabase calls|Node response ms|Payload bytes|
|---|---:|---:|---:|
|Dashboard document|4|1678|10008 compressed|
|Messages|6|1625|17170|
|Dashboard return|4|770|15339|
|People|2|558|16311|
|Dashboard return2|4|1733|15339|
|Templates|2|995|10517|
|Dashboard return3|4|1383|15339|

Browser click-to-visible: Messages1926ms; Dashboard returns1007/2033/1709ms; Templates1299ms. The People locator initially used the wrong heading (People instead of All People), so that browser timing is excluded; Node measurement is valid. Evidence is in `work/phase6-baseline-complete.json`. No email was sent and no business data was changed. Opening Messages invokes its existing per-thread read acknowledgement.
