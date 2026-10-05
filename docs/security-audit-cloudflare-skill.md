# LeadsEdge security audit — incomplete skill run and supplemental source review

## Executive summary

**Status: INCOMPLETE. This is not a completed Cloudflare-skill audit or a production security clearance.** The skill's mandatory JSON validators refuse to operate under the installed Windows Node runtime. Its required execution sandbox was also unavailable. Reconnaissance and supplemental read-only source/secret review were performed; exploit validation, the prescribed hunting/critic/verification stages, and final validated skill artifacts were not completed.

No CRITICAL, HIGH, MEDIUM, or LOW vulnerability was confirmed in this pass. That is an evidence limitation, not a statement that no vulnerabilities exist. No likely vulnerability is promoted on source suspicion alone. Five outstanding validation/hardening priorities are described below. Auth and client isolation have substantial source-visible controls; their deployed enforcement remains unverified.

The bounded secret scan found **zero matches** in 482 historical text blobs across 12 reachable commits and 73 built files. It checked selected credential patterns and exact matches for six current private environment values without outputting those values. This is not an exhaustive credential detector.

No application code, dependencies, database, Auth, RLS, Realtime publication, external configuration, or running server was changed. No tokens/emails were generated. No repository content or secrets were uploaded and no audit network requests were made.

## Audit identity and safety record

| Item | Value |
|---|---|
| Date / report timestamp | 2026-10-05, 22:29 +05:00 (Asia/Karachi) |
| Target | `C:\Leadsedge Portal` |
| Branch | `main` |
| Commit | `77af4b9261e217bb6c521bfca686f94d4a0aea28` |
| Initial working tree | Clean; no changes discarded, staged, or committed |
| Skill | `Skills/security-audit-skill-main/security-audit-skill-main/skills/security-audit/SKILL.md` |
| Skill version | No semantic version established; MIT license credits Cloudflare Inc., 2025–2026 |
| SKILL.md SHA-256 | `5E3E96A1E438D8F35FEF0A1E38F02D4F00E2BDF910401B7DFE00E6779C6DAC85` |
| Run directory | `C:\Users\adeel_utu7nye\security-audit-skill\Leadsedge-Portal\run-1` |
| Profile | Standard; source/local only |

Read the README, SKILL.md, reconnaissance, hunting, attack classes, validation/reporting instructions, relevant web/auth, client-side, isolation/lifecycle, supply-chain, cloud/deployment, protocol/messaging and availability companions, report schema, and validator source. The skill is a structured agent-review protocol, not a Cloudflare-hosted scanning service. Its validators use Node built-ins and need no installed packages or credentials. They validate audit records; they do not scan application code themselves.

The documented workflow requires parallel reconnaissance, validated coverage assignments, hunters and critics, independent candidate verification with bounded observations, findings validation, independent record verification, and reports. Four independent reconnaissance reviews completed: product/architecture, authority/lifecycle, surfaces/inputs, and execution/tests. **No claim is made that these reconnaissance reviews substitute for the later mandatory stages.**

## Exact execution failure

The installed Windows Node runtime exposes neither the required `O_NOFOLLOW` nor `O_NONBLOCK` protection. Both validators intentionally reject this condition. Source locations: `validate-coverage-ledger.cjs:724` onward and `validate-findings.cjs:604` onward.

Executed commands, each returning exit code 1:

```powershell
node "C:\Leadsedge Portal\Skills\security-audit-skill-main\security-audit-skill-main\skills\security-audit\validate-coverage-ledger.cjs" "C:\Users\adeel_utu7nye\security-audit-skill\Leadsedge-Portal\run-1\coverage-ledger.json"
node "C:\Leadsedge Portal\Skills\security-audit-skill-main\security-audit-skill-main\skills\security-audit\validate-findings.cjs" "C:\Users\adeel_utu7nye\security-audit-skill\Leadsedge-Portal\run-1\findings.json"
```

Exact errors:

```text
Failed to read coverage ledger: OS no-follow and nonblocking input protection is unavailable
Failed to read findings JSON: OS no-follow and nonblocking input protection is unavailable
```

The input arrays were compatibility probes, **not a passed empty-findings audit**. The skill requires validated output or `run_status: "incomplete"` with the exact reason. File-opening protections were not bypassed, validators were not patched, and an invalid ledger was not used to dispatch a formal hunting wave.

