# Phase 8 — Application aggregation results

Measured after application-only changes and before Phase 5 SQL analysis, September 30, 2026. No function, schema, RLS, index, publication or Supabase setting change was applied. Baseline methodology and raw timing evidence are in [the baseline](performance-phase-8-cold-load-baseline.md).

## Before/after

Twenty measured cold documents per route per build, plus one excluded initial round. Times are Node full-response milliseconds; p95 uses nearest rank.

| Route | Baseline p50/p95 ms | Phase 4 p50/p95 ms | Calls | Dependent stages | Decoded Supabase bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| /admin | 650/713 | 509/563 | 4 → 4 | 2 → 2 | 8298 → 8298 |
| /admin/people | 519/681 | 490/567 | 2 → 2 | 2 → 2 | 4471 → 4471 |
| /admin/templates | 463/586 | 457/567 | 2 → 2 | 2 → 2 | 513 → 513 |
| /admin/meetings | 485/603 | 465/636 | 2 → 2 | 2 → 2 | 250 → 250 |
| /admin/messages | 835/959 | 720/809 | 6 → 6 | 3 → 3 | 79150 → 79150 |
| /portal | 581/708 | 492/720 | 5 → 5 | 2 → 2 | 11520 → 9848 |
| /portal/tasks | 590/712 | 527/614 | 2 → 2 | 2 → 2 | 7242 → 5570 |
| /portal/tasks/:id | 762/873 | 465/670 | 5 → 4 | 3 → 2 | 3946 → 3663 |
| /portal/messages | 1116/1272 | 761/981 | 7 → 7 | 4 → 3 | 53244 → 51572 |
| /portal/meetings | 518/622 | 491/599 | 3 → 3 | 2 → 2 | 4676 → 4676 |

Latency moved on unchanged control routes too, notably admin dashboard. Therefore observed p50 reductions are not entirely attributable to code. The causal structural improvements are task calls 5→4/stages 3→2, client Messages stages 4→3, and 1,672 bytes removed from each client task-list acquisition. Request count was not reduced on other screens.

## Application changes

