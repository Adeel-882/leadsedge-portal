# LeadsEdge Portal — Phase 4B1 Frankfurt Free-Plan Test

Status date: 2026-09-08  
Workstation region: Pakistan  
Application benchmark origin: `http://127.0.0.1:3000`  
Frankfurt Supabase ref: `tfrljxzknnhkynobvetg`

## Executive status

The Frankfurt Free project is healthy in `eu-central-1`, the repository schema was reproduced, synthetic data and staging Auth users were created, and the full live security suite passes. PostgreSQL remains fast; approximately 94–100% of primitive request p50 is outside SQL execution.

The isolated Cloudflare Worker experiment is now complete. `leadsedge-frankfurt-performance` is live only at `https://leadsedge-frankfurt-performance.broadigo-cloud.workers.dev`, uses targeted placement at `aws:eu-central-1`, has no secrets or bindings, has preview URLs disabled, and has no custom domain or route. Successful colocated renders materially improve the multi-round-trip client task and messages pages, proving that regional application/database proximity can help.

The Free Worker is not stable enough to host this Vinext SSR application. A 50-sample Pakistan run returned 21 HTTP 503 responses on `/portal/messages` (42%). A live Cloudflare trace classified the failure as `exceededCpu` at the Free plan's 10 ms CPU ceiling. The same route used 113 ms CPU on a successful invocation. Two independent public U.S. synthetic runs produced 11 HTTP 503 responses across 50 requests (22%). No result was discarded or replaced with a best-case run.

The Phase 4B1 decision is therefore: **regional co-location is validated, but the current full Vinext SSR bundle is not viable on Cloudflare Workers Free**. No paid resource, billing change, production DNS change, or production integration change was made.

## 1. Seoul backup status

The Seoul project was backed up successfully before it was paused. The validated backup is stored outside source control at:

`C:\Leadsedge Portal\work\phase4b1-seoul-backup\20260904T164658Z`

The ignored directory contains:

- a complete custom-format application archive;
- a data/history SQL export;
- an Auth data archive;
- a schema/history SQL export;
- roles without password material;
- archive contents and a SHA-256 manifest.

`pg_restore --list` validated 352 archive entries. The archive includes application tables/data, functions, triggers, policies, indexes, grants, and migration history. The reproducible backup script is `scripts/backup-seoul.ps1`.

## 2. Project and Free-plan state

The final read-only Supabase CLI inventory showed:

| Project | Ref | Region | Status | Change made |
| --- | --- | --- | --- | --- |
| Tokyo | `hwzbqmvovbnpuaddzbha` | `ap-northeast-1` | `ACTIVE_HEALTHY` | None |
| LeadsedgePortal Seoul | `llmmtdzlurunphdfrqlg` | `ap-northeast-2` | `INACTIVE` | Paused only |
| LeadsEdge Frankfurt Test | `tfrljxzknnhkynobvetg` | `eu-central-1` | `ACTIVE_HEALTHY` | Created on Free |

Pausing Seoul released the Free active-project slot. Seoul remains preserved as rollback and was not deleted. Tokyo was not linked, paused, reconfigured, or otherwise modified. No Supabase or Cloudflare upgrade was purchased.

## 3. Frankfurt secrets and Auth configuration

Frankfurt's database password, anon key, service-role key, staging-only cron secret, and staging-only calendar-token encryption key exist only in the ignored `.env.frankfurt.local`. Seoul's `.env.local` was not changed or copied.

The Frankfurt Auth site URL is `http://127.0.0.1:3000`; the staging redirect allow-list contains only the required `127.0.0.1` and `localhost` local patterns. SMTP is not configured and production OAuth providers were not enabled.

## 4. Migration and catalog parity

The original 11 repository migrations were applied in exact order. A twelfth, explicitly approved Frankfurt-only additive migration was then applied:

`202609040001_harden_disabled_client_membership.sql`

The live `clients.status` enum has exactly `invited`, `active`, and `disabled`. Only `active` grants portal access, so the migration replaced only the client-facing `project_clients` SELECT policy with a positive allow check:

- administrators remain allowed through `public.is_admin()`;
- clients must match `client.auth_user_id = auth.uid()`;
- the matching client must have `client.status = 'active'`.

