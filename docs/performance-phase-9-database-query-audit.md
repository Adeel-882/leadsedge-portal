# Phase 9 — PostgreSQL query audit

Read-only Frankfurt analysis performed only after the Phase 4 before/after route measurements were recorded. No index, function, policy, table, publication or configuration mutation was applied.

## Method and boundaries

Existing diagnostic pooler connection, begin read only / rollback, statement timeout, fixed Frankfurt project/region guards. This is not a new application connection architecture: production Node still uses supabase-js over the Data API. Authenticated RLS plans used SET LOCAL ROLE authenticated and existing staging account claims; no Auth users or sessions were changed by SQL. The unread body was also explained as its existing function owner, matching its SECURITY DEFINER execution context. No returned message content, credentials or cookies were saved.

Catalog evidence: work/phase9-catalog.txt. Cumulative normalized statistics: work/phase9-statistics.txt and work/phase9-current.txt. Representative plans: work/phase9-plans.sql/.txt and work/phase9-actual-plans.sql/.txt. Each plan case ran ten times. Full generated SQL with representative parameter values remains local in work/.

pg_stat_statements 1.11 is installed. hypopg and index_advisor are not installed; neither was installed for this task. Query statistics were not reset. Their counters include previous application versions and benchmark phases, and are not a Phase 4-only workload profile. Statement p95 cannot be derived from mean/stddev/max; it is marked unavailable. EXPLAIN sample p95 below is the maximum of ten runs, not a production percentile.

## Ranked actual Data API statements

Sorted by cumulative execution time; query IDs disambiguate older and newer projections of the same resource. All listed normalized queries returned one PostgREST JSON envelope per call, not one business record. Current client task inventory is separately identified below because its 21-call sample is much newer than this historical ranking.

| Query / query ID | Calls | Total ms | Mean ms | Statement p95 | SQL result rows/call | Shared reads |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Shell bootstrap (-4707379548244254180) | 5051 | 65923.4 | 13.05 | unavailable | 1.0 | 0 |
| task_messages (-7495736926960255942) | 374 | 10465.6 | 27.98 | unavailable | 1.0 | 0 |
| project_messages (-6578005900359154431) | 374 | 8401.0 | 22.46 | unavailable | 1.0 | 0 |
| projects (-1163014777674264199) | 910 | 6837.4 | 7.51 | unavailable | 1.0 | 0 |
| task_messages (-1708920020943321973) | 407 | 6384.0 | 15.69 | unavailable | 1.0 | 0 |
| projects (-8006139472457524691) | 712 | 6199.0 | 8.71 | unavailable | 1.0 | 0 |
| project_tasks (8159697475346726377) | 453 | 5004.2 | 11.05 | unavailable | 1.0 | 0 |
| task_messages (-6059296469164863420) | 203 | 3921.5 | 19.32 | unavailable | 1.0 | 0 |
| Unread counts (-5933330694578564483) | 664 | 3913.7 | 5.89 | unavailable | 1.0 | 0 |
| projects (-7427669284881978571) | 263 | 2559.7 | 9.73 | unavailable | 1.0 | 0 |
| task_messages (7122589285455016898) | 78 | 2302.8 | 29.52 | unavailable | 1.0 | 0 |
| project_messages (-8731279577998941683) | 78 | 1713.7 | 21.97 | unavailable | 1.0 | 0 |
| task_messages (841543038919907365) | 65 | 1495.8 | 23.01 | unavailable | 1.0 | 0 |
| projects (-4099708684683443123) | 165 | 1338.9 | 8.11 | unavailable | 1.0 | 0 |
| People RPC (8260573554420547905) | 93 | 1190.6 | 12.80 | unavailable | 1.0 | 0 |
| project_messages (-8832887534495608217) | 348 | 1161.4 | 3.34 | unavailable | 1.0 | 0 |

The current client task-inventory statement, ID -258184717485508538, had 21 calls, 829.19 ms total and 39.49 ms mean after the Phase 4 run. This is more relevant than a historical message projection with hundreds of calls. All top captured statements had zero shared disk reads and zero temporary blocks written.

