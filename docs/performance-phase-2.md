# Leadsedge Portal performance phase 2

## A. What the previous audit proved

The proxy is local and cheap, asymmetric JWT claims verification removes a roughly 300 ms Auth round trip, PostgreSQL reads are reached through a high-variance remote path, and normal internal navigation still requests fresh RSC data. The application already has persistent layouts, loading states, Realtime, visibility-aware polling, durable automation, and lazy Google availability.

## B. Network topology

- Supabase project: AWS Seoul, `ap-northeast-2` (verified through the live Management API).
- Test runtime: local Windows workstation in Pakistan, Node 24, production Vinext server at `127.0.0.1:3000`.
- Intended runtime in the repository: Cloudflare Worker through OpenAI Sites; no staging deployment was identified or created.
- Observed authenticated REST operations: generally 220–700+ ms, with substantial tail variance.
- PostgreSQL hot-path execution: about 1–5 ms mean in live `pg_stat_statements`.

For the unread RPC, approximately 305 ms of a representative 306 ms application observation is outside PostgreSQL. Geography, TLS/HTTP, PostgREST, routing, and local network variance therefore account for more than 99% of that operation's elapsed time. This is not a claim that geography alone is 99%; the available evidence groups transport and Data API overhead together.

Production should enable a measured Cloudflare Worker Placement experiment toward the Supabase hostname or `aws:ap-northeast-2`. Static assets should remain edge-served. No deployment or placement change was made in this pass. Cloudflare documents Placement specifically for reducing repeated Worker-to-regional-backend RTT.

## C. Database versus network

| Operation | PostgreSQL mean | Application-observed | Non-Postgres overhead |
| --- | ---: | ---: | ---: |
| Unread counts RPC | 1.012 ms (2,444 calls) | ~306 ms median | ~305 ms |
| Project-message detail query | 2.127 ms (228 calls) | one component of a 1.2–1.7 s route | overwhelmingly outside Postgres |
| Admin project-message inbox query | 4.977 ms (128 calls) | one of three parallel inbox reads | overwhelmingly outside Postgres |
| Message insert | 9.507 ms (11 calls) | network-dependent mutation | transport dominates typical acknowledgement |

The hot SQL is not slow enough to justify RLS weakening or speculative indexes. Existing project/task message indexes match current filters and ordering.

## D. Bootstrap

Current shell establishment uses verified local claims plus a profile read and unread-count RPC. Client project context is then loaded by individual pages. An additive, `SECURITY INVOKER`, authenticated-only prototype is in `supabase/migrations/202609030001_portal_bootstrap_prototype.sql`.

| | Current | Prototype expectation |
| --- | ---: | ---: |
| Shell database requests | 2 | 1 |
| Project-context request on pages needing it | 1 | included minimally |
| Expected network stages saved | — | 1–2 |

The prototype trusts only `auth.uid()`, returns minimal JSON, and relies on existing RLS plus the hardened unread helper. It was **not applied** because only a linked live project was available. Latency and payload size therefore remain unclaimed until a reviewed staging application.

## E. Application-shell POC

Before and after, Vinext keeps the admin/client layout component mounted during framework navigation. The POC added bounded idle and hover/focus prefetch for Messages and Meetings. Forced-dynamic authenticated RSC payloads were not usefully reused, so clicks still waited for remote server data. The POC was reverted under the go/no-go rule.

No global state library was installed. No private cross-user cache was introduced. A real persistent-data architecture would require identity-keyed client loaders/API responses and explicit invalidation, rather than relying on Vinext's private RSC prefetch behavior.

## F. Navigation benchmark

The browser POC alternated `/admin` and `/admin/messages` using the rendered navigation. Ten completed samples measured 3,126 ms p50, 8,187 ms max, and 3,633 ms mean. A 50-transition run exceeded the two-minute test window. It failed the required 30% or sub-250 ms gate and was reverted.

The shell itself remained visible, but useful destination content was not available immediately. Initial-load HTTP results must not be mistaken for click-to-useful-content results.

## G. Request count

| Route | Before | After retained changes |
| --- | ---: | ---: |
| Client project conversation | profile + unread + project + messages | same calls; message result bounded to 50 |
| Admin inbox | profile + unread + projects + three inbox reads | unchanged |
| Proposed shell bootstrap | profile + unread (+ later context) | one RPC, not applied |

Request-scoped duplicate HTTP reads remain collapsed only within the same server-generated request ID.

## H. Messages

Message conversation loaders previously returned every user message in a project or task. They now retrieve the newest 50 using the existing `(project_id, created_at)` and `(task_id, created_at)` partial indexes, restore chronological display order, and expose authenticated cursor pagination through the existing message endpoint. The UI offers “Load earlier messages”. Client authorization is checked before page retrieval and RLS remains active.

