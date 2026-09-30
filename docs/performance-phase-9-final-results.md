# Phases 4 and 5 — Final acceptance

Completed September 30, 2026. Application-only optimization is implemented and validated. Database analysis found no index/function/RLS migration justified for this fixture and latency profile. **No database migration or Supabase configuration change was applied.**

## Final cold-load comparison

Twenty measured full-document requests per route per stage, with one initial round excluded. All 630 requests across the three runs returned 200 without the checked application-error markers. The final sample was taken after the clean Frankfurt build. Each table entry is Node full-response **p50/p95 milliseconds**, not browser paint time. The Node process, network connections and database buffers are warm; the screen has no browser query-cache reuse.

| Route | Pre Phase 4 | Post Phase 4 | Post Phase 5 / final | Supabase calls | Decoded Supabase bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| /admin | 650/713 | 509/563 | 581/723 | 4 → 4 | 8298 → 8298 |
| /admin/people | 519/681 | 490/567 | 560/682 | 2 → 2 | 4471 → 4471 |
| /admin/templates | 463/586 | 457/567 | 484/569 | 2 → 2 | 513 → 513 |
| /admin/meetings | 485/603 | 465/636 | 519/611 | 2 → 2 | 250 → 250 |
| /admin/messages | 835/959 | 720/809 | 803/1008 | 6 → 6 | 79150 → 79150 |
| /portal | 581/708 | 492/720 | 572/809 | 5 → 5 | 11520 → 9848 |
| /portal/tasks | 590/712 | 527/614 | 603/743 | 2 → 2 | 7242 → 5570 |
| /portal/tasks/:id | 762/873 | 465/670 | 531/650 | 5 → 4 | 3946 → 3663 |
| /portal/messages | 1116/1272 | 761/981 | 821/1102 | 7 → 7 | 53244 → 51572 |
| /portal/meetings | 518/622 | 491/599 | 505/610 | 3 → 3 | 4676 → 4676 |

Phase 5 applied no code or database performance treatment: its final column is a repeated measurement of the same optimized application. It must not be presented as an additional SQL speedup. Unchanged admin/People/Templates routes also vary between runs; this is a modest local sample over a remote network, not a controlled production SLO. An initial final-run attempt raced server startup and failed before generating any trace/sample; the recorded final run was then completed in full.

The strongest attributable improvements are structural:

- Task detail: five remote calls → four; three dependent stages → two. One full task read now includes the previous explicit access predicates. Final p50/p95: 531/650 ms versus 762/873 ms baseline.
- Client Messages: seven calls remain, but four dependent stages → three. The five inventory reads run together. Final p50/p95: 821/1,102 ms versus 1,116/1,272 ms baseline.
- Client task-list projection removes 1,672 unused bytes each time it is acquired, reducing Home, Tasks and Messages payloads without changing their DTOs.
- Other screen loaders were already parallel and bootstrap dedup already worked; no new competing cache/dedup layer or unnecessary RPC per route was added.

## Phase 4 decisions

Existing screen-level contracts, account-scoped TanStack Query, shell bootstrap and cursor histories were retained. Cold task authorization/data are acquired together; warm cached task navigation still performs its independent current-access check. Client inventory uses explicit embedded client/task filters plus unchanged RLS, removing the ID-discovery waterfall.

Live old/new query comparison used the same signed client session: three projects, 19 accessible tasks, 45 sampled project activity rows and 124 sampled task activity rows. Both project and task activity projections matched exactly. No private message content was written into the comparison artifact.

A narrow Messages metadata RPC remains a possible future request-count/payload reduction (client document calls seven → three), but after parallelization it would not remove another full inventory network stage. No function migration was necessary to deliver these changes. Extending get_portal_bootstrap with every screen would make it unnecessarily broad. Home/dashboard reads already overlap, and People is already aggregated.

## Phase 5 decisions

The live catalog and pg_stat_statements were reviewed, then authenticated EXPLAIN ANALYZE/BUFFERS measured the real access patterns. The actual generated task-inventory query shape measured 20.949 ms median, task newest-page 16.410 ms, actual earlier-page 7.730 ms, client unread 0.479 ms, and client bootstrap 3.379 ms. The current Data API inventory statement's cumulative mean was 39.49 ms over 21 calls.

A simplified flattened diagnostic join took 297 ms but differed materially from PostgREST's lateral shape. It was not used to claim the application query was that slow. No measured plan showed physical disk reads or sort spills. Unread measurements cover the current zero-unread state; they are not a large-unread stress benchmark.

- Indexes proposed: none. Indexes approved/applied/removed: none.
- Functions or RLS changes: none. Additional Phase 5 query rewrites: none.
- Existing partial conversation, recipient-unread, task assignment/visibility and feedback-due indexes cover the relevant patterns. Small sequential scans are not evidence of a missing index.
- No remote N+1 was found in the ten screen loaders. Exact counts retain their existing semantics; growing OFFSET message pagination was not introduced.
- Application connections remain supabase-js/Data API with the normal runtime transport. The existing pooler was used only by isolated read-only diagnostic scripts. No direct Postgres client or new pool was added to the app.

Exact PostgreSQL execution contribution inside each HTTP request was not directly traced. Separate authenticated plans and cumulative statistics are provided rather than a fabricated per-route SQL total. The route waterfalls still show remote waits much larger than the measured SQL execution.

