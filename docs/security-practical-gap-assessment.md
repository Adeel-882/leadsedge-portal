# LeadsEdge practical security decision

Assessment: 2026-10-05, Asia/Karachi. Repository: `C:\Leadsedge Portal`, branch `main`, commit `77af4b9261e217bb6c521bfca686f94d4a0aea28`.

The previous report was read in full. This assessment is a separate, user-authorized investigation using current source, focused tests, live read-only Frankfurt queries and public Hostinger HTTP responses. It is not a rerun or completion of the Cloudflare skill. Its Windows validator failure says nothing about application security and is not a launch blocker.

## Executive decision

**There is concrete evidence of a production authorization gap in the live task mutation RPCs. There is no demonstrated successful unauthorized mutation or cross-client data leak from this pass.** The distinction matters: six real client identities passed direct database read-isolation checks, but privileged mutation functions do not enforce all of the restrictions enforced by the API and read policies.

The clearest pre-launch action is a narrowly scoped review/test and fix of disabled-client and task-visibility enforcement in `complete_project_task` and `submit_lead_feedback`. These live SECURITY DEFINER functions execute as an RLS-bypassing owner. Their current checks allow assignment/membership to stand in for full task authorization. Do not rewrite the working RLS policies or authentication system.

Other results are reassuring or lower priority: the current dependency audit returned zero known advisories; the deployed public admin/API routes deny anonymous access; local demo mode is disabled; and sampled helper/config paths are not publicly served. Missing production headers and feedback bounds are real hardening gaps, but neither establishes an exploitable session attack or denial of service.

**Launch recommendation:** resolve the task-RPC authorization defect before relying on client disabling or hiding a task as a security boundary. Finish a small authenticated HTTPS cookie/CSRF check and Realtime isolation test. Do not delay launch solely to install Linux or make the formal audit validator run.

## Findings table

| Item | Audit concern | What source/current evidence protects | What remains unverified | Realistic risk | Classification | Production priority | Recommended next action |
|---|---|---|---|---|---|---|---|
| V-01 | Isolation / privileged functions | All 24 live public tables have RLS; six client roles each saw their own project and zero foreign rows across seven resource categories; dangerous job/delete/email helper grants are restricted | Actual disabled JWT session and mutation outcome; live Realtime event delivery; other RPC paths not exhaustively tested | Disabled client with a still-valid token can bypass API checks by calling permissive task RPCs; hidden assigned task can be targeted by known ID | **REAL GAP in task RPC authorization; read isolation VALIDATED SAFE within tested scope** | **Before launch: targeted DB function correction and regression** | Preserve read policies; approve isolated mutation proof and narrow new migration after reviewing exact change |
| V-02 | Dependency advisories | Actual current `npm audit --json --ignore-scripts`: zero vulnerabilities, including dev dependencies | Unknown/unreported vulnerabilities; exact Hostinger installed release equivalence | No verified advisory requiring an upgrade today | **ALREADY MITIGATED for known advisories in audited graph** | Routine maintenance | Retain lockfile, repeat at release; no upgrade recommended |
| V-03 | Headers / cookies / proxy | HTTPS available; HTTP redirects to HTTPS; sign-in is no-store; confirmation source has strong dedicated headers | Authenticated Hostinger cookies, proxy forwarding settings, authenticated document/cache headers | Missing frame protection; possible transport exposure if real auth cookies lack Secure; neither demonstrated as an exploit | **REAL GAP in sampled header baseline; cookie/proxy VALIDATION NEEDED** | Small baseline improvement soon; cookie check before launch | Verify cookies, add modest centralized headers after approval; avoid strict script CSP |
| V-04 | CSRF | Explicit SDK SameSite=Lax; confirmation origin/state/nonce guard; API role checks | Credentialed hostile-origin/same-site sibling request behavior on actual deployment | Ordinary unrelated-site POST is substantially mitigated; same-site attacker conditions unresolved | **LOW-PRIORITY HARDENING, with focused browser validation outstanding** | Below task RPCs | No scattered route checks; add one guard only if justified by test |
| V-05 | Request / answer bounds | Authentication/task ownership, workflow state, required answers/choice checks, normal message bounds, one-time feedback submission | Hostinger request cap and resource impact | Excessive legitimate-shaped feedback can consume parsing/storage; no measured DoS | **REAL GAP in field bounds; low-cost robustness improvement** | Soon, not a demonstrated launch-blocking exploit | Bound answer keys/text/arrays and body size; account for direct RPC callers |

