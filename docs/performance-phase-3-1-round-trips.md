# Leadsedge Portal Phase 3.1: round-trip reduction

## Outcome

The bootstrap RPC passed its migration, security, and performance gates and is
now retained. It was applied through normal migration history after a dry run
showed that it was the only pending migration. Admin and client layouts now use
one bounded bootstrap for viewer identity, role, shell context, and unread
counts. Page-specific data remains outside the bootstrap.

One code-only waterfall was safely removed from the client task detail route:
the RLS-authorized task and message reads now start alongside the authoritative
role check, and the redundant project-membership read after
`getAuthorizedClientTask()` was removed. The live hardened `can_access_task()`
policy already verifies enabled-client status, direct assignment, project
membership, visibility, draft state, and archival state.

## Application-observed baseline

These are the retained 50-sample local production-server measurements from the
immediately preceding pass, using `http://127.0.0.1:3000`. They are not inferred
from PostgreSQL execution time.

| Route | p50 | p95 | Mean | Notes |
| --- | ---: | ---: | ---: | --- |
| `/admin` | 1,141 ms | 1,961 ms | 1,262 ms | profile, unread, projects, clients, meeting |
| `/admin/messages` | 1,183 ms | 2,090 ms | 1,312 ms | profile, unread, projects, 3 inbox reads |
| `/portal` | 1,233 ms | 2,919 ms | 1,500 ms | profile then client-scoped page reads |
| `/portal/messages` | 1,268 ms | 2,109 ms | 1,409 ms | profile/project stage then 50-message stage |

The existing authorized administrator browser session was reused, avoiding new
magic links and Auth metadata changes. No safe existing client browser session
was available, so new client route timings were not manufactured.

## Migration gate

- `supabase migration list --linked` showed every migration through
  `202609020002` matched remotely and only `202609030001` was local-only.
- `supabase db push --linked --dry-run` listed only
  `202609030001_portal_bootstrap_prototype.sql`; seeds and roles were empty.
- The normal migration push applied only that file.
- A second live migration-list check showed local and remote history matched
  through `202609030001`.

## Request waterfalls

Counts below are logical Supabase operations; operations on one line start in
parallel. Local `getSession()` and asymmetric `getClaims()` work are not counted
as remote database requests.

### Admin dashboard before

```text
profile
  -> projects | clients | next meeting | unread
```

- Five logical reads, two serial network stages.
- Layout/page viewer calls are request-deduplicated.
- Bootstrap would replace profile + unread with one read, but page-specific
  projects, clients, and meeting data correctly remain outside the bootstrap.

### Admin messages before

```text
profile
  -> projects | unread | project messages | task messages | receipts
```

- Six logical reads, two serial network stages.
- The three inbox reads are parallel, not duplicated.
- A bounded inbox-summary RPC remains a separate, unapproved database design;
  it is intentionally outside this phase.

### Client home before

```text
profile
  -> unread | projects | notifications | next meeting | tasks
```

- Six logical reads, two serial network stages.
- Layout/page unread calls are request-deduplicated.
- The client query helpers wait for the authoritative viewer before returning
  protected results; RLS remains authoritative underneath.

### Client messages before

```text
profile
  -> projects + unread
     -> newest 50 project messages
```

- Four logical reads, three serial stages on the message-content path.
- An approved bootstrap containing only viewer, unread, and primary project ID
  would reduce this to bootstrap -> messages (two stages, two reads).

### Client task detail

Before:

```text
profile
  -> projects | task | messages | authorized task
                               -> authorized project
```

After retained code-only change:

```text
profile | RLS task | RLS messages
  -> projects | authorized task
```

- Before: six logical reads and three serial stages.
- After: five logical reads and two serial stages.
- Saved: one complete remote membership round trip (representatively about
  250–600+ ms on the observed path), plus task/message reads begin one stage
  earlier. A route-level millisecond claim is withheld until an authorized
  authenticated benchmark can run.

## Bootstrap security review

`supabase/migrations/202609030001_portal_bootstrap_prototype.sql`:

- creates/replaces only `public.get_portal_bootstrap()`;
- derives identity only from `auth.uid()` and accepts no arguments;
- is `STABLE SECURITY INVOKER` with `search_path = public`;
- leaves every table and RLS policy unchanged;
- omits viewer and project context for disabled clients;
- returns only viewer ID/role/display name, disabled state, primary project
  ID/name, and unread counts;
- revokes execution from `public` and `anon` and grants only `authenticated`;
- contains no inserts, updates, deletes, truncation, destructive DDL, auth
  changes, or production configuration changes.