## Regression, security and browser acceptance

**290 tests across 33 files passed.** Typecheck and lint passed. Clean npm run build:frankfurt passed. The suite retains Auth, RLS/isolation, cache, 28 Realtime cases, Messages pagination/dedup, template copy behavior and completed_at-based feedback scheduling coverage. Seven tests were added for cold/warm task authorization, consolidated task reads, parallel inventory start and filtered payload preservation; existing static guard assertions were updated to the new equivalent query.

Live security evidence:

- Signed client HTTP: Home, Tasks and own task return 200; foreign task returns 404; admin dashboard aggregate returns 403.
- Authenticated SQL/RLS: own task count 1, foreign task/project/task-message counts 0.
- Existing disabled fixture: bootstrap null, project/task/task-message counts 0. No fixture status was changed for this check.
- Bundle audit: 68 public files, Frankfurt URL present, Seoul URL absent, zero private-secret matches, canonical 127.0.0.1 origin, no workers runtime configuration.

Browser validation on the normal uninstrumented accepted build:

| Scenario | Result |
| --- | --- |
| Admin Dashboard / People / Templates / Meetings / Messages | Visible and navigable; Lead Assignment remains listed |
| Client Home / Tasks / Task Detail / Messages / Meetings | Visible and navigable |
| Cold documents | All ten routes measured via HTTP; browser dashboard/home handoff, Messages reload and task-detail reload verified |
| Warm navigation | Tasks → Meetings → Tasks works with existing cache |
| Client → admin project message | Arrived in admin browser without refresh |
| Admin → client project message | Arrived in client browser without refresh; one conversation bubble |
| Task status update | Client task action changed without refresh; restored original fields afterward |
| Newest page / Load Earlier | 50 rows initially, 100 after Load Earlier |
| Switch away and back | All 100 loaded rows retained |
| Realtime ownership | One manager/channel in each browser account, including after navigation and history switches |

Only one browser profile was available. Different account browser checks therefore ran sequentially with concurrently authenticated SDK counterpart sessions; this is not a claim that two separate browser profiles were automated simultaneously. Existing optimistic-send/reconnect lifecycle tests passed; those complete live Phase 3 stress scenarios were not all repeated in this phase.

Two Vinext ERR_STREAM_UNABLE_TO_PIPE errors were logged during browser navigation/reload: the runtime attempted to pipe to a closed/destroyed response stream. No corresponding visible failure or failed measured response was observed. Navigation cancellation is a plausible explanation but was not proven with request-level cancellation tracing. The existing Vinext runtime was not patched; keep this as a framework diagnostic follow-up if users observe a failed screen.

## Final runtime and staging side effects

Exactly one listener remains on port 3000: **Node PID 3908**, command node --env-file=.env.frankfurt.local dist/standalone/server.js, launched with npm run start:frankfurt. Canonical URL: http://127.0.0.1:3000. Temporary performance preloads/PERF_DEBUG are absent from this final launch. Both loopback helpers on 3016/3018 closed, with their processes exited. The admin dashboard remains open for manual testing.

One approved temporary no-email sign-in was generated for each named account, then reused throughout all measurements/browser checks. Two additional synthetic project messages were sent for the bidirectional live test and remain as audit evidence. The feedback-disabled synthetic task 06 was toggled and restored to its original status/completion/feedback fields; the normal updated_at trigger advanced its timestamp. Reads updated normal conversation receipts/notification state. No duplicate clients/projects or replacement template data were created.

Auth implementation/settings, identities, RLS, schema, Realtime publication, SMTP, Cloudflare, Hostinger, DNS, Seoul, Tokyo and billing were untouched. No Redis, queue, shared private cache or infrastructure component was introduced.

## Files changed

Application: lib/queries.ts, lib/screen-data.ts, app/portal/tasks/[taskId]/page.tsx.

Tests: tests/cold-screen-data.test.ts (new), tests/cache-task-route.test.ts, tests/client-conversation-threads.test.ts, tests/client-messages-inbox.test.ts, tests/query-cache.test.ts.

Reports: this file and the three linked below. Ignored work/ files contain safe measurements and local validation tooling. Pre-existing repository changes from earlier phases were preserved.

## Reports and reproducibility

- [Cold-load baseline and per-route waterfalls](performance-phase-8-cold-load-baseline.md)
- [Phase 4 BFF/application results](performance-phase-8-bff-results.md)
- [Phase 5 query, RLS and index evidence](performance-phase-9-database-query-audit.md)
- work/phase8-final-summary.json and work/phase8-final-trace.jsonl: final distributions and fetch intervals.
- work/phase8-equivalence.json and work/phase8-browser-checks.json: safe live equivalence/browser outcomes.
- work/phase8-final-tests.log, work/phase8-final-typecheck.log, work/phase8-final-lint.log, work/phase8-clean-build.log: final checks.

## Next benchmark recommendation

Run this same normal Node build near Frankfurt, such as the intended Hostinger Germany host, only in a separately authorized deployment task. Keep Supabase region/plan/data constant, measure Node→Data API latency separately from browser→Node paint/hydration, and repeat cold p50/p95 plus warm navigation and reconnect cases. Use a larger realistic task/message/unread dataset before deciding on an inventory RPC or policy optimization. No hosting or production configuration was changed here.

