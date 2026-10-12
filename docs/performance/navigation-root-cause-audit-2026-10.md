# Deep navigation audit — October 12, 2026

## Scope and evidence

Baseline source commit: `1f7c28b1cb37a82539bb1c9bde9060292313d7d1` on main; working tree was clean at the start of this audit. Earlier changes are now committed by the user; they are preserved. Production's deployed commit remains unknown. Local standalone Frankfurt production builds and an **existing authenticated admin browser session** are used. No new tokens, emails or identities. No production deployment or provider mutation.

The architecture-brain file remains absent from the repository; it was not read. The previous navigation baseline and historical phase 8/9 reports were reviewed, but their synthetic/historical timings are not this audit's browser evidence.

## Executive diagnosis — baseline

The previous click-data-prefetch change cannot fix warm navigation: **the browser waits for an RSC response and then spends about another 300 ms displaying a Suspense fallback, although business data is already cached**. In 20 warm Dashboard↔People samples in each direction, business-data request count was zero and the shared shell DOM element was never replaced. The route response remained mandatory.

Local median click-to-content was 647.6 ms for Dashboard and 597.3 ms for People. Median response-end-to-content was 315.0/313.1 ms. This is measured browser evidence, not synthetic timers. It does not establish the exact production 1–1.5-second total.

Mechanism inspected: Vinext `dist/server/app-page-route-wiring.js:524` wraps discovered loading components in keyed Suspense boundaries. React DOM production `react-dom-client.production.js:10793` applies `globalMostRecentFallbackTime + 300 - now()` when committing retry lanes. The observed fallback-to-content interval is consistent with this path. The intervention below tests causality without modifying React/Vinext or authorization.

## Current critical path

All arrows below correspond to inspected source. Timing annotations are local browser observations, not server-side SQL timings.

```mermaid
sequenceDiagram
  participant U as Browser click
  participant L as CacheLink / Vinext Link
  participant R as Vinext RSC route
  participant A as Proxy / auth / bootstrap
  participant D as Supabase Frankfurt
  participant C as React / CachedScreen
  U->>L: Click (hover/focus may already prefetch data)
  L->>C: Existing account-scoped prefetchQuery
  Note over C: Warm case: cache hit, no data HTTP
  L->>R: Fresh route request; route prefetch disabled
  R->>A: Proxy getClaims; layout/page requireRole
  A->>D: get_portal_bootstrap via request-dedup fetch
  D-->>A: Current role, enabled state and unread counts
  A-->>R: Authorized shell/page
  R-->>C: Flight response; initialScreen omits warm business data
  Note over C: Baseline: keyed loading fallback, ~300 ms retry delay
  C->>C: Query cache lookup and destination render
  C-->>U: New content; next frame observed
```

Source map: components/cache-link.tsx; installed Vinext shims/link.js handleClick and shims/navigation.js navigateClientSide; proxy.ts; lib/auth.ts; lib/bootstrap.ts; lib/perf.ts; app/admin/layout.tsx; app/admin/page.tsx; app/admin/people/page.tsx; app/admin/templates/page.tsx; lib/screen-data.ts; components/cached-screen.tsx; components/query-provider.tsx; app/api/data/[role]/[screen]/route.ts. Client equivalents are app/portal/layout.tsx, page.tsx and tasks/page.tsx.

People uses one paginated RPC in lib/people.ts. Dashboard business reads are parallel. Bootstrap contains role/disabled state as well as secondary unread information, so it must not be bypassed or deferred wholesale. Existing request-scoped deduplication remains. Realtime uses resource invalidation, not router.refresh; no data requests occurred in the measured warm sample windows. DOM shell persistence is measured; React component effect mount counts are not equivalent and were not captured.

## Baseline browser methodology and results

Existing local admin session, same in-app Chromium browser, default viewport, no CPU/network throttling configured. Production build `npm run build:frankfurt`, normal standalone Node, local browser→Node and existing network→Frankfurt. Node connections and query cache warm. Forty alternating clicks produce 20 Dashboard and 20 People samples; another forty produce 20 Templates and 20 Dashboard control samples. An initial People visit is reported separately, not mixed into the 20 warm samples. No sleeps or artificial request delays are used.