Matched 50-sample `/portal/messages` HTTP benchmark:

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| p50 | 1,668 ms | 1,268 ms | -24.0% |
| p75 | 2,259 ms | 1,517 ms | -32.8% |
| p90 | 2,769 ms | 1,877 ms | -32.2% |
| p95 | 3,001 ms | 2,109 ms | -29.7% |
| mean | 1,943 ms | 1,409 ms | -27.5% |
| standard deviation | 489 ms | 290 ms | -40.7% |
| max | 3,280 ms | 2,211 ms | -32.6% |

This is retained: it materially improves both median and tail behavior without changing authorization or records. Admin inbox aggregation remains unbounded across histories and needs a purpose-built summary RPC or view before it can be fixed safely.

## I. Realtime

Realtime already updates unread indicators and conversations. Initial unread state still comes from the server. A visibility-aware 60-second poll remains as disconnect recovery; removing it was not justified by reliability evidence. Mark-read already updates counts optimistically from the mutation result. Message send already displays a pending local message only after a successful response; a future pass can render a clearly marked sending row before acknowledgement and roll it back on failure.

## J. Security

- Deduplicator tests prove identical reads share only within one request ID.
- Simultaneous different request IDs do not share responses.
- POST mutations are never deduplicated.
- Rejected reads are removed immediately and can retry.
- Store size is capped at 1,000 entries; normal entries expire after ten seconds.
- Correlation IDs are generated by the server, not trusted from callers.
- Pagination authorizes client project/task access before reading and remains RLS-scoped.
- No user-supplied identity is accepted by the bootstrap prototype.
- No RLS, authentication policy, client record, message, or production schema was changed.
- Existing auth, role, isolation, invalid-cookie, and direct-route tests remain part of the 62-test suite.

## K. Keep, revert, proposal

| Experiment | Decision | Reason |
| --- | --- | --- |
| Bounded/rejection-safe request dedupe | KEEP | closes identified safety gaps; concurrency tested |
| 50-message cursor pagination | KEEP | 24% median and 30% p95 improvement |
| Idle/hover RSC prefetch | REVERT | failed browser go/no-go gate |
| TanStack Query/SWR dependency | REJECT for this POC | unnecessary before proving an API-backed client architecture |
| Minimal bootstrap RPC | PROPOSAL ONLY | additive and promising, but requires staging security/performance review |
| Cloudflare Placement toward Seoul | PROPOSAL ONLY | likely high impact; requires a non-production deployment experiment |
| Remove Realtime fallback polling | REJECT | reliability not proven without it |

## L. Production recommendation

1. Keep assets at the Cloudflare edge.
2. Run a staging Worker with Placement targeted to the Supabase hostname or Seoul AWS region; compare 100 identical authenticated reads with and without placement.
3. Apply the bootstrap prototype only to staging after SQL/security review, then measure request count, payload, admin/client/disabled-user behavior, and cross-client isolation.
4. If both experiments succeed, expose small RLS-authorized JSON loaders and add a custom identity-keyed stale-while-revalidate cache for dashboard/messages/meetings. Clear it on sign-out, Auth state change, and subject mismatch.
5. Replace admin inbox history aggregation with a reviewed database summary function and pagination.

[Cloudflare Placement documentation](https://developers.cloudflare.com/workers/configuration/placement/) explains how Worker execution can move near a regional backend. [Supabase regions](https://supabase.com/docs/guides/platform/regions) identifies `ap-northeast-2` as Seoul.

## M. Final verdict

### NOT YET PRODUCTION PERFORMANCE READY

The retained pagination change is substantial, and the database itself is fast. However, measured internal navigation still misses the product target by an order of magnitude. The next high-confidence intervention is not more component micro-optimization: it is a staging experiment combining near-database Worker placement, one bootstrap request, and API-backed identity-scoped client data reuse.

## Direct answers

1. The measured database portion is 1–5 ms; roughly 250–600+ ms per operation is transport/Data API/runtime overhead. Geography is a major component but cannot be isolated from PostgREST/TLS without near-region compute.
2. PostgreSQL is approximately 0.3–2% of observed hot-read elapsed time in representative measurements.
3. One minimal bootstrap can replace two shell calls and a later project-context call; the unapplied prototype demonstrates the shape.
4. Layout identity and navigation already persist. Private page data can persist only through an explicitly identity-keyed cache with server/RLS revalidation.
5. Yes, but only with subject-scoped keys, hard clearing on session changes, and no use of cache for authorization or mutation permission.
6. Vinext RSC prefetch did not make these forced-dynamic routes immediate and was reverted.
7. Realtime handles normal incremental unread updates; fallback polling remains necessary for dropped subscriptions.
8. Yes. Message pagination improved client Messages p50 by 24% and p95 by almost 30%.
9. Near-Supabase placement should remove repeated long server-to-database paths, but the exact gain requires the proposed staging A/B test.
10. Yes, through bounded cached page data and optimistic reconciliation—but the current framework-only prefetch POC did not achieve it.
