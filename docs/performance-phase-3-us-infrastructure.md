# Leadsedge Portal Phase 3: U.S. production architecture experiment

## Executive result

The U.S. database/application experiment could not be provisioned without a billing decision. Read-only Supabase Management API inspection on 2026-09-03 established:

- Organization: Broadigo Org
- Plan: Free
- Active projects: 2 (the documented Free-plan maximum)
- LeadsedgePortal: `ap-northeast-2` (Seoul)
- Other existing project: `ap-northeast-1` (Tokyo), unrelated
- Existing branches: none
- Branching: unavailable on Free
- PITR/physical restore: unavailable on Free

No project, branch, Worker, record, secret, DNS entry, or production setting was created or changed. Because no U.S. Supabase endpoint exists, Phase 3 cannot honestly report a U.S. route benchmark or the percentage of latency eliminated by colocation.

## 1. Current architecture

```text
Pakistan development user/runtime
  -> nearest Supabase network edge
  -> Supabase Data API / regional transit
  -> Seoul PostgreSQL (ap-northeast-2)
```

| Operation | PostgreSQL mean | Application observed |
| --- | ---: | ---: |
| Unread RPC | 1.012 ms over 2,444 calls | ~306 ms median |
| Project message detail | 2.127 ms over 228 calls | part of 1.2–1.7 s route |
| Admin project-message query | 4.977 ms over 128 calls | one of three inbox reads |
| Message insert | 9.507 ms over 11 calls | network-dependent mutation |

The representative unread operation spends approximately 305 ms, or 99.7% of observed elapsed time, outside PostgreSQL. That combines edge-to-region transit, Data API processing, TLS/HTTP, routing, and local network effects; it must not be labeled as geography alone.

## 2. Proposed production architecture

```text
U.S. user
  -> Cloudflare edge for static assets
  -> dynamic Vinext Worker placed near aws:us-east-1
  -> Supabase us-east-1
```

North Virginia (`us-east-1`) is the recommended first experiment for nationally distributed U.S. traffic. Ohio (`us-east-2`) is a reasonable central/eastern alternative; Oregon (`us-west-2`) and North California (`us-west-1`) favor western users but add east-coast latency.

Test Cloudflare Placement with `region: "aws:us-east-1"` while keeping static assets edge-served. A split edge/backend Worker is unnecessary for the first experiment; consider it only if measured behavior justifies the added architecture.

## 3. Region comparison

| Environment | DB execution | Observed latency | Overhead | Status |
| --- | ---: | ---: | ---: | --- |
| Pakistan app -> Seoul Supabase | 1.012 ms unread mean | ~306 ms median | ~305 ms | measured |
| Pakistan app -> U.S. East Supabase | unavailable | unavailable | unavailable | no U.S. project |
| U.S. East app -> U.S. East Supabase | unavailable | unavailable | unavailable | no staging Worker/project |
| U.S. East app -> Seoul Supabase | unavailable | unavailable | unavailable | no staging Worker |

Synthetic ICMP tests to the current Supabase hostname measured approximately 0.7–2.1 ms from Virginia probes, 0.7–2.6 ms from California probes, and 26–31 ms locally from Pakistan. These reach Supabase's nearby network edge, not Seoul PostgreSQL. They demonstrate why ping cannot substitute for an authenticated Data API benchmark: the hidden edge-to-database leg is the important one.

## 4. Route benchmark

| Route | Seoul p50 | U.S. p50 | Improvement | Seoul p95 | U.S. p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/admin` | 1,141 ms (50 samples) | not measured | — | 1,961 ms | not measured |
| `/admin/messages` | 1,183 ms (50 samples) | not measured | — | 2,090 ms | not measured |
| `/portal` | 1,233 ms (50 samples) | not measured | — | 2,919 ms | not measured |
| `/portal/messages` after pagination | 1,268 ms (50 samples) | not measured | — | 2,109 ms | not measured |

Creating favorable U.S. figures from ping or a different public service would be invalid. The benchmark harness now accepts `PERF_ENV_FILE` and `PERF_ENVIRONMENT_NAME`, so the exact route set can run unchanged when staging exists.

## 5. Bootstrap benchmark

The reviewed prototype remains unapplied at `supabase/migrations/202609030001_portal_bootstrap_prototype.sql`.

Security review confirms that identity originates only from `auth.uid()`; there is no caller-controlled user ID; the function is `SECURITY INVOKER` with explicit `search_path`; existing RLS governs reads; disabled clients produce no viewer/bootstrap row or project context; the payload is minimal; and execute is denied to `public`/`anon` and granted only to `authenticated`.

Expected request count is two shell reads plus later project context reduced to one RPC. Expected latency is not claimed. Apply and benchmark only in isolated staging.

## 6. Request-count comparison

| Path | Current | Bootstrap candidate |
| --- | ---: | ---: |
| Shell profile + unread | 2 requests | 1 request |
| Client primary project context | later page request | included minimally |
| Full page-specific data | unchanged | unchanged |

## 7. Security verification plan

Run these against U.S. staging before accepting results:

1. Anonymous and missing-cookie requests are denied.
2. Forged, malformed, expired, and wrong-project JWTs are denied.
3. Admin/client routes and redirects remain separated.
4. Disabled clients receive no bootstrap row or protected data.
5. Client A cannot access Client B project/task/message/meeting/notification/bootstrap data through manipulated IDs.
6. Administrator access remains intact.
7. Realtime delivers authorized events and rejects unauthorized subscriptions.
8. Direct deep links independently authorize.
9. No service-role, OAuth, Resend, Calendar, encryption, or cron secret enters browser output or benchmark logs.

These are not marked passed for U.S. staging because that environment does not exist.

## 8. Cost implications and staging options

The Free plan permits two active projects; both slots are occupied. Branching and PITR are unavailable. Current published pricing lists Pro at $25/month, additional project compute from $10/month, and branches at $0.01344 per branch-hour (about $9.81 for a 730-hour month before other usage).

After explicit billing approval, the preferred branch command is:

```powershell
supabase branches create leadsedge-us-east-staging `
  --project-ref llmmtdzlurunphdfrqlg `
  --persistent `
  --region us-east-1
```