## Evidence: live Frankfurt isolation

Connected through the existing Frankfurt pooler only, guarded by project-reference equality and `eu-central-1`. All queries ran inside `BEGIN READ ONLY`, with a statement timeout and final rollback. No identity, status, row, policy, grant, setting or publication changed. No sign-in token/email was generated.

Read the current catalog, policy expressions, selected function definitions/owners/execute privileges and publication. Public table counts: 7 projects, 16 tasks, 53 project messages, 128 task messages, 2 meetings, 181 receipts and 208 notifications. All 24 public tables have RLS enabled. The publication contains `project_tasks`, `task_messages`, `project_messages`, `notifications`, `message_read_receipts`.

For each of **six existing active clients**, set the database role to `authenticated` and transaction-local JWT subject/claims to that client's existing Auth UUID. Baseline authorized project/task ID sets were determined before dropping privileges. Queries then ran as the client database role, not the service role. This directly tests PostgreSQL policy enforcement beyond the UI; it does **not** test JWT signature validation or HTTP token transport.

| Check | Result across all six clients |
|---|---|
| Current role / admin predicate | `authenticated` / false |
| Own projects visible | 1 each |
| Foreign projects | 0 each |
| Foreign assigned/visible tasks | 0 each |
| Foreign project messages | 0 each |
| Foreign task messages | 0 each |
| Foreign meetings | 0 each |
| Other recipients' receipts | 0 each |
| Other users' notifications | 0 each |

An anonymous role with empty subject also saw zero projects, tasks, project messages, meetings, receipts and notifications. These are successful direct read-isolation results, not a claim that every write/RPC is safe.

There are **zero disabled clients** in the current database. No client was disabled for testing. There are also zero future scheduled meetings. Disabled-session and successful meeting-mutation tests therefore were not performed. No Realtime-producing writes were made, so actual foreign WebSocket event delivery remains untested. Browser filters are not credited as a substitute for RLS.

Live `queue_feedback_email`, `process_due_feedback_requests_job`, and `delete_project_bundle_admin` deny EXECUTE to anon and authenticated. This validates the earlier email-helper false-positive dismissal against the live catalog, not only migrations.

## The specific pre-launch gap: direct task RPC authorization

### What the live definitions prove

* `public.current_client_id()` selects the client by `auth.uid()` and **does not filter disabled status**.
* `public.complete_project_task(uuid)` checks task existence/unarchived state, non-null current client, active task, completion requirement, matching assignee and project membership. It **does not check client status or `client_visible`**.
* `public.submit_lead_feedback(uuid,jsonb)` checks current client, assignment, membership and feedback availability/one-time state. It **does not check client status or client visibility** and does not mirror the API's non-draft rule.
* These three functions are SECURITY DEFINER, owned by `postgres`; the live owner has `rolbypassrls=true`. Authenticated callers have EXECUTE. The membership reads inside these functions therefore do not inherit the caller's restrictive membership RLS.
* In contrast, `lib/client-access.ts:34–49` explicitly rejects disabled, invisible, draft or archived task access. The portal API's guard cannot protect the independently callable Supabase RPC.

Source counterparts: `supabase/migrations/202608260001_phase1.sql` (`current_client_id`), `202608290001_harden_client_project_isolation.sql:31` (completion), `202608280001_message_classification_and_feedback_submission.sql:159` (feedback). Live definitions were inspected rather than assumed to match.