`Get-Command wsl,docker` found WSL's launcher but no Docker command. `wsl --list --quiet` exited 1 and reported that Windows Subsystem for Linux is not installed. No environment or dependency was installed or upgraded.

Separately, this session could not establish all required OS-enforced controls: empty allowlisted environment, no external network, isolated loopback, read-only target/toolchain, scratch-only writes, and bounded CPU/memory/process/file/disk/wall resources. Therefore target code, builds, tests, exploit fixtures, and live-service probes were not executed. Read-only Git/file utilities and the parent-authored secret scanner were used; the scanner imports only Node built-ins, not application modules.

## Scope and command record

Source review covered `app`, `components`, `lib`, `supabase/migrations`, `scripts`, `tests`, `proxy.ts`, package/lockfile declarations, and Next/Vite configuration. Review included API and page entry inventories, browser inputs/sinks, SQL functions/policies, privileged jobs, local operational tools, and test limitations. This is reconnaissance-level repository coverage with targeted source tracing, not validated attack-class coverage for every line or function.

Commands/tools used, with repeated file reads/searches grouped:

* `Get-Location`, `git status --short`, branch/HEAD inspection, `git rev-list --count --all`.
* `rg --files` and `rg -n` for routes, authorization, cookies, redirects, SQL definitions/grants, HTML/URL/command sinks, headers, logging, tests and configuration; `Get-Content -LiteralPath` for source and skill instructions.
* The two exact validator commands above, Windows file-flag inspection, `Get-Command wsl,docker`, `wsl --list --quiet`.
* `git rev-list --objects --all`, `git cat-file -s`, and `git cat-file blob` inside the bounded scanner; values were never echoed.
* `node C:\Users\adeel_utu7nye\security-audit-skill\Leadsedge-Portal\run-1\scan-secrets.cjs`.
* `Get-FileHash -Algorithm SHA256` for the skill identity; `Get-Date -Format o`.
* Report creation and run-metadata updates only. Two exploratory reads of nonexistent `lib/http.ts` and `lib/api.ts` failed harmlessly; actual route/helpers were inspected instead.

No `npm audit`, package registry/advisory request, install, app test/build, browser request, Supabase request, email send, token generation, or deployment command ran. No live configuration, database contents, provider logs, effective grants/publications, TLS/proxy behavior, or external mail templates were inspected. Existing earlier test results are not credited as security validation here.

Files written: this report plus external run metadata, compatibility-probe JSON files, and scanner/source-summary artifacts under the run directory. Skill validators themselves made no source changes. No application source changed.

## Findings accounting

| Severity | CONFIRMED | LIKELY |
|---|---:|---:|
| CRITICAL | 0 | 0 |
| HIGH | 0 | 0 |
| MEDIUM | 0 | 0 |
| LOW | 0 | 0 |

There are **five NEEDS MANUAL VALIDATION / hardening items**, not five demonstrated vulnerabilities. Their severity is unassigned pending validation, consistent with the skill's evidence requirements. There is one rejected vulnerability candidate described below. Missing runtime validation prevents a meaningful exhaustive vulnerability count.

## Top five outstanding items

### V-01 — Validate deployed isolation and privileged function boundaries

* **Status:** NEEDS MANUAL VALIDATION. **Severity:** unassigned. **Priority:** P0 validation gate.
* **References:** `supabase/migrations/202608290001_harden_client_project_isolation.sql:11,31,78,128`; `supabase/migrations/202609040001_harden_disabled_client_membership.sql:5`; `202608280001_message_classification_and_feedback_submission.sql:25,37,99`; `lib/client-access.ts:34,49`; `lib/realtime-sync.ts:48,64`.
* **Concern/attack scenario:** A client with a valid access token can call Supabase directly, bypassing UI/API filtering. Missing or drifted live policies/grants could expose another client's tasks, messages, meetings, receipts or events. Source migrations alone do not prove effective deployment state.
* **Mitigation observed:** Current source checks assignment, membership, disabled status, visibility, draft/archive state; message and read-receipt RPCs call access helpers. Browser recipient filters are additional routing, not authorization.
* **Needed evidence:** Read-only deployed policy/grant/publication comparison plus an isolated two-client test covering direct REST/RPC and actual foreign Realtime event delivery, including disabled clients. Current source-string/fake-transport tests cannot establish this.
* **Recommended action/change domain:** Validate first; change DB/RLS only if a concrete mismatch is found and separately approved. No RLS change is proposed by this report.