The migration does not alter tables, columns, functions, grants, triggers, indexes, fixtures, or any other policy. A dry run showed only this migration, with no seeds or roles. Live application-row counts were identical immediately before and after it.

Current Frankfurt catalog summary:

| Item | Live count/state |
| --- | ---: |
| Public tables | 24 |
| RLS-enabled public tables | 24 |
| RLS policies | 38 |
| Public indexes, including constraints | 62 |
| Public non-internal triggers | 13 |
| Realtime publication tables | 4 |
| Migration ledger entries | 12 |
| Required extensions | `pgcrypto`, `pg_trgm`, `pg_cron` |
| Feedback automation cron | Active, every minute |

The base 11-migration schema matches the recorded Seoul schema. The twelfth security fix is intentionally present only on Frankfurt until a separate Seoul approval.

## 5. Synthetic fixture inventory

All records are synthetic and use `@performance.example.com` identities.

| Fixture | Count |
| --- | ---: |
| Auth/application users | 9 |
| Clients | 8 |
| Projects | 10 |
| Project memberships | 10 |
| Tasks | 20 |
| Task messages | 120 |
| Project messages | 40 |
| Notifications | 176 |
| Meetings | 9 |
| Project activity rows | 20 |

There are no calendar connections, Google event IDs, email-outbox rows, or email-delivery rows. No real email or Google Calendar event was produced.

## 6. Live security validation

The security test authenticates through generated staging magic links and supported OTP verification. It does not forge JWTs or browser cookies for authorization decisions.

| Check | Result |
| --- | --- |
| Anonymous bootstrap denied | PASS |
| Anonymous membership read denied | PASS |
| Invalid-token bootstrap denied | PASS |
| Invalid-token membership read denied | PASS |
| Admin People RPC allowed | PASS |
| Admin can read all 10 membership rows | PASS |
| Client cannot call admin People RPC | PASS |
| Active Client A sees own project/membership/task/messages/meeting | PASS |
| Active Client A sees zero Client B protected rows | PASS |
| Active Client B sees own project/membership/task/meeting | PASS |
| Active Client B sees zero Client A protected rows | PASS |
| Disabled client bootstrap denied | PASS |
| Disabled client sees zero project/membership/task/message/meeting rows | PASS |
| Manipulated cross-client IDs disclose no protected records | PASS |

## 7. Functional parity

The production Vinext server was built against Frankfurt without changing `.env.local`, then started as the sole listener on port 3000.

- Admin dashboard, messages, meetings, notifications, People search/pagination, project overview, project tasks, and task detail returned usable pages.
- Client home, task list/detail, messages, meetings, notifications, and account returned usable pages.
- Anonymous admin/client routes redirected to sign-in.
- Admin `/portal` redirected to `/admin`; client `/admin` redirected to `/portal`.
- Admin → client → admin requests did not retain stale role output.
- Logout redirected to sign-in and expired the session cookie.
- The 120-message task conversation paginated as 50, 50, and 20 rows.
- A manipulated cross-client task ID rendered the not-found boundary and exposed no task content. Vinext currently reports HTTP 200 for this rendered not-found boundary; the underlying RLS and authorization reads returned zero rows.

## 8. Pakistan workstation → Frankfurt primitive benchmark

Method: one warm-up followed by 100 retained sequential samples per operation. Application-observed values include workstation networking, TLS/HTTP, Supabase edge/Data API work, edge-to-region transit, and PostgreSQL. PostgreSQL values were measured separately inside the Frankfurt server under the authenticated client's RLS identity, with five warm-ups and 100 retained samples.

| Operation | PostgreSQL p50 | PostgreSQL p95 | Application p50 | Application p95 | p50 outside SQL | Outside-SQL share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Trivial authenticated read | 0.200 ms | 0.228 ms | 224.9 ms | 459.9 ms | 224.7 ms | 99.9% |
| Portal bootstrap RPC | 12.272 ms | 12.533 ms | 253.7 ms | 602.9 ms | 241.4 ms | 95.2% |
| Unread RPC | 10.575 ms | 10.828 ms | 233.9 ms | 349.6 ms | 223.3 ms | 95.5% |
| Task query | 0.493 ms | 0.584 ms | 235.1 ms | 536.7 ms | 234.6 ms | 99.8% |
| 50-message query | 14.076 ms | 14.291 ms | 245.7 ms | 516.5 ms | 231.6 ms | 94.3% |

