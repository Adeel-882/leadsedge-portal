# Leadsedge Portal — Phase 4A U.S. Infrastructure Readiness

Date: 2026-09-04  
Scope: read-only infrastructure assessment. No project was paused, created, deleted, branched, deployed, migrated, or reconfigured. No application code, database data, schema, RLS, Auth, DNS, billing, or environment values were changed.

## Executive decision

**OPTION 2 — PROJECT B APPEARS ACTIVE — DO NOT PAUSE**

The second Free project is the Tokyo project `adeelahmed@broadigo.com's Project` (`hwzbqmvovbnpuaddzbha`, `ap-northeast-1`). It is referenced by another local application (`C:\Dashboard`) and had recent database/pooler activity. Pausing it would put that application at risk. The safe path is therefore a paid, isolated U.S. staging project or a user-selected project that has first been independently retired.

The current Phase 3.2 Seoul baseline remains authoritative and was not rerun:

| Route | p50 | p95 |
| --- | ---: | ---: |
| `/admin` | 586.1 ms | 744.8 ms |
| `/admin/messages` | 588.4 ms | 747.2 ms |
| `/admin/meetings` | 585.7 ms | 839.6 ms |
| `/portal` | 635.2 ms | 920.3 ms |
| `/portal/tasks/:id` | 874.8 ms | 999.5 ms |
| `/portal/messages` | 916.0 ms | 1030.6 ms |
| `/portal/meetings` | 624.8 ms | 715.3 ms |

## 1. Supabase account state

Read-only Supabase Management API inspection found:

- Organization: `Broadigo Org` (`bxiufsjvimukurfwrkdz`)
- Plan: Free
- Active project entitlement: two projects
- Project pausing: enabled
- Persistent branching: unavailable (`branching_persistent=false`, branch limit `0`)
- PITR: unavailable on the current plan