### V-02 — Dependency vulnerability status is unknown

* **Status:** NEEDS MANUAL VALIDATION. **Severity:** unassigned. **Priority:** P0 validation gate.
* **References:** `package.json:22,50`, `package-lock.json`, `vite.config.ts`, `next.config.ts:3`.
* **Concern/attack scenario:** A reachable framework/RSC, parser or server dependency vulnerability could affect unauthenticated or authenticated requests. No particular CVE or vulnerable installed version is asserted.
* **Mitigation observed:** Lockfile, declared Node floor, explicit package versions for several runtime/build dependencies and an installation-script allowlist. These do not establish advisory clearance.
* **Needed evidence:** Exact locked dependency graph checked against a current advisory snapshot, then reachability assessment distinguishing build-only dependencies from standalone server code. The skill's no-network rule prevented registry/advisory queries; no freshness claim is made from memory.
* **Recommended action/change domain:** Repeat in an approved compliant environment with an available advisory dataset. No upgrade or application change without a verified finding.

### V-03 — Global response headers and proxy/cookie enforcement are unverified

* **Status:** NEEDS MANUAL VALIDATION / hardening. **Severity:** unassigned. **Priority:** P1.
* **References:** `next.config.ts:3`; `proxy.ts:33`; `app/auth/confirm/route.ts:39–41`; `app/auth/callback/route.ts:16`; `lib/request-origin.ts:22`.
* **Concern/attack scenario:** If deployment supplies no framing policy, an attacker could frame an authenticated UI where browser cookie rules allow it. Missing global CSP/referrer/MIME controls reduce defense in depth. Proxy misconfiguration could also affect origin and cookie handling. None was demonstrated on the deployed site.
* **Mitigation observed:** Confirmation explicitly sets no-referrer, nosniff, and restrictive CSP including `frame-ancestors 'none'`; callbacks set no-referrer. Forwarded origin headers are opt-in. Configuration uses the app's configured origin for its matching host.
* **Needed evidence:** Actual HTTPS response headers on public and authenticated routes, cookie flags, cache headers, trusted-proxy header replacement and public-origin configuration. Repository search found no global CSP/HSTS/frame/permissions policy in the inspected app/config paths; Hostinger may add headers independently.
* **Recommended action/change domain:** Verify edge behavior, then add only missing compatible app/deployment headers. CSP needs RSC/runtime compatibility testing. Do not infer that local HTTP should use HSTS. No Auth/Hostinger changes made.

### V-04 — General API CSRF protection depends on deployed browser/session behavior

* **Status:** NEEDS MANUAL VALIDATION / hardening. **Severity:** unassigned. **Priority:** P1.
* **References:** `app/api/portal/tasks/[taskId]/submit/route.ts:9–18`; `app/api/admin/tasks/[taskId]/route.ts:9–17`; `app/auth/confirm/route.ts:319–347`; `lib/supabase/server.ts:8`; `app/auth/sign-out/route.ts:4`.
* **Concern/attack scenario:** Several mutations parse JSON without an explicit common Origin/content-type gate. Whether a hostile site or same-site sibling could submit a credentialed mutation depends on effective cookies, hosting boundaries, browser behavior and framework protection. Cross-origin response reading is not necessary for CSRF. A confirmed exploit was not established. GET sign-out also permits a state-changing navigation, whose impact is sign-out rather than privilege escalation.
* **Mitigation observed:** API role checks and RLS remain in place; these prevent impersonating another database principal but are not themselves CSRF defenses. Confirmation has an explicit origin/fetch-site gate plus state cookie and nonce. Cookie policy may block ordinary cross-site attacks.
* **Needed evidence:** A bounded browser test of form/simple requests and same-site sibling conditions, with deployed cookie attributes and server body/content-type rules. Do not report all JSON routes vulnerable solely because no explicit Origin check appears.
* **Recommended action/change domain:** If needed, centralize strict mutation-origin/content-type enforcement and use POST for sign-out. Application/config scope; preserve working confirmation behavior. No auth edit performed.