The representative earlier Seoul unread measurement was approximately 306 ms median with 1.012 ms PostgreSQL mean. Frankfurt's unread p50 is 233.9 ms, an approximately 72 ms primitive-round-trip improvement. That gain does not compound into a full-route win in this local topology because route tail variance and multiple remote operations dominate.

## 9. Pakistan workstation → Frankfurt route benchmark

Method: production build, one production server, `127.0.0.1`, one warm-up plus 100 retained sequential samples per route. No failed status codes were discarded. The complete raw artifact, including all `Server-Timing` headers, is ignored at `work/frankfurt-pakistan-benchmark.json`.

| Route | p50 | p75 | p90 | p95 | Mean | Std dev | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/admin` | 742.8 | 854.1 | 1,030.4 | 1,247.5 | 804.6 | 218.8 | 1,785.5 |
| `/admin/messages` | 809.4 | 1,097.0 | 1,307.2 | 1,464.2 | 904.1 | 274.9 | 1,625.8 |
| `/admin/meetings` | 553.7 | 726.2 | 834.1 | 885.0 | 622.8 | 173.4 | 1,553.8 |
| `/portal` | 782.1 | 1,081.4 | 1,435.5 | 1,588.4 | 925.5 | 369.0 | 2,466.6 |
| `/portal/tasks/:id` | 1,454.1 | 1,700.9 | 2,104.8 | 2,677.3 | 1,567.5 | 567.3 | 4,531.6 |
| `/portal/messages` | 811.8 | 1,007.1 | 1,260.7 | 1,349.5 | 919.1 | 233.9 | 1,766.9 |
| `/portal/meetings` | 596.7 | 812.6 | 987.0 | 1,142.7 | 707.2 | 262.2 | 2,410.3 |

The proxy's `getClaims()` work is not the cause of these totals: proxy p50 was 1.4–2.9 ms by route and p95 was 3.5–9.0 ms. The remaining cost is chiefly page-level Supabase stages plus external path variance.

## 10. Required Seoul versus Frankfurt comparison

Positive “Saved ms” means Frankfurt is faster. Negative values mean regression.

| Route | Seoul p50 | Frankfurt p50 | Saved ms | Improvement % | Seoul p95 | Frankfurt p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/admin` | 586.1 | 742.8 | -156.7 | -26.7% | 744.8 | 1,247.5 |
| `/admin/messages` | 588.4 | 809.4 | -221.0 | -37.6% | 747.2 | 1,464.2 |
| `/admin/meetings` | 585.7 | 553.7 | 32.0 | 5.5% | 839.6 | 885.0 |
| `/portal` | 635.2 | 782.1 | -146.9 | -23.1% | 920.3 | 1,588.4 |
| `/portal/tasks/:id` | 874.8 | 1,454.1 | -579.3 | -66.2% | 999.5 | 2,677.3 |
| `/portal/messages` | 916.0 | 811.8 | 104.2 | 11.4% | 1,030.6 | 1,349.5 |
| `/portal/meetings` | 624.8 | 596.7 | 28.1 | 4.5% | 715.3 | 1,142.7 |

Across these seven route p50s, the arithmetic mean moved from 687.3 ms in the fixed Seoul baseline to 821.5 ms in Frankfurt, a 19.5% regression. This aggregate is descriptive, not a traffic-weighted product score. Frankfurt wins two p50 comparisons modestly, while five regress. Tail latency is worse in all seven comparisons.

## 11. Cloudflare isolated staging result

Configuration: `wrangler.frankfurt.jsonc`  
Worker: `leadsedge-frankfurt-performance`  
Staging URL: `https://leadsedge-frankfurt-performance.broadigo-cloud.workers.dev`  
Validated version: `03bd3e99-e5d5-4edc-bcc1-aaf0004850eb`

### 11.1 Isolation and deployment verification

