# Leadsedge Portal — Phase 3.2 Client Validation and Seoul Baseline

Captured 2026-09-03 against the linked AWS Seoul (`ap-northeast-2`) Supabase project from the local production Vinext server at `http://127.0.0.1:3000`. Route distributions use 50 full-response samples per route with an ordinary authenticated browser session. No browser cookie was fabricated. Temporary magic links were generated only for the existing disposable test account and were consumed through the application's normal `/auth/confirm` flow; token files were removed immediately.

## 1. Test-client setup

The existing fixture `test 3` was used. Its client record was active, linked to an Auth user, associated through `project_clients` with three test projects, assigned ten non-archived tasks, and able to read twelve project messages. It had no meetings. The identifiers used by the repeatable security scripts are test-fixture IDs, not credentials; email addresses and magic-link tokens are intentionally omitted.

The browser began as the existing administrator, switched to this client through the supported magic-link flow, and later switched back to the administrator through the same flow. No role metadata or browser cookies were manually created.

## 2. Bootstrap response

The live authenticated client RPC returned exactly these top-level keys: `authorization`, `shell`, `unread`, and `viewer`. `viewer` contained only `displayName`, `id`, and `role`; role was `client`. `authorization.disabled` was `false`, the primary project belonged to the fixture's membership set, and no admin, contact-email, token, or settings field was present.

Identity is not an RPC argument. `get_portal_bootstrap()` derives it from `auth.uid()`, is `SECURITY INVOKER`, has an explicit `search_path`, and remains executable only by `authenticated`. Live anonymous execution failed with PostgreSQL `42501`; an invalid bearer token failed with `PGRST301`.

One integration defect was found and corrected: `/portal` still called the legacy unread-count RPC even though the same request's bootstrap already supplied fresh counts. The page now consumes `bootstrap.unread`; tracing confirms one bootstrap and no separate unread RPC.

## 3. Client security

Live RLS/API checks with the authenticated test client produced:

| Attempt | Result |
| --- | --- |
| Own project | 1 visible row |
| Own assigned task | 1 visible row |
| Another client's project | 0 rows |
| Another client's `project_clients` link | 0 rows |
| Tasks under another client's project | 0 rows |
| Messages under another client's project | 0 rows; application API returned 404 |
| Meetings under another client's project | 0 rows |
| `get_admin_people()` | rejected |
| Client navigation to `/admin` | redirected to `/portal` |
| Manipulated/nonexistent task route | rendered the access-safe unavailable page |

This validates direct database isolation as well as route-level role handling. The client bootstrap exposed only one project selected from the caller's own memberships and no information from the other fixture.

## 4. Disabled-client test

The clearly disposable `test 3` fixture began as `active`. Its status alone was temporarily changed to `disabled`; a fresh protected `/portal` request redirected to `/auth/sign-in?next=/portal` and returned no portal data. The status was immediately restored to `active`, verified with a live read, and the same legitimate session could access `/portal` again. No other record was modified.

## 5. Task authorization

Real-client tracing confirms the intended task-detail shape:

```text
bootstrap
  -> task | task messages
  -> client projects | authorized task
```

There are five logical Supabase operations in two remote stages after local claim verification: bootstrap, task, task messages, project list, and the hardened authorized-task lookup. `can_access_task()`/RLS remains authoritative. An own assigned task rendered successfully; manipulated and cross-project identifiers did not reveal task data.

## 6. Messages

The fixture's twelve available project messages rendered once each in chronological order from Aug 28 through Sep 1. There were no duplicates or visible gaps, and another client's project-history API returned 404. The retained implementation requests newest-first with a limit of 50, then presents the page chronologically and uses the existing cursor for earlier pages.

This fixture has fewer than 50 messages, so a live `Load Earlier Messages` button and a second live cursor page could not be exercised without manufacturing business data. The bounded initial query, cursor behavior, and de-duplication remain covered by the repository tests; this limitation is not presented as a live >50-message proof.

## 7. Client benchmarks