## EXPLAIN ANALYZE, BUFFERS

The unprefixed application-style SELECT cases reproduce filters, joins and RLS but not all PostgREST JSON/lateral wrappers. Cases beginning actual_ use the recorded generated PostgREST query shape with representative filter/limit/response parameters. Planning and execution timings are kept separately in the JSON summary. Scanned rows is the sum of scan-node rows plus removed-by-filter rows times loops, and can count the same logical record more than once; internal opaque SQL-function scans are not visible in that metric. Zero visible scans for a function node does NOT mean no underlying work.

| Case | Exec p50 ms | Sample p95 ms | Root rows | Scan visits | Buffer hits/reads | Used indexes visible in plan |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| client_bootstrap | 3.379 | 45.688 | 1 | 0 | 67/0 | function/seq scan; see text |
| client_unread | 0.479 | 0.524 | 1 | 0 | 5/0 | function/seq scan; see text |
| client_unread_counts | 0.707 | 1.018 | 1 | 1 | 6/0 | function/seq scan; see text |
| client_project_newest | 6.563 | 7.286 | 44 | 88 | 443/0 | project_messages_user_conversation_idx, users_pkey |
| client_task_newest | 15.768 | 16.965 | 50 | 124 | 971/0 | users_pkey |
| client_task_list | 6.704 | 8.662 | 19 | 62 | 420/0 | project_tasks_visible_idx, clients_pkey, projects_pkey |
| client_task_detail | 0.715 | 1.231 | 1 | 25 | 16/0 | project_tasks_visible_idx, clients_pkey |
| client_project_inventory | 6.684 | 6.886 | 45 | 135 | 452/0 | project_messages_user_conversation_idx, users_pkey |
| client_meetings | 0.561 | 1.763 | 3 | 20 | 41/0 | meetings_client_start_idx, clients_pkey, project_clients_pkey |
| admin_bootstrap | 2.460 | 4.501 | 1 | 0 | 46/0 | function/seq scan; see text |
| admin_unread_counts | 0.684 | 0.737 | 1 | 1 | 6/0 | function/seq scan; see text |
| admin_project_newest | 6.131 | 6.490 | 44 | 88 | 267/0 | project_messages_user_conversation_idx, users_pkey |
| admin_task_newest | 14.625 | 14.941 | 50 | 126 | 251/0 | users_pkey |
| admin_admin_projects | 2.261 | 2.467 | 10 | 40 | 109/0 | project_tasks_visible_idx |
| admin_admin_people | 1.133 | 45.227 | 8 | 8 | 14/0 | function/seq scan; see text |
| admin_templates | 0.377 | 0.789 | 1 | 3 | 7/0 | template_tasks_template_order_idx |
| admin_feedback_due | 0.018 | 5.595 | 0 | 0 | 1/0 | project_tasks_feedback_schedule_idx |
| client_unread_body_owner | 0.062 | 0.095 | 1 | 0 | 1/0 | message_read_receipts_unread_idx, project_messages_pkey |
| actual_task_inventory | 20.949 | 23.915 | 1 | 227 | 1076/0 | project_tasks_visible_idx, clients_auth_user_id_key, users_pkey |
| actual_task_newest | 16.410 | 20.781 | 1 | 124 | 971/0 | users_pkey |
| actual_task_earlier | 7.730 | 8.080 | 1 | 50 | 411/0 | task_messages_user_conversation_idx, users_pkey |

Most planning medians were under 1 ms. Initial function compilation/cache warm-up produced a roughly 45 ms first sample for bootstrap/people; subsequent medians were 3.379/1.133 ms. No measured plan wrote temporary blocks. Sorts were small in-memory sorts; no external spill was found.

### Avoiding an incorrect diagnosis

A flattened diagnostic task-inventory join took **297.369 ms median**, visited 2,628 scan rows and 19,974 cached buffers. That flattened SQL permitted a different join order and repeated policy work; it is not the actual application request. The recorded PostgREST lateral-query shape took **20.949 ms median**, 227 visible scan visits and 1,076 cached buffers, returning a JSON envelope containing the inventory rows. The 297 ms diagnostic is retained as evidence but is explicitly excluded from claimed application cost. No migration was proposed on its basis.

