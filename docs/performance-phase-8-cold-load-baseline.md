# Phase 8 — Cold-load baseline

Measured September 30, 2026 before application changes, using the accepted Phase 3 standalone Frankfurt build at http://127.0.0.1:3000. Baseline suite: 283 tests / 32 files passed.

## Method

Twenty measured full-document HTTP loads per route, interleaved in a fixed ten-route sequence; one initial round excluded. Each document load creates a fresh request and bypasses the browser TanStack cache. The Node process, HTTP connections, JWKS and database buffers stay warm: this measures cold screen/data loads, not process boot or an empty PostgreSQL buffer cache. HTTP measurements exclude browser hydration, Realtime initial-join repair and browser paint; these are checked separately. p95 is the nearest-rank 19th of 20 values, a small-sample estimate rather than a production SLO. No emails were sent. One approved temporary sign-in per named staging account was used.

Temporary local preload records response metadata, elapsed fetch intervals and decoded byte lengths. No cookies, credentials, URL query values or response bodies are logged. Body clones impose some measurement overhead, identically in before/after runs. Supabase wait is the union of overlapping fetch/body-read intervals, not their sum. The residual includes framework rendering, serialization, scheduling and instrumentation; it is NOT a CPU-time measurement. Decoded JSON bytes are not compressed wire bytes.

## Baseline

| Route | Node p50 ms | Node p95 ms | Supabase calls (RPC/table) | Supabase decoded bytes | Wait-union p50 ms | Residual p50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| /admin | 650 | 713 | 4 (1/3) | 8298 | 550 | 104 |
| /admin/people | 519 | 681 | 2 (2/0) | 4471 | 419 | 93 |
| /admin/templates | 463 | 586 | 2 (1/1) | 513 | 402 | 61 |
| /admin/meetings | 485 | 603 | 2 (1/1) | 250 | 425 | 64 |
| /admin/messages | 835 | 959 | 6 (1/5) | 79150 | 757 | 79 |
| /portal | 581 | 708 | 5 (1/4) | 11520 | 513 | 75 |
| /portal/tasks | 590 | 712 | 2 (1/1) | 7242 | 472 | 113 |
| /portal/tasks/:id | 762 | 873 | 5 (1/4) | 3946 | 707 | 66 |
| /portal/messages | 1116 | 1272 | 7 (1/6) | 53244 | 1038 | 82 |
| /portal/meetings | 518 | 622 | 3 (1/2) | 4676 | 441 | 69 |

Every measured request used one get_portal_bootstrap RPC, despite layout/page/helper consumers. The existing request-ID-based fetch dedup works across the runtime's render contexts. Two measured auth.getClaims operations plus the proxy session check occur per document; the steady sample contained no remote Auth fetches, so these should not be described as three database lookups. Median-near claims/proxy spans and all individual fetch spans are retained in the summary JSON. No standalone repeated profile/membership table acquisition was observed except the task-detail access lookup discussed below.

## Actual waterfalls

### /admin

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 14–259 ms; 248 decoded bytes
- projects: 276–463 ms; 5405 decoded bytes
- clients: 276–463 ms; 2643 decoded bytes
- meetings: 276–580 ms; 2 decoded bytes

### /admin/people

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 9–264 ms; 248 decoded bytes
- rpc/get_admin_people: 285–477 ms; 4223 decoded bytes

### /admin/templates

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 12–236 ms; 248 decoded bytes
- templates: 250–434 ms; 265 decoded bytes

### /admin/meetings

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 16–205 ms; 248 decoded bytes
- meetings: 227–464 ms; 2 decoded bytes

### /admin/messages

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 12–278 ms; 248 decoded bytes
- project_messages: 298–509 ms; 11124 decoded bytes
- task_messages: 298–511 ms; 50304 decoded bytes
- message_read_receipts: 299–607 ms; 2 decoded bytes
- projects: 299–573 ms; 5405 decoded bytes
- project_messages: 609–791 ms; 12067 decoded bytes

### /portal

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 8–192 ms; 317 decoded bytes
- projects: 214–436 ms; 2009 decoded bytes
- notifications: 214–564 ms; 1507 decoded bytes
- meetings: 214–518 ms; 762 decoded bytes
- project_tasks: 215–437 ms; 6925 decoded bytes

### /portal/tasks

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 10–215 ms; 317 decoded bytes
- project_tasks: 240–520 ms; 6925 decoded bytes

### /portal/tasks/:id

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 6–213 ms; 317 decoded bytes
- project_tasks: 222–418 ms; 283 decoded bytes
- project_tasks: 419–613 ms; 797 decoded bytes
- task_messages: 419–616 ms; 540 decoded bytes
- projects: 419–736 ms; 2009 decoded bytes

### /portal/messages

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 10–256 ms; 317 decoded bytes
- projects: 281–486 ms; 2009 decoded bytes
- project_tasks: 281–474 ms; 6925 decoded bytes
- message_read_receipts: 488–677 ms; 2 decoded bytes
- project_messages: 488–678 ms; 7753 decoded bytes
- task_messages: 489–813 ms; 25434 decoded bytes
- project_messages: 815–1077 ms; 10804 decoded bytes

### /portal/meetings

Median-near observed request, milliseconds from Node request entry:

- rpc/get_portal_bootstrap: 14–263 ms; 317 decoded bytes
- meetings: 288–474 ms; 2350 decoded bytes
- projects: 289–480 ms; 2009 decoded bytes

## Findings before edits

- Client Messages is slowest: bootstrap, projects/tasks, receipts/activity, then selected newest history. Seven calls over four dependent stages. The five inventory reads are candidates for parallel execution under the existing user session and RLS; history selection still needs inventory for the default thread. It never loads every history.
- Admin Messages uses six calls and three stages. Inventory reads already overlap. Its 79,150-byte payload is mostly bounded activity samples. Reducing samples blindly could hide legitimate conversations.
- Task detail uses five calls and three stages: bootstrap, explicit access row, then full task/history/projects. The access and full task projections can be combined for cold loads while preserving the lightweight access gate for warm navigation.
- Home and dashboard already parallelize their screen reads after bootstrap. They have five and four calls respectively, over two stages; there is no accidental four-query serial waterfall here.
- People already uses get_admin_people. Templates/meetings/tasks use one screen read after shell bootstrap. An RPC per small screen would mostly add maintenance complexity.
- Existing get_portal_bootstrap is the live shell authorization/unread contract, even though an old source comment still calls it unwired. It returns viewer/display role, disabled gate, primary project shell metadata and unread counts. Broadening it with all screen business data would unnecessarily burden every navigation.
- Client task lists transfer assignee identity/status columns only to filter rows; PostgREST empty embeds can retain the inner filter without returning those columns. No select('*') is used by the audited major screen queries.

## Evidence

work/phase8-baseline-requests.json (210 requests including ten excluded initial loads); work/phase8-baseline-trace.jsonl (safe per-request timing); work/phase8-baseline-summary.json; work/phase8-baseline-tests.log. Instrumentation is in ignored work/phase8-observe.mjs and will be removed from the running server after acceptance. No database mutation was used for this baseline.

