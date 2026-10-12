# Navigation audit — October 12, 2026

## Evidence and scope

Branch main, baseline HEAD e8d4b11. Existing auth/sign-out, confirmation, Multi-Admin tests and untracked reports/templates are preserved. No production commit has been verified; local HEAD must not be equated with Hostinger's deployment. No authenticated browser session or local listener was available at baseline. No token, email or identity was created for profiling. Production timing, SQL execution time, browser commit/hydration time and actual browser Back performance are **not measured**.

MASTER_SYSTEM_ARCHITECTURE_BRAIN.md and LEADSEDGE_PORTAL_NAVIGATION_ARCHITECTURE_AUDIT_2026-10-12.md were not found in the workspace. They were not read. Earlier phase reports are historical, not current benchmarks.

Lockfile versions: Vinext 1.0.0-beta.3, Vite 8.0.13, React 19.2.6, Next 16.3.3, Supabase SSR 0.12.5, supabase-js 2.112.4, TanStack Query 5.104.0. Production build command is npm run build:frankfurt; runtime is normal standalone Node. No package changes proposed.

## Current path, source evidence

- components/admin/admin-shell.tsx: Dashboard /admin, People /admin/people, control Templates /admin/templates. components/portal/portal-shell.tsx: Home /portal, Tasks /portal/tasks. Both use CacheLink, not plain document navigation.
- components/cache-link.tsx: next/link with route prefetch disabled; independent account-scoped screen-data prefetch on mouse-enter/focus only. No click handler starts data. No idle prefetch. On touch without a preceding hover/focus, data waits for route arrival.
- Installed node_modules/vinext/dist/shims/link.js handleClick invokes application onClick before navigateClientSide, then starts a React transition. Modified clicks/download/new-window actions retain native behavior. This installed implementation supports safely starting an independent data fetch before route navigation without replacing the router.
- proxy.ts currently uses getClaims (not the older report's getUser). It refreshes cookies and overwrites request correlation/path headers. lib/auth.ts validates claims and awaits bootstrap. These existing auth choices are not changed or independently endorsed as a revocation optimization here.
- app/admin/layout.tsx and app/portal/layout.tsx await requireBootstrapRole, then render QueryProvider and the shell. Page role checks reuse React cache; lib/perf.ts bridges duplicate read fetches across rendering contexts using a server-generated request ID. No new cache or identity trust introduced.
- lib/screen-data.ts initialScreen detects text/x-component Accept and omits business data for RSC transitions. Full document loads fetch business data server-side. After RSC, components/cached-screen.tsx reads the account-scoped QueryClient; a missing/stale entry starts /api/data/{role}/{screen}.
- app/api/data/[role]/[screen]/route.ts independently resolves viewer/bootstrap, validates role and viewer consistency, checks screen allowlist, then loads business data. Responses remain private/no-store. Prefetch cannot bypass these checks.
- lib/people.ts getPeople calls one paginated get_admin_people RPC (25 records), not a per-person HTTP fan-out. Dashboard starts projects, clients and next meeting concurrently (lib/screen-data.ts); project task counts are embedded, not one HTTP call per task. Templates uses one list query. Home concurrently loads projects, notifications and tasks; Tasks uses the existing guarded task-list projection.
- QueryProvider retains its browser QueryClient by identity; server renders get independent clients. Shared layout placement has no pathname key forcing remount. Actual shell remount frequency remains unmeasured. Browser private-cache lifetime and invalidation unchanged.
- components/unread-counts.ts uses bootstrap initial data and existing query freshness. lib/realtime-sync.ts batches invalidation by resource (200 ms), visibility-gates work, and reconciles connection/visibility changes. No router.refresh in that manager. No evidence that a duplicate refresh is causing this navigation incident.
- Existing admin/People/portal loading skeletons and CachedScreen role=status remain. No new loading state or optimistic authorization is necessary for the narrow scheduling fix.

## Ranked diagnosis before application edits

1. **Verified code-level scheduling gap, synthetic causal reproduction:** on a cold click without hover/focus, route and business-data acquisition are serial. Starting the existing data prefetch on an eligible click can overlap them. This affects direct/touch navigation with cold or stale data; it does not explain a slow warm return with fresh cache.
2. **Remaining mandatory route/server wait:** even hover-prefetched and warm navigation still acquires the RSC route, including authorization/bootstrap. It is a plausible contributor to the reported 1–1.5 seconds, but current live magnitude is unmeasured. Full RSC prefetch could skip a fresh gate via router caching, so it is not enabled speculatively.
3. **Unproven:** expensive People SQL, shell remount, hydration, proxy transport, duplicate refresh, network geography or deployed-code mismatch. Do not label any of these the production root cause without a live trace.

## Baseline experiment (before application edits)

Opt-in tests/navigation-overlap-benchmark.test.ts invokes the actual CacheLink handlers and a real QueryClient. Fetch returns synthetic empty JSON after an 80 ms timer; route arrival is modeled with a 50 ms timer. Windows timer scheduling adds jitter. No provider, PII or authenticated network calls. Twenty serial samples per destination per case, one process, no discarded samples. Cache is independent each sample; warm/hover cases prime it outside the measurement. Back is only a cache-return model, not browser history. Percentiles use nearest rank.

| Target | Cold click p50/p75/p95 ms | Warm return | Hover-prefetched | Back cache model |
| --- | --- | --- | --- | --- |
| People | 145.3 / 151.4 / 167.5 | 58.3 / 64.1 / 65.8 | 55.8 / 61.2 / 64.8 | 63.7 / 64.2 / 65.1 |
| Dashboard | 148.0 / 149.0 / 152.8 | 62.8 / 64.5 / 65.1 | 60.9 / 64.3 / 65.1 | 57.0 / 63.9 / 65.0 |
| Templates | 146.3 / 150.3 / 151.9 | 55.9 / 60.7 / 64.8 | 57.8 / 64.5 / 71.3 | 58.7 / 63.7 / 65.1 |
| Tasks | 147.4 / 149.2 / 150.3 | 58.1 / 59.8 / 63.5 | 58.0 / 63.8 / 64.4 | 56.8 / 63.5 / 64.0 |

Cold modeled waterfall: click → route timer (~50–65 ms) → data fetch (~80–100 ms) → data ready. Each cold sample makes one data request; other cases make zero requests during the measured window. RSC TTFB, SQL time, React commits and paint are N/A, not zero. Raw synthetic samples: work/navigation-baseline.json. This is mechanism evidence, **not a production-build browser benchmark or proof of a production SLO**.

## Proposed narrow implementation

Start the identical existing query on an unmodified primary same-tab click, after respecting the caller's cancellation. Keep hover/focus, query keys, freshness, role checks, router transitions and all auth code intact. QueryClient deduplicates overlap with hover and mounting. Exclude modifier clicks, downloads, new tabs and unmapped destinations. No route prefetch, global personal-data cache, SQL or configuration changes.

## Implemented change and matched after measurement

Only components/cache-link.tsx changed in application code. Its onClick calls the caller first, rejects cancelled/modified/non-primary/download/new-window actions, then invokes the existing prefetch function. Vinext still performs navigation. Existing loading/status UI is retained; no paint-time claim is made.

After run used the same harness, machine, timers, fresh per-sample caches and 20 samples per case (320 samples per run). The focused regression suites also ran in the after process, a small measurement confound; the reduction is supported by observed request ordering, not only percentile changes. No measurements were discarded. Raw after samples: work/navigation-after.json.

| Target/case | Before p50/p75/p95 ms | After p50/p75/p95 ms |
| --- | --- | --- |
| People cold click | 145.3 / 151.4 / 167.5 | 88.8 / 94.8 / 102.9 |
| People warm return | 58.3 / 64.1 / 65.8 | 58.2 / 60.3 / 65.5 |
| People hover | 55.8 / 61.2 / 64.8 | 61.4 / 64.4 / 65.8 |
| People Back cache model | 63.7 / 64.2 / 65.1 | 57.6 / 61.6 / 64.6 |
| Dashboard cold click | 148.0 / 149.0 / 152.8 | 84.9 / 88.9 / 90.2 |
| Dashboard warm return | 62.8 / 64.5 / 65.1 | 56.8 / 58.2 / 65.3 |
| Dashboard hover | 60.9 / 64.3 / 65.1 | 57.2 / 63.0 / 64.4 |
| Dashboard Back cache model | 57.0 / 63.9 / 65.0 | 58.9 / 63.0 / 63.9 |
| Templates cold click | 146.3 / 150.3 / 151.9 | 88.1 / 94.6 / 96.2 |
| Templates warm return | 55.9 / 60.7 / 64.8 | 56.0 / 63.0 / 64.1 |
| Templates hover | 57.8 / 64.5 / 71.3 | 58.1 / 63.0 / 66.2 |
| Templates Back cache model | 58.7 / 63.7 / 65.1 | 58.1 / 63.6 / 64.4 |
| Tasks cold click | 147.4 / 149.2 / 150.3 | 87.6 / 90.2 / 94.6 |
| Tasks warm return | 58.1 / 59.8 / 63.5 | 56.1 / 58.3 / 65.5 |
| Tasks hover | 58.0 / 63.8 / 64.4 | 59.4 / 63.8 / 64.4 |
| Tasks Back cache model | 56.8 / 63.5 / 64.0 | 55.6 / 63.8 / 64.3 |

After waterfall: click starts data (~80–100 ms) and modeled route (~50–65 ms) together → both ready. Cold data-request count remains exactly 1; measured warm/hover/Back-model counts remain 0. Route delay itself is unchanged. Real RSC TTFB, transfer time, SQL duration, React commit and paint remain **not measured**. This does not prove the production 1–1.5-second incident is fixed, nor meet a production p75/SLO. Already-prefetched slow desktop clicks need further diagnosis.

## Validation and outstanding work

- Focused navigation/cache/cold-screen/dedup suite: 54 tests passed, including the opt-in after benchmark.
- Full suite: 456 passed; one opt-in benchmark skipped (53 files passed, one skipped). Benchmark was run separately before and after. Existing auth expiry/redirect, client task access, bootstrap, cache isolation and realtime regression suites remain in this run; these are not new live RLS tests.
- Typecheck, lint, git diff --check and npm run build:frankfurt passed. Build emitted plugin-timing advisories, not failures. Standalone output generated. Logs: work/navigation-full-tests.log, work/navigation-typecheck.log, work/navigation-lint.log, work/navigation-build.log.
- New regression coverage: admin and client mapped destinations; click starts before route completion; hover/focus/click/mount dedup; fresh return cache; native browser actions and caller cancellation; unmapped/auth/task-detail destinations; denied response stores no data; foreign identity cache not reused.
- Real desktop/mobile hydration, actual Back history, layout mount counts, existing authenticated production navigation and live disabled-client/foreign-record requests were not run. No connected authenticated session was available. Existing skeleton/status accessibility markup and history/realtime mechanisms were not modified.
- Sandbox Vite temporary-file rename failed before tests started; tests were rerun outside that restriction successfully. No application failure was hidden.
- Built Node HTTP smoke: unauthenticated /admin, /admin/people, /admin/templates, /portal and /portal/tasks each returned 307 to /auth/sign-in. /api/data/admin/people and /api/data/client/tasks each returned 401. No tokens used and response bodies were not logged. These are denial checks, not authenticated navigation measurements.
- One local listener remains at http://127.0.0.1:3000, Node PID 19468, launched via npm run start:frankfurt. This is a build of the current working checkout, including its pre-existing unfinished work, and is for local testing only. It is not an isolated production release.

## Safe release and rollback (not executed)

Review only these four files for this task:

1. components/cache-link.tsx
2. tests/cache-link-navigation.test.ts
3. tests/navigation-overlap-benchmark.test.ts
4. docs/performance/navigation-baseline-2026-10.md

After separate commit approval, stage those exact paths, inspect `git diff --cached --name-only` and `git diff --cached`, and commit only that reviewed scope. Do not use `git add .`. No commit/push/deploy performed. Current HEAD already contains unrelated Multi-Admin work: deploying the entire checkout is not authorized by this navigation task. The pending Magic Link release and existing changes are preserved.

Rollback the navigation change by reverting its eventual isolated commit (or only its CacheLink hunk); no database or environment rollback. There is no new migration.

## Approval-gated recommendations / remaining production diagnosis

No Auth/SQL/hosting change is justified by current measurements. Keep them unchanged. With a connected existing authorized session, collect 20 samples each for cold click, repeat, hover and browser Back on Dashboard↔People, Templates control and Home→Tasks. Record safe route labels, RSC and data start/TTFB/end, render commit, document request count and layout mount count. Use identical build/client/network before and after, and observe server request IDs and existing PERF_DEBUG only in an approved local profiling run, not production configuration changes. Separate browser→Hostinger RTT from Hostinger→Frankfurt time; inspect SQL only if HTTP timing identifies it as material.

If route bootstrap dominates warm clicks, alternatives are: retain current fresh checks (recommended until measured), evaluate framework-supported route prefetch with explicit revocation tests (may replay authorization results), or profile a narrower server contract (requires SQL/security review if changed). Do not substitute cookie getSession identity, weaken disabled-client checks, or extend private cache freshness. Any alternative needs its own measured trace, approval where applicable, tests and reversible patch.