### Messages and keyset pagination

Project newest-page read used project_messages_user_conversation_idx and returned 44 rows at this fixture size. Task newest-page read returned at most 50 out of 124 table rows. PostgreSQL sometimes chose a tiny sequential scan and in-memory sort for that broad fraction of the table despite the existing suitable partial task index. An actual earlier-page cursor obtained from the fixture used task_messages_user_conversation_idx, returned a 50-row page and took 7.730 ms median in the PostgREST-shaped plan. The earlier initial illustrative date returned no rows and is not used as evidence of pagination performance.

Application history queries still use created_at < cursor with LIMIT 50. Generated PostgREST SQL includes OFFSET 0 for API defaults; that is not growing offset pagination. No pagination rewrite or new descending duplicate index is needed: the existing B-tree can scan backwards. Tasks are currently small non-paginated lists; People deliberately retains its bounded 25-row pages and exact total. Revisit task/activity paging under a larger dataset rather than changing UX on a theoretical basis.

### Unread and policy cost

get_unread_message_count remains exact. Its median was 0.479 ms; get_unread_counts 0.707 ms; its expanded body used message_read_receipts_unread_idx and took 0.062 ms. Both tested accounts currently have zero unread messages after the earlier read-state validation. This measures the empty-unread branch, not a high-unread stress test. No synthetic unread data was created to make the benchmark look worse.

Task/message policies call existing is_admin, is_project_member and can_access_task helpers per evaluated row; they explain some cached CPU/buffer work on the task sample. The current task-message policy enforces assignment, membership, enabled client, visible/non-draft task and not archived. Potential policy/function restructuring would require explicit approval and a larger, representative load test. No RLS semantics, grants or execution privileges changed.

Live authenticated SQL checks: own task count 1; foreign task 0; foreign task messages 0; foreign project 0. The existing disabled fixture returned null bootstrap and zero projects, tasks and task messages. Separate signed-session HTTP checks also denied the foreign task (404) and client access to admin data (403). No service-role measurement was substituted for these authorization checks.

## Existing index inventory

- clients: `clients_pkey` — `btree (id)`
- clients: `clients_auth_user_id_key` — `btree (auth_user_id)`
- clients: `clients_email_key` — `btree (email)`
- clients: `clients_full_name_trgm_idx` — `gin (full_name gin_trgm_ops)`
- clients: `clients_email_trgm_idx` — `gin (email gin_trgm_ops)`
- clients: `clients_company_trgm_idx` — `gin (company gin_trgm_ops)`
- meetings: `meetings_pkey` — `btree (id)`
- meetings: `meetings_owner_start_idx` — `btree (owner_id, start_at) WHERE (status = 'scheduled'::text)`
- meetings: `meetings_client_start_idx` — `btree (client_id, start_at)`
- meetings: `meetings_project_start_idx` — `btree (project_id, start_at)`
- message_read_receipts: `message_read_receipts_pkey` — `btree (id)`
- message_read_receipts: `message_read_receipts_project_unique` — `btree (recipient_id, project_message_id) WHERE (project_message_id IS NOT NULL)`
- message_read_receipts: `message_read_receipts_task_unique` — `btree (recipient_id, task_message_id) WHERE (task_message_id IS NOT NULL)`
- message_read_receipts: `message_read_receipts_unread_idx` — `btree (recipient_id, read_at, created_at DESC)`
- notifications: `notifications_pkey` — `btree (id)`
- notifications: `notifications_user_unread_idx` — `btree (user_id, read_at, created_at DESC)`
- notifications: `notifications_resource_idx` — `btree (user_id, project_id, task_id, read_at, created_at DESC)`
- project_clients: `project_clients_pkey` — `btree (project_id, client_id)`
- project_clients: `project_clients_one_primary_idx` — `btree (project_id) WHERE is_primary`
- project_clients: `project_clients_client_idx` — `btree (client_id)`
- project_messages: `project_messages_pkey` — `btree (id)`
- project_messages: `project_messages_thread_created_idx` — `btree (thread_id, created_at)`
- project_messages: `project_messages_user_conversation_idx` — `btree (project_id, created_at) WHERE (message_type = 'user'::text)`
- project_tasks: `project_tasks_pkey` — `btree (id)`
- project_tasks: `project_tasks_project_status_idx` — `btree (project_id, status)`
- project_tasks: `project_tasks_assignee_idx` — `btree (assignee_id)`
- project_tasks: `project_tasks_visible_idx` — `btree (project_id, created_at) WHERE (archived_at IS NULL)`
- project_tasks: `project_tasks_feedback_schedule_idx` — `btree (feedback_scheduled_for) WHERE ((archived_at IS NULL) AND (feedback_state = 'waiting'::text))`
- projects: `projects_pkey` — `btree (id)`
- projects: `projects_owner_idx` — `btree (owner_id)`
- projects: `projects_status_idx` — `btree (status)`
- projects: `projects_project_name_trgm_idx` — `gin (project_name gin_trgm_ops)`
- task_messages: `task_messages_pkey` — `btree (id)`
- task_messages: `task_messages_thread_created_idx` — `btree (thread_id, created_at)`
- task_messages: `task_messages_user_conversation_idx` — `btree (task_id, created_at) WHERE (message_type = 'user'::text)`
- template_tasks: `template_tasks_pkey` — `btree (id)`
- template_tasks: `template_tasks_template_order_idx` — `btree (template_id, sort_order)`
- templates: `templates_pkey` — `btree (id)`
- users: `users_pkey` — `btree (id)`
- users: `users_email_key` — `btree (email)`