Temporary local-only observer records click time, first frame containing loading/status feedback, first frame with the target H1 and no page skeleton, next animation frame, same-origin resource start/TTFB/end, proxy Server-Timing and shell DOM replacement count. It records no response bodies, query strings, cookies, user IDs or PII. All measurements are from the browser's monotonic clock, not automation command wall time. The second-frame metric is a paint opportunity, **not proof of physical display paint or event-handler interactivity**. True React profiler duration/click-to-interactive remains unavailable.

| Route/sample group | n | Content p50/p75/p95 ms | Next frame p50/p75/p95 | RSC TTFB p50/p75/p95 | After response p50/p75/p95 |
|---|---:|---|---|---|---|
| Dashboard, People pair |20|647.6 / 679.8 / 734.1|667.6 / 706.2 / 750.7|292.1 / 326.7 / 381.9|315.0 / 319.9 / 333.9|
| People |20|597.3 / 634.5 / 649.1|616.8 / 658.0 / 681.2|233.1 / 283.9 / 294.4|313.1 / 320.2 / 324.6|
| Dashboard, Templates pair |20|584.9 / 634.7 / 683.3|614.2 / 657.6 / 708.3|256.2 / 319.4 / 385.9|308.7 / 312.9 / 317.4|
| Templates |20|598.5 / 653.0 / 664.8|618.9 / 671.7 / 696.4|266.5 / 303.2 / 360.3|309.0 / 313.1 / 322.9|

Each measured warm transition has a route resource; zero measured-window screen-data requests; shell replacements zero. Data prefetch may precede click on first visits, so zero measured-window data requests must not be described as zero requests since page load. First People navigation: content 795.4 ms, next frame 811.3 ms, route TTFB 618.4 ms (one exploratory sample only). It is not a cold p95.

Safe server logs in work/deep-navigation-server.log show bootstrap HTTP durations typically hundreds of milliseconds and claims/proxy durations typically single-digit milliseconds in the sampled tail. Counts/durations are analyzed separately; no unmeasured SQL or Hostinger RTT is inferred. getClaims can run in multiple rendering contexts while the request bridge deduplicates the actual bootstrap HTTP. No auth optimization is applied.

## Options before intervention

| Option | Expected benefit/evidence | Risk and compatibility | Decision / rollback |
|---|---|---|---|
| A: optimize claims/bootstrap/network | Could reduce route TTFB, but no redundant slow auth call demonstrated | Revocation and role correctness; provider/SQL changes need review | Preserve; profile further, no speculative auth patch |
| B: remove broad loading boundaries, router-owned pending feedback | Targets measured ~300 ms post-response fallback delay | Low code complexity; may retain previous authorized view longer on slow loads; installed Link supports useLinkStatus | Test locally; restore two loading files and revert pending UI if ineffective |
| C: SPA-like client route replacement or full RSC prefetch | Could remove a route round trip | Risks stale authorization/history/framework compatibility; duplicates routing | Rejected as premature |

No caching TTL increase, optimistic destination authorization, dependency upgrade, Redis, schema/RLS change or framework patch.

## Intervention under test

- Remove app/admin/loading.tsx and app/admin/people/loading.tsx. Keep all role checks, shared layouts and narrower Messages/Meetings/project loading boundaries. No client loading boundaries removed without a client browser measurement.
- Add components/navigation-pending.tsx, using installed next/link useLinkStatus to show a nonblocking top progress line and accessible status text.
- Include it inside CacheLink, retaining all existing click guards, prefetch behavior and router ownership. Previous authorized content may remain until the destination is ready; destination content does not bypass its server gate.
- Add tests/navigation-pending.test.ts. Existing navigation/cache/identity tests remain.

Temporary app/layout.tsx instrumentation and public/navigation-audit.js must be removed before final handoff. They are not release files.

## Intervention result: real browser, not synthetic