| Route | p50 | p75 | p90 | p95 | Mean | Std dev | Max | Supabase calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/portal` (final, duplicate unread removed) | 635.2 ms | 713.1 ms | 873.3 ms | 920.3 ms | 694.4 ms | 162.4 ms | 1,535.9 ms | 5 |
| `/portal/tasks/:id` | 874.8 ms | 944.3 ms | 983.0 ms | 999.5 ms | 899.0 ms | 86.1 ms | 1,248.0 ms | 5 |
| `/portal/messages` | 916.0 ms | 969.2 ms | 1,014.3 ms | 1,030.6 ms | 928.1 ms | 64.9 ms | 1,128.2 ms | 3 |
| `/portal/meetings` | 624.8 ms | 662.6 ms | 706.2 ms | 715.3 ms | 633.2 ms | 50.8 ms | 828.8 ms | 3 |

The pre-fix `/portal` matched run was p50 625.6 ms, p95 808.2 ms, and mean 641.0 ms. The final run did not improve wall-clock percentiles because the removed unread call had run alongside slower page reads and Seoul network variance increased; it did reduce every request from six remote operations to the intended five without changing output.

Per-route operation shapes:

- `/portal`: bootstrap, projects, notifications, next meeting, visible tasks. Zero profile reads and zero separate unread RPCs.
- task detail: bootstrap, task, task messages, projects, authorized-task lookup. Zero profile/unread reads.
- messages: bootstrap, projects, then newest 50 project messages. Zero profile/unread reads.
- meetings: bootstrap, active projects, meetings. Initial render performs no slots/Google request.

## 8. Admin + client final Seoul baseline

| Role | Route | p50 | p75 | p90 | p95 | Mean | Supabase calls |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Admin | `/admin` | 586.1 ms | 623.2 ms | 688.4 ms | 744.8 ms | 609.9 ms | 4 |
| Admin | `/admin/messages` | 588.4 ms | 625.2 ms | 686.7 ms | 747.2 ms | 616.5 ms | 5 |
| Admin | `/admin/meetings` | 585.7 ms | 614.6 ms | 655.8 ms | 839.6 ms | 590.7 ms | 2 |
| Client | `/portal` | 635.2 ms | 713.1 ms | 873.3 ms | 920.3 ms | 694.4 ms | 5 |
| Client | `/portal/tasks/:id` | 874.8 ms | 944.3 ms | 983.0 ms | 999.5 ms | 899.0 ms | 5 |
| Client | `/portal/messages` | 916.0 ms | 969.2 ms | 1,014.3 ms | 1,030.6 ms | 928.1 ms | 3 |
| Client | `/portal/meetings` | 624.8 ms | 662.6 ms | 706.2 ms | 715.3 ms | 633.2 ms | 3 |

The admin routes were remeasured with the same 50-sample browser harness used for clients. Their standard deviation/max values were: dashboard 125.9/1,382.2 ms, messages 105.0/1,202.6 ms, and meetings 83.2/921.2 ms.

## 9. Meetings correctness

The live meetings page loaded and displayed the deliberate `Choose a date to see available times` state. Instrumented initial-render traces contained bootstrap, projects, and meetings reads only—no slots endpoint, Google FreeBusy call, or Google event call. The scheduler fetches cached availability only after a non-empty date is selected. Booking still calls fresh `getAvailableSlots()` and requires the chosen timestamp to remain present before the transactional `book_client_meeting` RPC, preserving conflict protection.

## 10. Session-transition security

Admin → client displayed the `test 3` client shell and redirected `/admin` back to `/portal`; no administrator shell content was visible. Client → admin displayed Cody Askin's Administrator shell and did not contain the prior client welcome content. Each shell's unread badges came from a newly authenticated identity-scoped bootstrap. No global client-data cache exists, and no stale identity data was observed.

## 11. Final verdict

**FULLY VALIDATED — KEEP for admin and client.**

The bootstrap passed live client identity, minimal-payload, role-routing, disabled-account, cross-project, cross-client, anonymous, invalid-token, and session-transition checks. The one duplicate client Home unread read was removed. No security or correctness reason to revert was found.

## 12. Next infrastructure step

The migration chain describes the application's tables, constraints, functions/RPCs, indexes, triggers, RLS policies, and Realtime publication additions from the initial schema through the bootstrap. It is sufficiently complete to reproduce a clean staging backend, subject to a dry-run migration on the new empty project and explicit verification that extensions (`pgcrypto`, `pg_trgm`) and Realtime publication statements apply cleanly. Auth users and test fixtures are environment data and must be created separately; Google, Resend, redirect URLs, and cron secrets are environment configuration, not migrations.

No U.S. project or paid resource was created. The next step is a clean U.S. staging Supabase project plus a colocated application runtime, apply the migration chain in order, establish isolated test identities/data, and repeat this exact 50-sample route/RPC suite. Current traces show local claim checks around a few milliseconds while ordinary Seoul Data API calls are commonly about 200–350 ms with occasional much larger tails; geography/transport is now the appropriate variable to test.

## Direct answers

1. `/portal`: p50 **635.2 ms**, p95 **920.3 ms**.
2. `/portal/tasks/:id`: p50 **874.8 ms**, p95 **999.5 ms**.
3. `/portal/messages`: p50 **916.0 ms**, p95 **1,030.6 ms**.
4. Supabase remote operations: `/portal` **5**, task detail **5**, messages **3**, meetings **3**; admin dashboard **4**, admin messages **5**, admin meetings **2**.
5. Yes. The bootstrap derives identity from `auth.uid()`, returned an owned project only, and direct cross-client reads returned zero rows/404.
6. No. The live disabled fixture was redirected to sign-in and received no protected portal render; access returned only after restoration.
7. No. Both admin → client and client → admin transitions rendered only the new identity's shell and data.
8. Yes. The bootstrap is safe to classify **KEEP** for both roles.
9. **No — proceed to infrastructure testing.** No remaining measured serial stage can be removed safely by a code-only change without changing multi-project semantics or introducing one of the expressly deferred data-aggregation/cache designs.
