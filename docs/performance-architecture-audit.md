# Leadsedge Portal production performance and architecture audit

## Executive conclusion

The portal is not CPU-bound. It feels slow because each uncached navigation waits for several 220–600 ms remote Supabase stages, and Vinext's RSC/SSR execution boundaries had repeated some identical reads. The previous pass improved query parallelism and removed automation/Google work from normal navigation, but it did not remove the physical database round trips or make navigation data persistent in the browser. Tail latency on the remote link is the dominant remaining problem.

The safest architecture is a hybrid: retain RSC for secure first render and deep links, keep RLS and database-backed role resolution, and introduce a persistent client data shell with identity-scoped SWR only for high-frequency navigation. A full SPA or framework rewrite is not justified.

## Request architecture

```text
Browser navigation
  -> Vinext proxy (cookie refresh + generated correlation ID)
  -> RSC/SSR route execution
       -> verified JWT claims
       -> users/profile role lookup
       -> RLS-scoped Supabase reads (parallel where independent)
       -> React server payload / HTML
  -> browser hydration
  -> Realtime subscriptions + visibility-aware 60 s fallback polling
```

Supabase Auth, PostgREST/Postgres, Realtime, Google Calendar, and Resend are separate latency domains. Google availability is lazy and does not run when Meetings merely opens. Resend and feedback/reminder processing are owned by the durable outbox and cron path, not page rendering.

## Evidence and baseline

All route numbers are whole-response wall time, ten non-cherry-picked samples after one warm-up. The original table is preserved in `docs/performance-baseline.md`.

| Route | Original p50 / p95 | Final p50 / p95 | Median change |
| --- | ---: | ---: | ---: |
| `/admin` | 1,012 / 1,725 ms | 1,675 / 2,484 ms | regression/noise |
| `/admin/projects/:id` | 1,127 / 1,586 ms | 1,005 / 1,679 ms | -11% |
| `/admin/messages` | 903 / 1,650 ms | 1,042 / 1,685 ms | regression/noise |
| `/admin/meetings` | 867 / 1,111 ms | 1,052 / 1,578 ms | regression/noise |
| `/portal` | 1,088 / 1,462 ms | 1,028 / 1,608 ms | -6% |
| `/portal/tasks/:id` | 1,232 / 1,895 ms | 1,178 / 1,887 ms | -4% |
| `/portal/messages` | 1,207 / 1,391 ms | 1,379 / 1,949 ms | regression/noise |
| `/portal/meetings` | 870 / 1,749 ms | 917 / 1,181 ms | p95 -32% |
| `/api/unread-counts` | 600 / 817 ms | 639 / 673 ms | p95 -18% |

The run-to-run regressions correlate with remote variance, not extra local work: final proxy medians were about 4–6 ms. A direct final comparison measured warm `getClaims()` at 3 ms median versus 306 ms for `getUser()`. Profile and unread calls remained 262 ms and 306 ms median. Therefore the auth change removes roughly one remote RTT from renders, but route totals do not fall uniformly while later database calls fluctuate by hundreds of milliseconds.

## Ranked bottlenecks

1. **Critical — remote Supabase RTT and tail variance.** Most independent queries cost about 0.25–0.35 s even when database execution is small; samples occasionally exceed 0.6–0.8 s. Several serial stages make this additive.
2. **High — route data is refetched on every RSC navigation.** The secure shell and route payload have no browser-persistent identity-scoped cache, so moving between Overview, Tasks, Chat, and back repeats profile, unread, project, and list reads.
3. **High — message pages load and aggregate broad histories.** Client inbox construction reads project messages, task messages, and receipts; conversation refreshes reload complete route data after Realtime/poll events.
4. **High — RSC/SSR duplicate execution.** Correlated traces showed duplicate Auth/profile/unread HTTP reads in one logical request. Request-ID-scoped in-flight deduplication now collapses identical safe reads, but this is a Vinext execution workaround rather than a substitute for an upstream fix.
5. **Medium — broad nested selects.** Project/task/message screens serialize complete nested collections. The admin dashboard's projects and clients are separate remote calls; the client home fetches project list, all visible tasks, notifications, meeting, and unread counts.
6. **Medium — hydration/navigation bundle.** Shared client chunks are approximately 224 KB, 182 KB, 153 KB, and 103 KB uncompressed before route chunks. It matters on first load, but does not explain repeated one-second server waits.
7. **Low — local CPU/memory.** Proxy processing is single-digit milliseconds and no sustained CPU saturation was observed. Production rendering is network-wait dominated.

## Changes retained (KEEP)

- Structured, opt-in `[PERF]` JSON timing with generated correlation IDs and redacted Supabase resource paths. `Server-Timing` exposes proxy duration without secrets.
- Verified `getClaims()` for JWT authentication. The app still resolves the current database profile and role, rejects missing/disabled/unrecognized identities, relies on RLS for data access, and never trusts `getSession()` as authorization. JWKS verification is cached by the SDK.
- Request-scoped in-flight deduplication for identical GETs and the read-only unread RPC only. IDs are generated server-side, entries expire after ten seconds, responses are cloned, mutations are excluded, and no data is shared between requests/users.
- A 60-second, owner/date-keyed meeting availability cache. Booking deliberately bypasses it and recalculates availability before the transactional booking RPC, preserving double-booking protection.
- Existing parallel independent route queries, one unread-count RPC, lazy meeting availability, durable automation/outbox processing, optimistic message insertion, Realtime subscriptions, and hidden-tab-aware fallback polling.