Twenty alternating warm visits per destination after rebuilding. Same machine, browser engine, existing account and network; a new tab was needed because the original tab entered a connection-error page during the controlled server restart. After viewport measured 1265×720. Baseline viewport was not pinned/recorded and initially showed responsive navigation; this and network variation limit strict like-for-like end-to-end attribution. The response-end-to-content reduction and disappearance of the fallback plateau are the stronger causal evidence. No synthetic benchmark was rerun or used for acceptance.

| Route/group | Before content p50/p75/p95 | After content p50/p75/p95 | After next frame p50/p75/p95 | After RSC TTFB p50/p75/p95 | After response p50/p75/p95 |
|---|---|---|---|---|---|
| Dashboard, People pair |647.6 / 679.8 / 734.1|327.1 / 417.1 / 524.9|340.8 / 435.7 / 541.0|244.4 / 295.1 / 406.4|44.7 / 60.2 / 71.9|
| People |597.3 / 634.5 / 649.1|350.3 / 408.5 / 523.4|370.3 / 424.7 / 542.9|244.2 / 277.3 / 440.3|51.7 / 70.9 / 91.0|
| Dashboard, Templates pair |584.9 / 634.7 / 683.3|357.4 / 387.1 / 461.2|384.0 / 403.7 / 482.3|252.5 / 302.3 / 357.7|53.5 / 61.7 / 76.8|
| Templates |598.5 / 653.0 / 664.8|325.8 / 403.7 / 468.1|340.1 / 409.5 / 488.4|251.0 / 337.1 / 381.7|35.7 / 37.4 / 51.2|

All values milliseconds; nearest-rank percentiles. Pending feedback after p50/p75/p95: Dashboard (People pair) 23.0/25.1/36.3; People 24.5/30.9/43.5; Templates 37.3/40.3/53.2. Baseline feedback was typically 300–380 ms, after server response. Twenty after samples per target retained zero measured-window data requests and zero shell DOM replacements. The observer survived each sequence (no document reload during those measured clicks). The initial after People visit was 674.4 ms content / 720.3 ms next frame; excluded from warm statistics just like the initial baseline visit.

Ten after Back/Forward cycles succeeded, final heading correct and zero pending indicators. This is a functional history check; no before/after history percentile claim. A document restart caused the expected connection-error page while the server was intentionally stopped; not counted as a navigation sample.

Safe server log distributions (whole profiling runs, including initial documents/data requests, not individually paired to browser samples):

| Operation | Before n; p50/p75/p95 ms | After n; p50/p75/p95 ms |
|---|---|---|
| proxy |92; 4.8 / 5.8 / 8.4|87; 5.6 / 7.1 / 10.2|
| claims |178; 4.7 / 8.6 / 14.9|252; 3.6 / 7.7 / 16.0|
| bootstrap HTTP |91; 225.3 / 273.9 / 428.2|87; 188.5 / 273.9 / 387.9|

The bootstrap numbers include local Node→Frankfurt HTTP/network/provider processing, not isolated SQL execution. Hostinger→Supabase and browser→Hostinger RTT are not measured. SQL/index investigation is not justified by the demonstrated browser fallback stall. Bootstrap/network variability explains part of the total improvement, so do not attribute every saved millisecond to the code change.

## Safety, limitations and remaining validation

The demonstrated local admin improvement does not meet the proposed warm p75 <300 ms goal. Median route TTFB still consumes roughly 244–252 ms; it remains deliberately fresh. Local results cannot predict production latency because Hostinger changes both network legs.

No client session is available in this browser. Client Home→Tasks, disabled-client live revocation, changed-role live behavior, expired-session interactions and bidirectional Realtime writes were not performed. No account was modified to fabricate these tests. Existing unit/security suites cover those contracts; live acceptance is still required. Client loading boundaries remain unchanged. The shared pending UI uses router state only and does not expose protected content.