### V-05 — Some client-controlled submission bounds are not explicit

* **Status:** NEEDS MANUAL VALIDATION / hardening. **Severity:** unassigned. **Priority:** P2.
* **References:** `lib/validation.ts:52`; `app/api/portal/tasks/[taskId]/submit/route.ts:13,18`; `supabase/migrations/202608280001_message_classification_and_feedback_submission.sql:159,186,200`; template-task route schemas at `app/api/admin/templates/[templateId]/tasks/route.ts:8` and its `[taskId]/route.ts:8`.
* **Concern/attack scenario:** An authorized client submitting its own task can supply a record of strings/string arrays without application-level answer-count/string-length limits in that schema. Oversized valid JSON could consume parsing/storage resources if upstream or database limits do not bound it. Admin template schemas also omit some field/option count limits, but require an already trusted admin.
* **Mitigation observed:** Role and task access checks, SQL required-answer/choice validation, bounded ordinary message/task text, and any actual server/proxy limits. No exhaustion or storage-growth impact was measured.
* **Needed evidence:** Establish effective request-size and SQL field bounds, then run bounded local rejection tests in the required sandbox. Review direct RPC submissions as a sibling to the API.
* **Recommended action/change domain:** Consistent request and answer limits if gaps remain; app/config first, database enforcement only if needed and separately approved. No schema mutation proposed now.

## Source review results by security area

### Authentication, session state and redirect handling

`app/api/auth/magic-link/route.ts:36,48` uses `shouldCreateUser:false` and generic responses. `lib/auth.ts:19,61` resolves verified claims and current database profile/role; proxy refresh is explicitly not the authorization boundary. The hardened signup trigger assigns client role rather than trusting user metadata (`202608260002_harden_first_admin.sql:10`).

Confirmation uses a short-lived HttpOnly SameSite state cookie, nonce validation and origin checks. GET renders without calling the token consumer; POST selects TokenHash verification or code exchange. `lib/auth-session.ts:19–56` validates role/client state and signs out rejected sessions. `lib/auth-flow.ts:37,50` constrains internal destinations by role. Response-bound cookie handling is retained. Actual cookie attributes under production TLS, callback allowlists, replay behavior and provider email templates were not tested.

First-admin setup requires authentication, serialized creation and no existing admin (`202608260002_harden_first_admin.sql:23`). It is intentional bootstrap authority, not evidence that clients can promote themselves after an admin exists. Demo mode is explicit (`lib/env.ts:37`); actual production environment must keep it disabled. No auth-bypass finding was confirmed.

### Authorization, RLS, object IDs and destructive operations

Source-defined RLS is enabled for core tables. Latest membership/task policies narrow earlier definitions; evaluating only an old migration would give misleading results. Task completion checks the current client, assignment, active membership and row state. Feedback RPCs validate task access/state and submitted choices. Meeting policies include ownership or authorized client membership. Admin-only routes check current role before mutations; task updates validate membership and allowed fields.

The service-role project-delete path passes through a function that checks admin identity, exact project-name confirmation and related membership constraints (`202608270001_single_lead_workflow.sql:499,533`). Service-role tooling exists in scripts and server helpers, so deployment exclusion and secret containment remain important. No manipulated-ID exploit was demonstrated. See V-01 for the live enforcement gap.

### Messages, receipts, caching and Realtime

Message APIs resolve authorized project/task scopes; SQL insertion/read-state helpers enforce the access boundary. Recipient-filtered receipt/notification subscriptions and session matching are visible in `lib/realtime-sync.ts:48–80`. Query keys include viewer/role and cache teardown follows logout/account/lifecycle changes (`components/query-provider.tsx:24`). Realtime tests use simulated transport rather than real foreign-client delivery.

Request read deduplication uses a server-generated request ID: `proxy.ts:7–11` overwrites the incoming ID, and `lib/perf.ts` bounds the map. A client-controlled shared correlation-ID cache leak was therefore not established from this path. Runtime proxy coverage and live RLS remain unverified.

### Injection, email, OAuth and automation

Task/template HTML is sanitized on writes and query mapping with an element/attribute/scheme allowlist before HTML rendering (`lib/queries.ts:10,123,160,209`). Email helpers escape HTML fields and action URL attributes (`lib/email.ts:16,173,204`). No application shell execution, eval, filesystem-upload path or dynamic SQL execution sink was identified in the searched app/lib/components paths. This is a source-search observation, not a universal proof against injection.