1. Cold task detail combines the full task projection with the existing explicit assignee, disabled-client, visible, non-draft and non-archived predicates. It still requires the authorized project and canClientAccessTask before returning data. A cold denial returns no screen. Warm navigation retains its lightweight getAuthorizedClientTask call before exposing cached content.
2. Client inventory starts projects, tasks, unread receipts and both bounded recent-activity reads concurrently after role resolution. Empty inner embeds apply the same viewer/project/client/task filters in PostgREST without first transferring ID lists. The user's session and existing RLS authorize every read. Final conversations are still built only from authorized project/task lists.
3. Client task-list filtering no longer returns otherwise-unused assignee auth UUID/status columns. DTO shape and filters are unchanged. This uses documented [PostgREST empty embeds](https://docs.postgrest.org/en/v13/references/api/resource_embedding.html#empty-embed); live Frankfurt returned 200 with the expected task data.
4. Client inventory now surfaces an activity-query error rather than silently presenting empty previews after a failed read.

The screen-level contracts already existed in lib/screen-data.ts and /api/data/[role]/[screen]. They were reused; no second BFF layer or new cache was added. The existing request-ID fetch bridge already deduplicated bootstrap across rendering contexts; no competing dedup mechanism was introduced.

## Authorization and preservation

Live authenticated API checks returned home/tasks/own task 200, foreign task 404, and client→admin dashboard 403. Existing auth/bootstrap checks, response-bound cookies and RLS were not changed. Cache keys, Realtime ownership, read-state logic, message history query functions, newest-50 pagination, 500-message retention, templates and scheduling remain unchanged. Cold task/history reads run concurrently under RLS; no unauthorized content is returned merely because a speculative read completed.

The Messages default history still follows inventory because the selected authorized thread is determined by inventory. Fetching an arbitrary default or every conversation in advance would add work or change behavior. Explicit-thread speculative fetching was not added. Admin inventory already had parallel reads.

## Aggregation candidates and decision

- Existing get_portal_bootstrap remains a bounded shell/security/unread contract; extending it with every screen's data would penalize unrelated routes. Its old unwired comment is stale; runtime and live definition prove it is active.
- Client Messages metadata remains a potential future narrow RPC: five parallel inventory calls could become one, taking total document calls from seven to three (shell, inventory, selected history). It would chiefly reduce backend request overhead and metadata payload, not eliminate the now-parallel inventory network stage. Exact unread semantics and bounded preview behavior require a separate SQL contract/security review. No migration is necessary for the accepted application changes, so no speculative function was created or applied.
- Home (five calls, two stages) and dashboard (four calls, two stages) are naturally aggregatable but their business reads already overlap; do not promise a multi-RTT latency saving from replacing that parallel stage with one RPC. Benchmark beside Frankfurt before adding that database maintenance burden.
- People is already aggregated; small templates/tasks/meeting screens need one business query after shell authorization. No RPC per route is warranted by this evidence.

## Evidence and checks

work/phase8-phase4-requests.json, work/phase8-phase4-trace.jsonl and work/phase8-phase4-summary.json record the measured runs and waterfalls. Initial application suite passed 289 tests; one further payload/filter regression was added for final acceptance. Typecheck/lint and Frankfurt build passed. Final suite/build/browser results are in the Phase 9 final report.

## Post-optimization observed waterfalls

### /admin

- rpc/get_portal_bootstrap: 12–211 ms; 248 decoded bytes
- projects: 234–446 ms; 5405 decoded bytes
- clients: 234–447 ms; 2643 decoded bytes
- meetings: 235–422 ms; 2 decoded bytes

### /admin/people

- rpc/get_portal_bootstrap: 14–220 ms; 248 decoded bytes
- rpc/get_admin_people: 245–438 ms; 4223 decoded bytes

### /admin/templates

- rpc/get_portal_bootstrap: 11–195 ms; 248 decoded bytes
- templates: 207–422 ms; 265 decoded bytes

### /admin/meetings

- rpc/get_portal_bootstrap: 11–209 ms; 248 decoded bytes
- meetings: 238–435 ms; 2 decoded bytes

### /admin/messages

- rpc/get_portal_bootstrap: 12–205 ms; 248 decoded bytes
- project_messages: 227–444 ms; 11124 decoded bytes
- task_messages: 227–461 ms; 50304 decoded bytes
- message_read_receipts: 229–425 ms; 2 decoded bytes
- projects: 229–437 ms; 5405 decoded bytes
- project_messages: 463–669 ms; 12067 decoded bytes

### /portal

- rpc/get_portal_bootstrap: 14–211 ms; 317 decoded bytes
- projects: 240–451 ms; 2009 decoded bytes
- notifications: 240–420 ms; 1507 decoded bytes
- meetings: 241–452 ms; 762 decoded bytes
- project_tasks: 242–441 ms; 5253 decoded bytes

### /portal/tasks

- rpc/get_portal_bootstrap: 6–206 ms; 317 decoded bytes
- project_tasks: 228–430 ms; 5253 decoded bytes

### /portal/tasks/:id

- rpc/get_portal_bootstrap: 11–226 ms; 317 decoded bytes
- project_tasks: 244–446 ms; 797 decoded bytes
- task_messages: 245–425 ms; 540 decoded bytes
- projects: 245–437 ms; 2009 decoded bytes

### /portal/messages

- rpc/get_portal_bootstrap: 8–208 ms; 317 decoded bytes
- message_read_receipts: 228–403 ms; 2 decoded bytes
- project_messages: 229–446 ms; 7753 decoded bytes
- task_messages: 229–479 ms; 25434 decoded bytes
- projects: 230–445 ms; 2009 decoded bytes
- project_tasks: 230–538 ms; 5253 decoded bytes
- project_messages: 539–736 ms; 10804 decoded bytes

### /portal/meetings

- rpc/get_portal_bootstrap: 21–229 ms; 317 decoded bytes
- meetings: 250–440 ms; 2350 decoded bytes
- projects: 251–456 ms; 2009 decoded bytes