This covers project/client/task/user/recipient filters, created-time ordering, status, archived predicates, unread state and feedback due time. updated_at is used for the one-row template list; another index there is not justified. Current catalog estimates are only about 25 tasks, 45 project messages, 124 task messages, 169 receipts and one template, so these results cannot establish large-scale selectivity behavior. Exact business row counts in plan output may differ from statistics estimates.

## Recommendations and decisions

- **Indexes proposed/applied: none.** Existing indexes satisfy the important access patterns; another overlapping message or unread index would add write/storage maintenance without removing the dominant remote wait. No index was removed either.
- **Functions/RLS rewrites applied: none.** The shell bootstrap and People RPC already aggregate appropriately; preserve their existing security contracts.
- **Phase 5 application query rewrites: none additional.** Phase 4 already moved inventory authorization filtering into parallel database reads and removed an unnecessary task projection/round trip. Actual SQL evidence does not justify further semantic risk for a small residual saving.
- Dashboard task counters are currently calculated from narrow related status rows; exact counts are needed by the existing product. People uses one window total rather than independent count HTTP calls; unread is one exact RPC. No observed remote N+1 remains in the ten audited screen loaders. Nested SQL lateral scans are not Node→Supabase N+1 requests.
- Meetings measured around 0.561 ms in the representative client plan and remain cached without Realtime. More meeting tuning is not justified.
- Task detail uses direct task/client filters; feedback-due lookup uses project_tasks_feedback_schedule_idx and was empty in this fixture. Scheduling from completed_at was not touched.
- Browser-screen Data API payloads are 250–79,150 decoded bytes in these samples. Reducing unused task identity columns removed 1,672 bytes. Compressed wire bytes and pure JSON serialization CPU were not isolated; residual route time includes rendering/instrumentation, so it must not be labeled serialization cost. There is no evidence to prioritize compression over the measured remote stages.

## Remaining bottleneck

Local-to-Frankfurt response waits remain hundreds of milliseconds across two or three dependent stages. Exact per-route SQL contribution is not available from these separate plan samples: do not sum them as if collected inside each HTTP request. The actual query plans show mostly sub-millisecond to tens-of-milliseconds execution, while route traces show the much larger remote wait intervals. The highest-leverage next benchmark is the same normal Node build near Frankfurt, using production-like data volumes. A narrow Messages metadata RPC remains a reviewed future candidate, not an applied migration or a claim of additional RTT-stage elimination.