Google OAuth uses state checking and encrypted refresh-token storage with AES-256-GCM (`lib/calendar.ts:41`; calendar callback route). Automation requires its configured bearer secret (`app/api/cron/automation/route.ts:5–9`); privileged jobs have restricted grants. Email outbox processing is bounded per batch. Actual credentials, delivery templates, redirects and replay protections at providers were not inspected.

### Rejected candidate / FALSE POSITIVE

**FP-01: Public invocation of `queue_feedback_email` through SECURITY DEFINER.** Initial inspection of the privileged helper at `202608270003_phase2_automation_and_meetings.sql:159` suggested that a caller-supplied composite task might enqueue unauthorized email. The same migration explicitly revokes all function access from `public`, `anon` and `authenticated` at line 380. No later repository grant reopening that helper was found. **Status: FALSE POSITIVE against repository-defined grants; severity: none.** Direct public execution is not supported by this source evidence. No remediation is recommended; live grant drift is covered by V-01.

## Dependency and secret scanning details

Declared stack includes Node >=22.13, React 19.2.6, Vinext 1.0.0-beta.3, Vite 8.0.13 and Supabase/Next/RSC packages. These are declarations, not an advisory verdict or deployed-version attestation. No package was called vulnerable merely for being beta or outdated. Dependency CVE coverage is explicitly absent (V-02).

Secret scanner results:

| Metric | Result |
|---|---:|
| Reachable Git commits | 12 |
| Unique selected historical text blobs | 482 |
| Historical text bytes examined | 3,175,841 |
| Size-budget skips | 0 |
| Built files examined | 73 |
| Private current environment values compared in memory | 6 |
| Matches | 0 |

Patterns covered private-key headers, Supabase secret keys, service-role JWTs, selected Resend/GitHub token formats, and exact current private values. Historical blob selection used text/source/config extensions, bounded at 5 MiB per blob and 100 MiB total. Build scanning covered supported text files under existing `dist/client` and `dist/standalone/public`, bounded at 10 MiB per file. It did not scan unreachable Git objects, every ignored work file, arbitrary binaries/archives, provider logs, external backups, or all possible credential formats/encodings. Built artifacts were not regenerated or proven identical to a deployed release.

Only `.env.example` was tracked among environment files; tracked private-key filename checks found none. `.gitignore` excludes local environment files, work, build/dependency outputs, Skills and PEM files. Ignore rules do not retroactively remove historical secrets; the history scan was separate. No secret value, token, authorization code, cookie or verifier appears in this report.

## Testing and production posture

Auth tests use mocked Supabase/cookies; client-isolation tests include SQL source assertions; Realtime tests use fake transport. Those provide useful regressions but cannot establish deployed DB policies, concurrency, cookies or event authorization. No tests/build were run in this audit because the skill's execution safety requirements could not be satisfied. No live requests were sent to the running Node server or Frankfurt, and no Seoul/Tokyo resources were contacted.

No confirmed exploit currently blocks production on the evidence collected. **The incomplete audit, unknown dependency advisories and unvalidated deployed isolation prevent this report from clearing production.** A missing validation result is not a proven production vulnerability and must not be represented as one.

## Recommended order — no fixes implemented

| Priority | Action |
|---|---|
| P0 | Complete the documented skill in a compliant Linux sandbox with its file protections; finish coverage, hunters/critics, independent verification and validated records. |
| P0 | Validate effective Frankfurt authorization/grants/Realtime isolation and exact deployed dependency advisories before treating this audit as a release gate passed. |
| P1 | Inspect production headers, cookies, trusted proxy behavior, demo/debug configuration and mutation CSRF behavior; fix only demonstrated gaps. |
| P2 | Establish consistent request/answer bounds and strengthen runtime isolation regression tests in an isolated environment. |
| P3 | Retain automated secret scans and exact lockfile/SBOM evidence in release review; keep service-role performance/demo/backup utilities out of public deployment artifacts. |

Do not change Auth, RLS, schema, provider settings or dependencies solely from these unvalidated items. Obtain any required approval for subsequent environment-specific tests or remediation. The app and running server have been left untouched for manual use.