No twenty-sample cold, intentionally hover-delayed, touch-without-hover, rapid-switch or history timing series was completed. Automation clicks may trigger hover/focus before activation; the measured warm cache contains no business-data acquisition. Exact React render/commit, physical paint and click-to-interactive require a Chrome Performance/React profiling capture. The measured content/next-frame values are clearly narrower. No claim of a complete production incident resolution.

Temporary observer removed from app/layout.tsx and public/. Reproduction-only copy retained in ignored work/deep-navigation-observer.js; safe server logs in work/deep-navigation-server.log and work/deep-navigation-after-server.log. Final runtime must omit PERF_DEBUG. No permanent timing logger introduced.

## Exact production capture procedure for remaining evidence

1. Use an already signed-in Chrome session at https://portal.leadsedge.us. Record build SHA if available, browser version, viewport, network and timestamp. Do not change Auth or request another link for this audit.
2. Open DevTools Network (Preserve log on; Disable cache off for warm tests) and Performance. Clear the Network list, start recording, click People, wait until its search control is usable, then return to Dashboard. Stop recording. Inspect locally: click event time, first feedback/filmstrip content, main-thread render/paint, route and /api/data request start/TTFB/end. Do not use automation wall-clock duration as browser latency.
3. Repeat 20 samples each direction and for Templates. Keep warm, first-visit, hover-for-one-second, direct touch/emulation, Back/Forward and rapid-switch cases separate. A page reload clears in-memory query state for first-visit tests without clearing session storage/cookies. Never clear site authentication or use sign-out as a cache-reset tool.
4. Record a sanitized table only: sample number, route label, case, click→feedback/content/usable ms, RSC start/TTFB/end, data start/TTFB/end, request counts, proxy Server-Timing, safe request ID. Add long-task/render durations if available. Blank unavailable values rather than zero. Keep filmstrips private because People includes contact data.
5. Do not share raw HARs, full console logs, query strings, request/response bodies, cookies or headers containing credentials. Supply the sanitized timing table. Correlate safe request IDs with approved host logs if accessible; do not enable production profiling/configuration without approval. Browser TTFB alone cannot isolate SQL or either network leg.

## Scoped release proposal and rollback

Release files only: components/cache-link.tsx; components/navigation-pending.tsx; deletion of app/admin/loading.tsx and app/admin/people/loading.tsx; tests/navigation-pending.test.ts; this report. No migration required. Root layout, auth/session/Magic Link/Multi-Admin files, cache TTLs, realtime and providers are unchanged in the final diff.

No commit, push or deploy performed. After separate approval, stage exactly the six paths above (including deletions), inspect the full staged diff and commit as an independent navigation change. Do not deploy the full existing HEAD without auditing unrelated committed work and verifying the current production baseline. After separately approved deployment, repeat the production capture and existing client/auth/realtime acceptance.

Rollback: revert only the eventual isolated navigation commit, restoring both loading files and removing NavigationPending integration. No schema/data/provider rollback or sign-out required.

## Final checks

- Focused navigation/cache/task guards: 52 passed.
- Full suite: 458 passed across 54 passing files; the one opt-in synthetic benchmark was skipped, deliberately not used as performance evidence.
- Typecheck, lint and git diff --check passed.
- Final npm run build:frankfurt passed, standalone output generated; only nonfatal plugin-timing advisories.
- Root-layout diagnostic edit fully removed; no root-layout content difference from baseline. Public observer removed. No auth/session/Multi-Admin implementation changes.
- Final normal npm run start:frankfurt launched with PERF_DEBUG unset for manual testing. This local checkout is not an isolated production release.
- Final authenticated browser smoke passed Dashboard→People→Dashboard; no stuck pending indicator and no diagnostic script/element. Unauthenticated admin/People/Templates/portal requests redirect 307 to sign-in; admin/client data APIs return 401. Removed observer URL returns 404. Exactly one port-3000 listener, Node PID 9372.

Validation logs: work/deep-navigation-focused.log, deep-navigation-tests.log, deep-navigation-types.log, deep-navigation-lint.log and deep-navigation-final-build.log. Server timings and browser measurements above are from the instrumented comparison builds; final clean build receives a functional smoke check, not a fabricated second percentile run.