- Wrangler version metadata reports targeted placement at `aws:eu-central-1` (`placement_mode: targeted`).
- Live responses from Pakistan and U.S. probes report `Cf-Placement: remote-FRA`.
- Version metadata reports `bindings: []`; `wrangler secret list` returns `[]`; the dashboard reports `No connected bindings`.
- Production Workers.dev URL is enabled; preview URLs are explicitly disabled.
- The dashboard reports no custom domains or routes.
- The previous default `adeelahmed.workers.dev` hostname no longer resolves.
- A deployed Vinext client chunk returned HTTP 200 with `Cache-Control: public, max-age=31536000, immutable`.
- The public sign-in route rendered successfully and authenticated admin/client read routes passed the functional suite.
- No service-role key, database password, cron secret, encryption key, Resend key, Google secret/token, Seoul credential, or production secret was uploaded.
- No mutation/integration binding was configured. Production DNS, production Workers, Seoul, and Tokyo were untouched.

### 11.2 Authenticated Pakistan → Worker → Frankfurt benchmark

Method: one warm-up and 50 retained sequential samples per route. Status failures were counted, not retried or removed. Latency percentiles below use successful responses; the complete ignored artifact is `work/frankfurt-worker-pakistan-benchmark.json`.

| Route | Success p50 | Success p95 | Success mean | HTTP failures |
| --- | ---: | ---: | ---: | ---: |
| `/admin` | 808.6 ms | 1,097.5 ms | 835.8 ms | 0 / 50 |
| `/admin/messages` | 780.0 ms | 1,099.0 ms | 802.1 ms | 0 / 50 |
| `/portal` | 770.7 ms | 915.2 ms | 795.8 ms | 0 / 50 |
| `/portal/tasks/:id` | 869.3 ms | 1,023.8 ms | 892.2 ms | 0 / 50 |
| `/portal/messages` | 743.2 ms | 794.7 ms | 760.1 ms | **21 / 50 (42%)** |

This is not a passing hosting result despite attractive successful-response medians. The failed `/portal/messages` responses were generally faster empty 503 responses, so including them in a latency percentile would make the service appear faster while hiding outages.

### 11.3 Seoul versus colocated Worker

Positive saved time means the successful Frankfurt Worker response is faster. Reliability must be considered separately.

| Route | Seoul p50 | Worker/Frankfurt success p50 | Saved time | Result |
| --- | ---: | ---: | ---: | --- |
| `/admin` | 586.1 ms | 808.6 ms | -222.5 ms | Regression |
| `/admin/messages` | 588.4 ms | 780.0 ms | -191.6 ms | Regression |
| `/portal` | 635.2 ms | 770.7 ms | -135.5 ms | Regression |
| `/portal/tasks/:id` | 874.8 ms | 869.3 ms | 5.5 ms | Essentially equal; 40.2% faster than Pakistan-local Frankfurt |
| `/portal/messages` | 916.0 ms | 743.2 ms | 172.8 ms | 18.9% faster when successful, but 42% failed |

Regional proximity clearly removes a large part of the task-detail waterfall: the same Frankfurt-backed route fell from 1,454.1 ms on the Pakistan server to 869.3 ms on the Frankfurt Worker. Simpler routes do not improve enough to offset Pakistan-to-Worker transit and Worker SSR overhead.

### 11.4 Worker-side trace and exact 503 cause

A successful `/portal/messages` invocation reported 921 ms Worker wall time and 113 ms CPU time. The next failed invocation returned an empty HTTP 503 with no application `x-request-id` or `Server-Timing` header. Cloudflare's live trace reported:

- `outcome: exceededCpu`;
- `cpuTime: 10` ms;
- `Worker exceeded CPU time limit`;
- response status 503;
- execution in `remote-FRA`.