Intentionally omit `--with-data`. Branches are data-less by default, and copying production data is unnecessary. Dashboard “Include data” requires PITR and creates a production-data copy; neither is appropriate here.

A standalone `us-east-1` staging project under a separately approved plan/organization is the alternative. Do not repurpose the unrelated Tokyo project or pause/delete it without owner direction.

Reproducible setup after approval:

1. Provision and verify the destination reports `us-east-1`.
2. Apply repository migrations in timestamp order; do not manually reconstruct schema in Studio.
3. Apply the bootstrap prototype last.
4. Recreate branch Auth configuration and synthetic admin/client users.
5. Seed synthetic projects, tasks, more than 50 messages, notifications, and meetings.
6. Verify `pgcrypto`, `pg_trgm`, `pg_cron`, scheduled jobs, and Realtime publications.
7. Store branch URL/keys in ignored `.env.us-staging`; never overwrite `.env.local`.
8. Disable real email/calendar effects for benchmarks.
9. Run the app with the staging env and deploy a separate non-production Worker placed near `aws:us-east-1`.
10. Run 100-sample route/RPC comparisons and safe 1/10/25-concurrency tests.
11. Remove/pause staging only with explicit authorization.

## 9. Production migration plan

Moving regions requires a new project; the existing project's region cannot change in place. “Restore to a new project” preserves the source region, so it is not the region-change mechanism.

Recommended pre-launch sequence, not executed:

1. Inventory migrations, extensions, cron, Realtime, Auth providers/templates/redirects, Storage, Functions, webhooks, Vault/encryption, Google OAuth, Resend, and environment variables.
2. Create a new `us-east-1` project and verify its region through the Management API.
3. Rehearse schema creation from migrations; validate every function, trigger, policy, grant, extension, cron job, and publication.
4. Recreate Auth configuration and decide whether users/JWT continuity will migrate or users will sign in again.
5. During a controlled write freeze, migrate database data with official dump/restore tooling and validate counts/checksums/ownership/sequences/grants/encrypted data.
6. Transfer Storage objects separately; database metadata does not transfer object bytes.
7. Recreate Functions/secrets, webhooks, cron secret, Resend, Google callbacks, and Calendar token-encryption handling.
8. Validate login, magic links, isolation, messages/Realtime, meetings, automation/outbox, and delivery controls.
9. Run route, mutation, bootstrap, Realtime, and concurrency benchmarks.
10. Prepare rollback and avoid writes to both projects without designed replication.
11. Perform a short final freeze/delta, switch hosted secrets/API URL and OAuth redirects, deploy, smoke-test, and reopen writes.
12. Retain Seoul through the rollback window; decommission only after explicit approval.

Migrating before real client data exists is materially safer than migrating after launch: fewer records, simpler Auth communication, no customer downtime expectation, and a much smaller rollback delta.

## 10. Final recommendation

### Database region: D. MORE REGION TESTING REQUIRED

North Virginia is the recommended first staging candidate, but no U.S. Supabase measurement exists yet. A measured “move” conclusion would overstate the evidence.

### Application topology: B. WORKER PLACED NEAR DATABASE — staging recommendation

Use one placed dynamic Worker first while static assets remain edge-served. Split edge/database Workers only if measurements show a concrete need.

## 11. Quantitative answer

Measured today:

- 306 ms median application-observed unread request
- 1.012 ms mean PostgreSQL execution
- approximately 305 ms / 99.7% outside PostgreSQL for that representative operation
- three serial remote stages can expose roughly 915 ms of measured non-Postgres waiting; five can expose roughly 1,525 ms, subject to parallelism and variance

Not measured: U.S. East Data API latency, U.S.-placed Worker latency, U.S. route p50/p95, or the exact percentage eliminated.

The only defensible answer is: **up to approximately 305 ms per serial Supabase operation is currently outside PostgreSQL and potentially addressable by topology and consolidation, but the fraction eliminated by U.S. colocation is not yet measured.** Remaining latency would include Data API processing, one authoritative bootstrap, page reads, Vinext rendering, transfer/hydration, and user-to-region RTT.

Provisioning isolated U.S. staging is the next approval gate; estimates must not replace that experiment.