Supabase documents a limit of two active Free projects. Paused projects do not consume an active-project slot, but Free projects can also be automatically paused after inactivity. [Supabase pricing](https://supabase.com/pricing) and [billing documentation](https://supabase.com/docs/guides/platform/billing-on-supabase) are the authoritative plan references.

## 2. Project inventory

| Project | Reference | Region | Status | Assessment |
| --- | --- | --- | --- | --- |
| `LeadsedgePortal` | `llmmtdzlurunphdfrqlg` | `ap-northeast-2` — Seoul | `ACTIVE_HEALTHY` | Current Leadsedge database |
| `adeelahmed@broadigo.com's Project` | `hwzbqmvovbnpuaddzbha` | `ap-northeast-1` — Tokyo | `ACTIVE_HEALTHY` | Another application appears to depend on it |

Both Free slots are occupied.

## 3. Second-project pause assessment

Classification: **DO NOT PAUSE**.

Evidence:

- The Tokyo project was healthy and active at inspection time.
- Aggregate Management API log counts for the preceding 24 hours showed 662 Supavisor events, 120 PostgreSQL events, and 3 PgBouncer events. Only counts were inspected; no application records or log bodies were read.
- The Leadsedge repository contains no reference to the Tokyo project ref.
- A separate local application at `C:\Dashboard` has a configured database URL whose host is the Tokyo Supabase pooler (`aws-0-ap-northeast-1.pooler.supabase.com`). Secret values were neither displayed nor recorded.

These signals do not prove what every request represents, but together they are strong evidence of a live dependency. A pause could interrupt `C:\Dashboard`, Auth, scheduled work, or database access. No pause was attempted.

## 4. Free-plan limitations and options

1. The Free plan allows two active projects.
2. A paused project stops occupying an active-project slot.
3. Technically, pausing Project B would make room for a U.S. Free project; operationally, this is not safe because Project B appears active.
4. Persistent Branching is unavailable on this organization's current Free entitlements.
5. A new U.S. project could cost $0 only if an active slot were safely freed or a separate eligible Free organization were used. Neither condition has been established here.

See [Supabase Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Branching](https://supabase.com/docs/guides/deployment/branching), and [pricing](https://supabase.com/pricing).

## 5. U.S. region recommendation

Recommended first test region: **`us-east-1` — North Virginia**.

This is a sensible first region for a nationally targeted U.S. real-estate portal because it is a major U.S. hosting region, provides a clean U.S.-resident comparison with Seoul, and can be paired with Worker placement near `aws:us-east-1`. It is an experiment choice, not a claim that every U.S. user is nearest to Virginia. A later production decision should include real-user geography and compliance requirements. Supabase lists North Virginia as `us-east-1` and advises locating projects close to users. [Supabase regions](https://supabase.com/docs/guides/platform/regions).

## 6. Schema reproducibility

Classification: **REPRODUCIBLE**, with hosted configuration steps required after migrations.

### Evidence

- The live `supabase_migrations.schema_migrations` ledger contains all 11 repository migrations, in order, from `202608260001_phase1` through `202609030001_portal_bootstrap_prototype`.
- Read-only live catalog inspection matched the migration-defined application surface:
  - 24 public tables
  - all expected application columns and enum values
  - primary, unique, foreign-key, and check constraints
  - 50 application indexes (including People trigram indexes and message/meeting/unread indexes)
  - the expected RLS policies, with RLS enabled on all 24 public tables
  - application functions including `get_portal_bootstrap()`, unread-count RPCs, People RPCs, membership helpers, message hooks, meeting RPCs, and automation functions
  - 13 public triggers plus `auth.users.on_auth_user_created`
  - Realtime publication membership for `project_messages`, `task_messages`, `notifications`, and `message_read_receipts`
  - active `leadsedge-feedback-automation` PostgreSQL cron job at `* * * * *`
- Required migration-created extensions are present: `pgcrypto`, `pg_trgm`, and `pg_cron` (alongside platform-managed extensions).

No schema drift was found in the compared migration ledger and catalog surfaces. This is not a claim that hosted Auth settings, provider templates, credentials, or external-service configuration are migrations; those are inventoried below.

### New-project reconstruction order

1. Create an empty Supabase project in `us-east-1` only after approval.
2. Apply the 11 checked-in migrations in filename order.
3. Verify ledger, catalog objects, RLS enablement/policies, grants, Auth trigger, Realtime publication, and cron job against Seoul.
4. Configure hosted Auth and external integrations without copying production customer data or tokens.
5. Create only deterministic synthetic users/data.
6. Run role-isolation and manipulated-ID tests before benchmarking.

## 7. Non-migration configuration inventory

### Auth

- Set the Supabase Auth Site URL for the isolated staging origin.
- Add exact staging redirect URLs, including `/auth/callback`, `/auth/confirm`, `/portal`, and setup/admin flows as used by the application.
- Preserve passwordless magic-link/TokenHash behavior and `shouldCreateUser: false` eligibility checks.
- Configure email templates and SMTP/provider behavior separately; these are hosted Auth settings, not SQL migrations.
- Create synthetic Auth users through an approved staging-only fixture process. Never copy production Auth users or sessions.

### Application environment

Required keys are documented in `.env.example`: public Supabase URL/anon key; server-only service-role key; app URL; Resend settings; cron secret; Google client ID/secret; calendar token-encryption key; and development/demo flags. Current local inspection recorded only presence/configuration status and did not reveal values. Google Calendar keys were not present in the local file at inspection time; this does not establish production state.

Each U.S. staging deployment requires independent Supabase keys and a staging `NEXT_PUBLIC_APP_URL`. Secrets must be added through the hosting platform's secret store, not committed or copied into the report.

### Google Calendar

- A Google OAuth Web client and Calendar API enablement are external configuration.
- Add the staging callback exactly: `https://<staging-host>/api/admin/calendar/google/callback`.
- Provide `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a staging `CALENDAR_TOKEN_ENCRYPTION_KEY`.
- Do not copy Seoul `calendar_connections.encrypted_refresh_token` values: they depend on the original encryption key and represent real OAuth authority. Connect only a synthetic/test calendar account.

### Resend

- Provide a staging API key and sender only if email delivery is intentionally tested.
- Verify the sender/domain in Resend and keep staging recipients allow-listed or controlled.
- No Resend webhook implementation was found in the repository.
- Prefer disabled/sandbox delivery during database and route latency tests so email does not add cost or side effects.

### Realtime

- Migration publication statements cover the four application Realtime tables.
- Confirm Realtime is enabled and subscriptions authorize correctly after migration; do not assume publication membership alone validates browser delivery.

### Storage

- No application Storage bucket usage or bucket migrations were found. The hosting configuration also has no R2 binding.
- If attachments later depend on external URLs, that is outside the current schema reconstruction.

### Vault and secrets

- No application Vault entries or Vault SQL usage were found.
- Platform `supabase_vault` is present but is not the application's secret-distribution mechanism.
- Service-role, OAuth, Resend, cron, and encryption secrets remain deployment-level configuration.

### Edge Functions

- No Supabase Edge Functions directory or invocation was found. Application APIs run through Vinext/Worker routes.

### Cron

- SQL migration creates the PostgreSQL minute job that runs `process_due_feedback_requests_job()`.
- A separate external scheduler must call `GET /api/cron/automation` every minute with `Authorization: Bearer <CRON_SECRET>` to drain durable email work.
- The scheduler itself and its secret are not represented by database migrations.

### Webhooks

- No application webhook endpoints/configuration were found. External provider dashboard settings, if later introduced, would require separate inventory.

## 8. Deterministic synthetic fixture plan

No fixtures were created in this phase.

### Principles

- Use only synthetic names, reserved example-domain addresses, and deterministic UUID seeds or a fixture manifest.
- Keep setup idempotent: a staging-only fixture namespace plus stable dedupe keys should make reruns update/skip rather than duplicate.
- Create Auth identities first, then invoke normal server/RPC workflows where possible so triggers, membership, RLS, receipts, and notification behavior are realistic.
- Add a teardown manifest for the isolated U.S. project only. Never point it at Seoul.
- Disable real outbound email and use a test calendar.

### Admin fixture

- 1 active test administrator with `admin_settings` and availability rules.
- At least 5 projects spanning active/completed/archived status and multiple synthetic clients.
- At least 30 tasks across draft/active/completed, including standard, form, and feedback states.
- Project and task conversations large enough to exercise list rendering and unread counters.
- Read and unread notifications.
- Past, upcoming, and cancelled meetings.

### Client fixture

- 1 active client with a valid Auth mapping and enabled client record.
- Membership in exactly 3 projects, including one primary relationship.
- At least 10 visible assigned tasks plus hidden/draft/non-assigned controls to test RLS denial.
- At least 100 messages, distributed across project and task conversations, with deterministic timestamps and receipt states so pagination and unread counts are measurable.
- Read/unread notifications and past/upcoming/cancelled meetings.
- A second synthetic client with foreign projects/resources solely for negative isolation and manipulated-ID tests.

### Fixture acceptance gates

- Admin can access the admin dataset.
- Each client sees only its memberships and allowed resources.
- Disabled client is denied.
- Cross-client project, task, message, meeting, notification, and direct-ID access is denied.
- Pagination returns stable, non-overlapping pages.
- Bootstrap and unread results agree with direct count validation.

## 9. Cloudflare/Vinext readiness

Classification: **application build path is compatible; isolated staging deployment configuration is not yet complete**.

Observed repository configuration:

- Vinext is integrated through Vite and `@cloudflare/vite-plugin`.
- Worker entry is `vinext/server/app-router-entry` with `nodejs_compat`.
- OpenAI Sites configuration identifies one existing project (`appgprj_6a8f1e97ea208191abcdad87b8f5db00`).
- D1 and R2 bindings are null; no standalone `wrangler.toml`/`wrangler.jsonc` exists.
- Static assets are handled by the Vinext/Vite/Cloudflare build path.
- No repository-defined routes, custom-domain binding, Worker name, staging environment, or placement hint was found.

Therefore an isolated staging Worker can be created later without affecting production **only if** it receives a distinct project/Worker identity, staging hostname, secrets, and environment. Reusing the existing Sites project would not establish isolation. Those additions require explicit approval and must be reviewed before deployment.

Dynamic `fetch` execution can be placed close to `aws:us-east-1` using Cloudflare's explicit placement region. Static assets continue to be served near the requester. Placement is available across Workers plans and applies to fetch handlers, not every entrypoint type. [Cloudflare placement documentation](https://developers.cloudflare.com/workers/configuration/placement/).

Candidate future configuration concept (not applied):

```json
{
  "placement": {
    "region": "aws:us-east-1"
  }
}
```

## 10. Benchmark topology

Use one immutable fixture manifest and the same route IDs across environments. Record at least 20 warm authenticated samples per route, plus separately labelled cold samples. Report p50, mean, p95, errors, and sample count; do not cherry-pick. Time the trivial request and bootstrap RPC independently so database/network time can be separated from rendering.

| Topology | Runtime → database | Purpose |
| --- | --- | --- |
| A | Pakistan local → Seoul | Fixed Phase 3.2 control; retain published route numbers |
| B | Pakistan local → U.S. East | Isolates database-region/geographic effect while keeping local runtime |
| C | U.S. East Worker → U.S. East | Target architecture; tests colocated application compute/database |
| D (optional) | U.S. East Worker → Seoul | Separates Worker/runtime effect from database-region effect |

Measure in every available topology:

- trivial authenticated Supabase request
- `get_portal_bootstrap()`
- `/admin`
- `/portal`
- `/portal/tasks/:id`
- `/portal/messages`

Also capture Worker placement (`cf-placement` when enabled), database region, fixture revision, build commit, authentication role, response status, and whether each sample is cold/warm. Do not mix results from different fixture sizes or builds.

## 11. Cost analysis

### Option A — pause Project B, create a U.S. Free project

- Platform cost: potentially $0 within Free quotas.
- Operational conclusion: rejected for now because Project B appears active and backs another application.

### Option B — upgrade Supabase

- A Pro organization starts at $25/month and includes $10/month compute credit, enough for one Micro project.
- In the current organization, three Micro projects would be approximately $45/month before usage overages: $25 plan + $30 compute - $10 credit.
- A separate Pro organization containing only the U.S. staging Micro project would be approximately $25/month before overages and offers cleaner staging isolation.
- Exact checkout pricing and taxes must be reviewed immediately before purchase. [Supabase pricing](https://supabase.com/pricing) and [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq).

### Option C — Cloudflare staging Worker

- A small experiment may fit the Workers Free tier: 100,000 requests/day, with strict Free CPU/subrequest/size limits.
- Workers Paid has a $5/month minimum and materially higher limits; overages depend on requests and CPU.
- Whether the current Vinext bundle fits Free limits must be confirmed from a future non-production upload/build report before deployment. [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [limits](https://developers.cloudflare.com/workers/platform/limits/).

## 12. Risks and rollback

| Risk | Prevention | Rollback |
| --- | --- | --- |
| Pausing the active Tokyo project disrupts `C:\Dashboard` | Do not pause it | Not applicable; no pause performed |
| Staging accidentally targets Seoul | Distinct project ref, secrets, hostname, and visible startup guard | Remove staging Worker secrets/routes; Seoul remains unchanged |
| Production data or Auth identities copied | Synthetic fixture only; no database dump | Delete the isolated staging project only after explicit approval |
| Real emails/calendar events sent | Sandbox/allow-listed email and test Google account | Revoke staging credentials and clear staging-only queue/data |
| RLS differs after rebuild | Catalog/policy diff and negative identity tests before benchmarks | Discard isolated staging project and correct migrations separately |
| Worker placement assumption is wrong | Record `cf-placement`; compare C and optional D | Remove placement setting from staging configuration |
| Free Worker limits distort results | Record limit/errors; use paid staging only with approval | Return to Free or delete isolated staging Worker |
| Benchmark fixture drifts | Versioned deterministic fixture manifest | Recreate only the isolated staging project/fixture after approval |

No production rollback is needed for Phase 4A because it made no infrastructure or runtime change.

## 13. Exact next approval required

Do **not** approve pausing Project B.

Recommended next approval:

> Approve creation of a separate Supabase Pro organization (or equivalent isolated paid staging organization), one `us-east-1` Micro project, and a distinct staging Worker/project configuration with `aws:us-east-1` placement, subject to a pre-purchase cost confirmation (approximately $25/month for Supabase plus $0 if Workers Free limits suffice, otherwise $5/month minimum for Workers Paid). Authorize applying only the existing 11 migrations and creating only the documented synthetic fixture; do not migrate Seoul data or change production.

If paid resources are not approved, the alternative next action is for the user to identify and formally retire a project that can safely be paused. The current evidence does not support using the Tokyo slot.

## Direct answers

1. **What is the second Supabase project?** `adeelahmed@broadigo.com's Project` (`hwzbqmvovbnpuaddzbha`) in Tokyo (`ap-northeast-1`), apparently backing `C:\Dashboard`.
2. **Is it safe to pause?** No. It appears active; do not pause it.
3. **Can Leadsedge be fully reconstructed from migrations?** Yes for the database schema, functions, RLS, triggers, grants, Realtime publication, and database cron represented by the 11 migrations. Hosted/external configuration must be recreated separately.
4. **What configuration is not represented by migrations?** Supabase Auth Site URL/redirects/templates/provider settings and Auth users; deployment environment/secrets; Resend domain/key/sender; Google OAuth client/callback/test account and token-encryption key; the external cron HTTP scheduler; Worker identity/hostname/routes/placement; and any external provider dashboard settings.
5. **Can we create a U.S. test project for $0 by pausing the second project?** Technically the slot mechanism permits it, but no: Project B should not be paused because it appears active.
6. **Is `us-east-1` the recommended first test region?** Yes.
7. **Is the repository ready for an isolated staging Worker?** Partially. The Vinext/Cloudflare build path exists, but a separate Worker/project identity, hostname, placement, and staging secrets must be defined and reviewed.
8. **Can dynamic compute later be placed near `aws:us-east-1`?** Yes, for Worker fetch execution, using an explicit Cloudflare placement hint; verify it through placement telemetry during the experiment.
9. **What exact approval is needed next?** Approval to incur the confirmed cost and create an isolated paid U.S. Supabase staging project and distinct staging Worker configuration, then apply only the 11 existing migrations and synthetic fixture plan. No production or Seoul changes.
10. **Should any more application-level Seoul optimization occur now?** **No.**