Cloudflare documents a 10 ms CPU limit per HTTP request on Workers Free and notes that authentication and SSR workloads typically use more CPU. The platform allows occasional flexibility, explaining why a 113 ms invocation can sometimes finish while repeated requests are terminated. See [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

The 921 ms successful Worker wall time is not a single database RTT. It includes authentication/bootstrap, project lookup, a subsequent project-message query, RSC work, and response construction. The route still has a real serial stage (`getClientProjects()` followed by `getProjectMessages()`), while the 113 ms CPU measurement proves that runtime execution—not PostgreSQL execution—is the immediate Free-plan failure condition.

### 11.5 U.S. synthetic result

Two independent Globalping runs used five U.S. probes per public path (Buffalo, Los Angeles, Ashburn/San Jose, Spokane, and Houston depending on selection). No session cookie or other credential was sent to the third-party probes. The probes measured `/auth/sign-in` plus anonymous security gates for `/admin`, `/portal`, `/portal/tasks/:id`, and `/portal/messages`.

- Run 1: 5 HTTP 503 responses out of 25 requests (20%).
- Run 2: 6 HTTP 503 responses out of 25 requests (24%).
- Combined: **11 / 50 HTTP 503 responses (22%)**.
- Successful/redirect total p50s in the second run ranged from 218–386 ms for route gates; these are not authenticated page-render timings.

Authenticated U.S. page tests were intentionally not sent through public third-party probes because doing so would disclose a bearer session cookie. The Pakistan benchmark supplies the authenticated application measurements; the U.S. run validates global reachability, Frankfurt placement, redirects, and Free-plan instability.

## 12. Validation commands

| Validation | Result |
| --- | --- |
| Live Frankfurt security suite | PASS |
| Live Frankfurt functional suite | PASS |
| Isolated Worker authenticated security/role suite | PASS when invocation completes |
| Isolated Worker static assets and immutable caching | PASS |
| Isolated Worker bindings/secrets/custom routes | PASS — zero |
| Isolated Worker reliability | **FAIL — reproducible `exceededCpu` HTTP 503s** |
| Vitest | PASS — 15 files, 69 tests |
| TypeScript | PASS |
| ESLint | PASS |
| Production Vinext build | PASS |
| Single port-3000 listener | PASS |

The portable PostgreSQL backup package contains pgAdmin source code under ignored `work/`; the app verification explicitly excluded that ignored third-party tool tree. No application TypeScript or lint failure remained.

## 13. Rollback readiness

- Seoul is paused, preserved, and backed up.
- Its local environment file remains unchanged.
- Frankfurt uses a separate ignored environment file.
- Frankfurt contains only synthetic data.
- Tokyo and production DNS/integrations remain untouched.
- Reverting local testing requires stopping the Frankfurt server, rebuilding with the unchanged Seoul `.env.local`, and starting one fresh production server after Seoul is resumed with explicit approval.

## 14. Decision gate

**Result: regional application/database proximity is beneficial, but Cloudflare Workers Free is rejected for this full Vinext SSR bundle.** The task-detail route proves the network/waterfall benefit; the CPU traces prove the current runtime cannot reliably fit the 10 ms Free ceiling. Keep the Worker isolated for review, keep Frankfurt as synthetic staging, and keep Seoul paused as rollback. Do not upgrade Cloudflare or Supabase based on this experiment without a separate cost/architecture decision.

## 15. Direct answers

1. Seoul backup successful: **Yes**.
2. Only LeadsEdge Seoul paused: **Yes**.
3. Tokyo untouched: **Yes**.
4. Pausing Seoul freed a Free slot: **Yes**.
5. Frankfurt created on Free: **Yes**.
6. Frankfurt reports `eu-central-1`: **Yes**.
7. Existing migrations reproduced: **Yes; all original 11, plus the separately approved Frankfurt-only policy migration**.
8. Security tests passed: **Yes**.
9. Frankfurt bootstrap from Pakistan: **253.7 ms p50 / 602.9 ms p95**.
10. `/admin`: **742.8 / 1,247.5 ms**.
11. `/portal`: **782.1 / 1,588.4 ms**.
12. `/portal/tasks/:id`: **1,454.1 / 2,677.3 ms**.
13. `/portal/messages`: **811.8 / 1,349.5 ms**.
14. Frankfurt versus Seoul: **five of seven routes regress at p50; two improve by 4.5–11.4%; mean route p50 regresses 19.5%; all p95s regress**.
15. Isolated Free Worker possible: **deployment succeeds, but reliable full Vinext SSR execution does not; the 10 ms CPU ceiling causes HTTP 503s**.
16. Worker → Frankfurt result: **placement is verified at `remote-FRA`; successful `/portal/messages` used 921 ms wall / 113 ms CPU and still contains multiple serial application stages**.
17. U.S. synthetic acceptable: **No; 11 of 50 public requests returned HTTP 503 across two independent runs**.
18. Keep Frankfurt active for testing: **Yes, as isolated synthetic staging; it is not approved or suitable for production on Workers Free**.
19. Keep Seoul paused as rollback: **Yes**.
20. Upgrade Supabase to Pro now: **No — continue testing on Free first**.