### Realistic scenario and limits

A client already knows an assigned task ID and retains a valid JWT after the administrator disables their public client record or hides an otherwise active task. A direct RPC call skips the portal API. The live function checks still accept assignment and membership without checking the changed restriction. Completing the task can change workflow state and queue notifications; submitting requested feedback has analogous missing authorization.

Nine existing active assigned tasks matched the completion predicate in SELECT-only inspection; all nine currently have `client_visible=true`. This demonstrates ordinary eligible data exists, **not a successful disabled/hidden-task exploit**. No mutation was invoked, no client disabled, and no hidden eligible fixture created. Provider account banning/token revocation could additionally stop a session, but this assessment did not establish that changing `public.clients.status` performs either operation. It should not be required to make application disabling effective.

**Decision:** a confirmed missing authorization condition in a reachable live privileged function, with a well-supported bypass path; destructive end-to-end proof intentionally not attempted. Treat it as the one concrete pre-launch authorization correction. It is not evidence of arbitrary other-client access or admin escalation.

**Proposed direction only:** a new migration adding an explicit active/allowed-client and task-access gate to these RPCs, preserving existing workflow timing, feedback state, return types, ordering and copy semantics. Reuse a suitable task access predicate where it exactly matches product rules; do not accidentally authorize admins to perform client-only actions. Review invited-versus-active semantics before choosing a status check. No migration was authored or applied in this assessment.

### A separate suspicious branch that is not a confirmed cancellation exploit

The live `cancel_meeting` grants anon EXECUTE and uses nullable `auth.uid() <> ...` comparisons. A null subject does not make that rejection expression true. However, its subsequent activity insertion concatenates a missing actor name into a **NOT NULL** `project_activity.body`; an anonymous call reaching that point would error and roll back. No future scheduled meeting was available to test, and no cancellation was attempted. Do not report this as demonstrated unauthenticated cancellation. Explicit authentication/restricted grants would be sensible when reviewing RPC boundaries, but it is secondary to the task gap and needs a focused test.

## Dependencies: actual advisory check

Ran `npm audit --json --ignore-scripts` against the current lockfile. Exit 0: **0 info, low, moderate, high or critical findings**. The returned graph reports 626 total dependencies, 50 production, 538 development, 117 optional and 43 peer entries; categories overlap.

No verified advisories therefore required runtime/dev reachability triage or an upgrade recommendation. This does not guarantee absence of zero-days or certify that Hostinger is running the identical lockfile. No install, upgrade or lockfile edit occurred. The registry received normal audit package metadata, not repository source or secrets.

## Actual Hostinger headers and exposed paths

Assessed `https://khaki-crocodile-610570.hostingersite.com` using ordinary public HTTP requests with no credentials. This is the observed hosting URL, not a claim about an uninspected future custom domain.

| Path | Status / behavior |
|---|---|
| `/auth/sign-in` | 200; `Cache-Control: no-store, must-revalidate` |
| `/admin` | 307 to `/auth/sign-in?next=/admin` |
| `/portal` | 307 to `/auth/sign-in?next=/portal` |
| `/api/admin/messages/inbox` | 403 |
| `/scripts/create-sign-in-link.mjs` (HEAD) | 404 |
| `/work/sign-in-link.txt` (HEAD) | 404 |
| `/.env.frankfurt.local` (HEAD) | 403; contents not fetched |
| HTTP sign-in | 301 to HTTPS sign-in |

The four initial HTTPS responses all had `Content-Security-Policy: upgrade-insecure-requests`, but **no HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options or Permissions-Policy**. That CSP does not supply `frame-ancestors` or a script policy. The redirects/API denial did not provide Cache-Control. Authenticated response caching was not tested. No Set-Cookie was issued on these anonymous responses.