The adapter in `lib/bootstrap.ts` rejects disabled, malformed, and unknown-role
payloads. `getClaims()` still validates a signed JWT before the RPC is used, and
the RPC derives its database identity only from `auth.uid()`. Contact fields are
not part of the bootstrap: account, setup, Google OAuth, and the rare meeting
fallback explicitly request the full profile when needed.

Live checks:

- anonymous direct RPC: denied with PostgreSQL `42501`;
- forged JWT: denied by PostgREST with `PGRST301`;
- existing administrator: accepted, role and shell rendered correctly;
- admin attempting `/portal`: redirected to `/admin`;
- client: pending because no safe existing client browser session was available;
- disabled client: structurally and regression-test covered, not live-mutated;
- no client or application records were changed for validation.

## After architecture

```text
local verified JWT claims
  -> get_portal_bootstrap (viewer + role + minimal context + unread)
  -> page-specific reads in parallel where independent
```

Correlation tracing across 50 `/admin` and 50 `/admin/messages` requests showed
102 bootstrap HTTP operations including two warm-ups: exactly one per measured
route request, zero profile reads, and zero separate unread RPCs. The duplicate
layout/page invocation is collapsed by the existing request-ID-scoped read
deduplicator; failures are still evicted and cross-request/user sharing remains
prohibited.

## Direct bootstrap benchmark

Fifty paired, alternated samples from the same authorized browser session:

| Metric | Separate profile + unread | One bootstrap RPC | Improvement |
| --- | ---: | ---: | ---: |
| p50 | 477.8 ms | 261.5 ms | 45.3% |
| p75 | 504.6 ms | 276.8 ms | 45.1% |
| p90 | 537.8 ms | 288.5 ms | 46.4% |
| p95 | 747.6 ms | 299.2 ms | 60.0% |
| mean | 502.2 ms | 262.0 ms | 47.8% |
| maximum | 870.2 ms | 304.8 ms | 65.0% |
| standard deviation | 82.4 ms | 20.4 ms | 75.2% lower |

Payload was 253 bytes for bootstrap versus 140 bytes for the smaller legacy
test response. The extra 113 bytes replace a network request and add only the
bounded primary-project context.

## Before/after summary

| Route | Before reads / serial stages | After reads / serial stages | Measured timing change |
| --- | ---: | ---: | --- |
| `/admin` | 5 / 2 | 4 / 1 shell stage | measured below |
| `/admin/messages` | 6 / 2 | 5 / 1 shell stage | measured below |
| `/portal` | 6 / 2 | 5 / 1 shell stage | client timing pending |
| `/portal/messages` | 4 / 3 | 3 / 2 | client timing pending |
| client task detail | 6 / 3 | 5 / 2 | structural reduction; live timing gated |

## Route benchmark

Historical before values and after values both use 50 full-response samples at
`127.0.0.1` with the same live Seoul project. The after run reused the existing
browser session and alternated routes to reduce ordering bias.

| Route | Before p50 | After p50 | p50 improvement | Before p95 | After p95 | Calls before/after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/admin` | 1,141 ms | 522.0 ms | 54.3% | 1,961 ms | 614.9 ms | 5 → 4 |
| `/admin/messages` | 1,183 ms | 533.6 ms | 54.9% | 2,090 ms | 595.3 ms | 6 → 5 |

After means were 540.8 ms for `/admin` and 545.5 ms for `/admin/messages`.
Client before values remain documented, but no after numbers are claimed.

## Decision gate

1. **Fast enough without a region change:** administrator routes are now within
   the local target at roughly 522–534 ms p50, but client routes and real U.S.
   production topology remain unproven.
2. **Application-irreducible latency:** after practical consolidation, at least
   one authenticated Data API operation remains. The measured representative
   operation spends about 305 ms outside PostgreSQL; route tails add substantial
   variance. Exact irreducible route latency requires the approved bootstrap run.
3. **Paid U.S. experiment:** potentially justified only after the bootstrap is
   applied and measured. Round-trip reduction should be exhausted first.
4. **Minimal-cost later experiment:** one short-lived `us-east-1` Supabase branch
   without production data plus one non-production Worker placed near it, using
   100 matched authenticated samples. No resource should be created without a
   separate billing approval.

## Final decision

**KEEP.** Security checks available without mutating users passed, the direct
path improved 45.3% at p50, and both administrator routes improved about 54% at
p50. Bootstrap removes one remote Supabase round trip from every authenticated
shell render. In the matched direct test this saved 216.3 ms at p50, 448.4 ms at
p95, and 240.2 ms on average on the existing Seoul architecture.