## Experiments rejected

- **Client-home unread context reuse (REJECT).** It improved median from 1,088 to 960 ms in one run but worsened mean and p95; it also complicated server/client ownership. Reverted.
- **Global/private response caching (REJECT).** The isolation risk outweighs the benefit. No profile, role, membership, tasks, messages, or notifications are cached across identities.
- **Removing polling entirely (REJECT).** Realtime can disconnect silently. Keep the visibility-aware 60-second fallback until disconnect telemetry proves it unnecessary.

## Proposals requiring approval

- **Bootstrap RPC/view:** return role/profile, unread counts, primary project summary, next actionable task, and next meeting in one authenticated RLS-safe database call. This removes two to four network round trips. It requires an additive reviewed migration and must preserve disabled-client and project-membership checks.
- **Targeted indexes:** validate with live `EXPLAIN (ANALYZE, BUFFERS)` in staging before adding composite partial indexes for unread notifications `(user_id, created_at) WHERE read_at IS NULL`, scheduled meetings `(owner_id, start_at) WHERE status='scheduled'`, visible client tasks `(assignee_id, status, created_at) WHERE archived_at IS NULL AND client_visible`, and message history `(project_id, created_at)` / `(task_id, created_at)`. Do not add them blindly.
- **Persistent identity-scoped data shell:** SWR-cache the bootstrap/project summaries and patch only changed entities after mutations/Realtime. Clear all state on sign-out or subject change. RSC remains authoritative for direct loads.
- **Message pagination:** fetch the latest page and prepend older pages on demand rather than returning entire histories.
- **Regional deployment:** run the Vinext server geographically close to the Supabase project. This is likely the largest infrastructure improvement because code cannot eliminate transcontinental RTT.

## Security assessment

Authentication uses signed claims, while authorization remains database profile/role validation plus RLS and explicit project/task/meeting access helpers. The optimization does not use unverified cookie user objects, service-role credentials in the browser, or cross-user caching. Mutations are never deduplicated. Meeting confirmation performs a fresh availability check. Durable automation remains idempotent and retryable.

Supabase's current SSR guidance recommends `getClaims()` for protecting pages and describes local verification with cached JWKS for asymmetric keys; `getUser()` remains appropriate only when the latest Auth user record itself is needed. The Portal needs its own live profile row for role and display state, so that database read remains authoritative.

## Realtime, polling, and mutations

Unread and message listeners clean up their channels. Polling runs every 60 seconds only while visible and is retained as reliability fallback. The main avoidable cost is `router.refresh()`, which replaces a whole RSC payload after message receipt or many mutations. The next safe pass should patch local normalized state immediately, invalidate only the relevant cache key, and reconcile in the background. Do not remove refresh until each mutation's derived counters and authorization transitions are covered.

## Production readiness and load testing

The repository includes a reproducible route benchmark. A 25/50-user load test was not fired at the linked database because no separate staging Supabase project was identified; generating that traffic against possible production would be unsafe. Before launch, run staged 1/10/25/50 concurrency tests and record throughput, error rate, p50/p95/p99, Supabase database CPU, PostgREST latency, Auth rate limits, Realtime connections, and outbox drain lag. Release gates should be error rate below 1%, p95 ordinary navigation below 1.5 s, no cross-client leakage, and no growing automation backlog.

## Recommended sequence

1. Deploy the application server in the same or nearest practical region as Supabase and repeat this exact benchmark.
2. Review and approve a single RLS-safe bootstrap RPC; benchmark it before changing consumers.
3. Add message pagination and an identity-scoped persistent shell for high-probability navigation.
4. Capture live query plans/`pg_stat_statements` in staging and approve only indexes justified by actual scans.
5. Run the staged concurrency matrix and add p95/error/outbox-lag alerts before production launch.

## Phase 2 update

The live project is in Seoul (`ap-northeast-2`). Live `pg_stat_statements` shows approximately 1 ms for unread counts and 2–5 ms for message reads, confirming that transport/Data API overhead dominates. A framework-prefetch persistent-shell POC failed its navigation gate and was reverted. Bounded 50-message cursor pagination was retained after improving `/portal/messages` p50 from 1,668 ms to 1,268 ms and p95 from 3,001 ms to 2,109 ms across matched 50-sample runs. See `docs/performance-phase-2.md` for the complete evidence and next architecture gate.

## Phase 3 update

Read-only account inspection found the Supabase organization on Free with both active project slots occupied, no branches, no Branching entitlement, and no PITR. A U.S. staging branch/project and placed Worker would therefore require a billing decision, so none was created. U.S. East/West ICMP probes reached the Supabase edge in roughly 0.7–2.6 ms but cannot observe the regional database leg; they are not substitutes for authenticated U.S. Data API measurements. The exact staging, security, benchmark, cost, and pre-launch region-migration plan is documented in `docs/performance-phase-3-us-infrastructure.md`.

## Classification summary

| Item | Decision |
| --- | --- |
| Structured timing/correlation IDs | KEEP |
| Claims-based JWT verification | KEEP |
| Request-scoped safe-read dedupe | KEEP |
| Meeting availability TTL | KEEP |
| Home unread-context shortcut | REJECT |
| Cross-user/private response cache | REJECT |
| Bootstrap RPC and indexes | PROPOSAL ONLY |
| Persistent client data shell | PROPOSAL ONLY |
| 25/50-user test against linked DB | REJECT; use staging |