Small safe baseline proposal: centralized `nosniff`, a sensible referrer policy and `frame-ancestors 'none'`/equivalent framing restriction if the portal is not intentionally embedded. Consider HSTS only with deployment/domain ownership and HTTPS coverage understood; do not blindly enable includeSubDomains/preload. A strict script CSP is not a quick win for this Vinext/RSC/Realtime app. Permissions-Policy is lower value than authorization and session transport checks.

## Cookies, CSRF and browser evidence

Installed `@supabase/ssr/src/utils/constants.ts` explicitly uses `sameSite: 'lax'`, `httpOnly: false`, and no default Secure flag. The app's ordinary server and browser clients do not supply overriding cookie options (`lib/supabase/server.ts`, `response-bound.ts`, `client.ts`). The confirmation state cookie separately requests HttpOnly and conditionally Secure (`app/auth/confirm/route.ts:48`). **Do not confuse the confirmation cookie with the session cookies.**

JavaScript-readable Supabase sessions support this app's browser client/Realtime refresh behavior; blindly forcing HttpOnly would be an architecture change, not a free security fix. Supabase documents this tradeoff in its [SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

Explicit SameSite=Lax substantially mitigates ordinary unrelated-site POST CSRF. The more permissive recent-cookie behavior of browsers' *default* Lax treatment should not be confused with an explicit Lax attribute. Lax is a site boundary, not an origin boundary, so an attacker-controlled same-site sibling remains a different case. See [MDN's cookie attribute reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

The available browser session was local `127.0.0.1`, not authenticated Hostinger. I did not extract its credentials, generate new sessions, or send a live state-changing CSRF request. No Hostinger session-cookie Secure/HttpOnly/SameSite attestation is claimed. Verify actual session creation and browser refresh on HTTPS: **Secure is important and compatible with browser access**; HttpOnly is not interchangeable with Secure. HTTP redirect alone does not prevent an insecure cookie being sent on the first HTTP request.

Several JSON mutation routes do not explicitly enforce content type/origin. A plain-text JSON request can be parsed by `request.json()`, but that fact alone does not defeat SameSite. No exploitable credentialed mutation from an unrelated origin was established. GET sign-out can permit forced logout; that is nuisance/defense-in-depth, not account takeover. If browser testing demonstrates a meaningful gap, use one centralized unsafe-method origin/content-type guard, preserving callbacks, cron bearer requests and same-origin forms.

## Input bounds: measured gap, unmeasured impact

Evaluated the exact `formSubmissionSchema` expression from `lib/validation.ts:52` locally with Zod. It accepted all three bounded synthetic cases:

* One answer containing a 1 MiB string.
* 2,000 answer keys.
* One answer containing 10,000 array elements.

No payload was submitted to production or Frankfurt. The live feedback function stores submitted JSON after required-field/choice checks; the inspected table constraints contain no answer-size check. The installed Vinext App Route stream reader has no visible total-byte cap at `node_modules/vinext/dist/server/prod-server.js:124,560`. Pages API and Server Action limits must not be credited automatically to this App Route path. Actual Hostinger ingress limits remain unknown.

A client needs access to a requested feedback task, and one-time submission narrows repeated storage abuse. These mitigations make this less urgent than the privileged authorization gap. Suggested starting limits for review, not implementation: allow only template-defined keys; cap array choices by configured options; permit generous text answers (for example 10,000 characters) and a feedback body budget around 512 KiB, then reconcile with supported Unicode/form lengths and historical workflow needs. Do not silently truncate. Direct RPC validation matters too; an API-only limit is not a database boundary.

## Other high-value controls reviewed

* **Auth/redirects:** Preserve response-bound PKCE cookies, non-consuming confirmation GET, explicit POST consumption, state/nonce/origin checks, role-specific safe internal destinations, generic OTP response and `shouldCreateUser:false`. The public OTP route uses the public session client, not the service role. Existing tests passed; provider replay and email settings were not retested.
* **Service role:** Server helpers/privileged operational scripts retain credentials server-side. The preceding bounded history/build scan found no matches; this pass does not relabel that as an exhaustive deployed-bundle scan. Public helper-path checks above were negative. No secret exposure identified.
* **XSS/email:** Existing allowlisted HTML sanitization at write/read/render paths, scheme restrictions and escaped email interpolation are meaningful controls. No new executable payload or email-injection exploit was found. Do not remove or replace the sanitizer merely to satisfy a checklist.
* **Demo mode:** Local Frankfurt configuration explicitly has demo disabled. Anonymous production admin access redirected and admin inbox returned 403, which is inconsistent with the inspected demo bypass being active on those routes. Provider environment was not inspected directly. Keep release checks that demo remains off; no rewrite needed.
* **Realtime:** The live publication contains the expected five tables, with RLS enabled. Own-recipient subscriptions and session teardown are useful. Foreign-event delivery still needs a real two-client test; no publication change is indicated.

## Tests and artifacts

Focused existing tests: **7 files, 64 tests passed**: auth flow, confirmation, origin, callback, authorization, client-project isolation and validation. Initial sandbox execution failed with child-process EPERM; rerunning with approved execution permissions passed. These tests are still mocks/source contracts, not substitutes for live DB evidence.

Read-only evidence is saved under ignored `work/`: `phase9-security-catalog.sql/.txt`, `security-catalog.json`, `phase9-security-isolation.sql/.txt`, `phase9-security-rpc.sql/.txt`. Existing guarded `phase9-readonly.mjs` runs the queries with read-only transactions. Evidence contains schema/record identifiers but no tokens, cookie values, keys or passwords. No application source, lockfile, RLS/schema/Auth, hosting configuration or business data was changed. No running server was restarted. The earlier audit report was already untracked; it was preserved.

## Top three actual risks and decision order

1. **Direct task RPCs failing to honor client disabling/visibility.** Concrete live authorization defect; fix before launch after a tightly scoped approval/test.
2. **Session transport configuration not yet verified on authenticated Hostinger.** SDK source omits Secure by default and sampled site lacks HSTS. Confirm real cookies and correct Secure if absent; do not force HttpOnly or rewrite auth.
3. **Oversized client feedback reaching parsing/storage without explicit application/SQL bounds.** Demonstrated validation gap, not demonstrated DoS; modest limits are useful and much cheaper than infrastructure changes.

Missing frame headers are a safe small improvement alongside these. Known dependency vulnerabilities, arbitrary cross-client reads and service-role exposure were not found and should not be presented as existing risks of equal evidentiary strength.

## What to leave alone

Do not rewrite working auth/PKCE/TokenHash, role resolution, query-cache account isolation, message unread semantics, safe redirects, HTML sanitization, RLS read policies or Realtime publication. Do not upgrade dependencies solely for age/beta status. Do not install WSL/Docker solely to clear the previous validator failure. Do not introduce a strict CSP, blanket HttpOnly switch, Redis, or scattered CSRF checks.

## Safe quick wins and approval-required work

**Recommendations only:** modest centralized non-script headers; feedback bounds; repeat dependency audit at release; verify Secure cookies and demo-off behavior on the exact deployed build.

**Approval required before changes:** narrow DB function migration for the task gap (not a broad RLS redesign); any direct-RPC fixture mutation/disabled-client test; HTTPS cookie configuration changes; deployment/header policy; any dependency upgrade if a future advisory justifies it. No migration/upgrade/config edit has been made.

**Exact next step:** approve an isolated staging regression using a designated disposable task/client (or isolated database copy) to prove disabled and hidden-task RPC rejection/acceptance, then review a new minimal function-only migration addressing those gates. Preserve scheduling and all valid client behavior. Follow with authenticated HTTPS cookie inspection and a two-client Realtime test. Full script CSP, granular Permissions-Policy and cosmetic sign-out hardening can wait until after launch.
