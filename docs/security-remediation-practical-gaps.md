# Practical security remediation

Date: 2026-10-05 (Asia/Karachi). Workspace: `C:\Leadsedge Portal`.
Base commit: `77af4b9261e217bb6c521bfca686f94d4a0aea28`, branch `main`.

## Result

The direct task-RPC authorization gap was reproduced against live Frankfurt and fixed with one new function-only migration. All 25 controlled live regression cases passed afterward. Ordinary task completion, seven-day feedback scheduling, valid feedback and duplicate protection remain intact.

Two-client, unfiltered Supabase Realtime subscriptions delivered each client's own events and zero foreign events. The actual Hostinger HTTPS session cookie already has Secure; no authentication-cookie code was changed.

Application-only security headers and feedback limits are implemented, tested and built locally. **They have not been deployed.** Direct-RPC input-size validation remains an explicit unapplied proposal, as requested. This is not a claim that the application is fully secure.

## Scope and safety

Only Frankfurt was contacted for database/auth/Realtime tests. The existing project reference, staging flag, region and pooler host were checked before privileged operations. Existing synthetic clients ending `0007` and `0008` were used, not the primary demo client or administrator's business tasks.

RPC proof/regression fixtures, temporary client disabling, task mutations, notifications and email-outbox entries were contained in transactions ending in rollback. Uncommitted outbox entries were never available to the mail processor. Realtime used separate disposable projects/tasks and benign test messages; they and dependent rows were deleted afterward. Local HTTP rejection testing used another disposable task that was also deleted. Test sign-ins were generated without email; credentials stayed in memory and were never logged. Test sessions were signed out locally.

No RLS policies, Realtime publication, scheduling logic, template-copy behavior, message semantics, auth routes, PKCE/TokenHash logic, dependencies, SMTP, DNS or hosting settings were changed. No deploy, push or commit occurred. Earlier untracked audit reports were preserved.

## 1. Live proof before the fix

Tested the current functions under the actual `authenticated` database role with existing synthetic client JWT claims. Anonymous cancellation was tested under `anon` with an empty subject. These tests invoke the real PostgreSQL functions; they are not UI mocks. This role-based method isolates database authorization and does not itself test HTTP JWT signature verification.

| Case | Completion before | Feedback before | Expected |
|---|---|---|---|
| Active client, visible assigned task | Allowed | Allowed | Allowed |
| Disabled client | **Allowed** | **Allowed** | Denied |
| Hidden task | **Allowed** | **Allowed** | Denied |
| Draft task | Denied | **Allowed** | Denied |
| Foreign project/client task | Denied | Denied | Denied |
| Archived task | Denied | Denied | Denied |
| Wrong assignee | Denied | Denied | Denied |
| Unassigned task in client's project | **Allowed** | **Allowed** | Denied |
| No project membership | Denied | Denied | Denied |
| Administrator with no client identity | Denied | Denied | Denied |
| Anonymous caller | Denied internally | Denied internally | Denied |

The unassigned-task case exposed the SQL NULL behavior of `assignee_id <> current_client`: a null assignee did not make the rejection condition true. It is fixed within the same explicit assignment check.

Before-fix successes produced genuine workflow effects inside the transaction: completion timestamps, seven-day scheduling, one notification; valid feedback produced one notification and one outbox row. Each repeat was denied. Everything rolled back, including the disabled status and all task data.

Evidence: `work/security-rpc-before.txt`. Reusable SQL: `tests/security/task-rpc-live.sql`.

## 2. Exact applied migration and self-review

**Applied and recorded in Frankfurt migration history:**

`supabase/migrations/202610060001_harden_client_task_rpc_authorization.sql`

Only these public function definitions and their execute grants changed:

* `public.complete_project_task(uuid)`
* `public.submit_lead_feedback(uuid,jsonb)`

The migration was generated from freshly inspected live definitions. Before applying, a guard compared both current `pg_get_functiondef` results to the inspected originals and would have aborted on drift. A source comparison verified that the completion body from `if task_row.feedback_enabled then` onward and the feedback body from the one-time-submission check onward were unchanged. Thus scheduling, required/choice validation, notifications, outbox, state transitions and return contracts were preserved exactly.

Authorization additions:

1. Resolve the client through `auth.uid()` with `clients.status = 'active'` and linked `users.role = 'client'`.
2. Hold a shared lock on that client row while completing the transaction, serializing against a concurrent status update.
3. Require `client_visible` in both functions.
4. Require non-draft feedback tasks; completion retains its existing active-state and completion-required checks.
5. Use `assignee_id IS DISTINCT FROM current_client` to reject both mismatched and null assignees.
6. Preserve existing project membership, archived-task, availability and one-time gates.
7. Revoke PUBLIC/anon execution for these two functions; retain authenticated execution. Null subjects and non-client profiles also fail internal authorization.

`SECURITY DEFINER`, explicit `search_path=public`, signatures and return contracts remain. Switching to SECURITY INVOKER would require changing permissions for workflow-generated notifications/activity/outbox writes; that architecture was deliberately not changed.

The applied function definitions were read again. Both contain the new guards; anon execution is false and authenticated execution is true. Migration version `202610060001` is recorded with name `harden_client_task_rpc_authorization`. No old migration was edited, and no table constraint was added.

## 3. After-fix behavior and workflow regression

**25/25 controlled cases passed.** All task cases in the table above now match their expected result. Anonymous task RPC calls fail at permissions; authenticated disabled clients may invoke the endpoint but cannot perform the mutation.

Valid completion still:

* Changes the task to completed.
* Sets `feedback_scheduled_for = completed_at + interval '7 days'` exactly.
* Produces one notification.
* Rejects duplicate completion without extra side effects.

Valid feedback still:

* Stores the submission and advances feedback state.
* Produces one notification and one outbox entry.
* Rejects a second submission; side-effect counts remain one.

Live proof covers the database workflow used by the portal. API feedback tests additionally cover a normal form's successful 201 response and exactly one RPC call. A real built-server synthetic-client sign-in reached `/portal` with HTTP 200. A human browser click through ordinary completion/feedback was not performed; there is no claim of that additional UI test.

Reusable live command:

```powershell
node --env-file=.env.frankfurt.local tests/performance/security-task-rpc.mjs
```

It requires the existing local PostgreSQL CLI, guards Frankfurt, runs the rollback-only SQL and asserts the 25 results. Evidence: `work/security-rpc-after.txt`, `work/security-rpc-regression-result.json`.

## 4. Two-client Realtime isolation

Ran `tests/performance/security-realtime.mjs` using two real Supabase sessions and WebSocket subscriptions. These use the same Supabase client/Realtime protocol as the browser, but the harness runs in Node; it does not rely on the application's browser callback filters.

Subscriptions deliberately have **no project, task, recipient or row filters**. PostgreSQL/RLS/Realtime must enforce the boundary. For each synthetic client, created a separate temporary project/task, then generated a task UPDATE, project-message INSERT and task-message INSERT. The normal message triggers generated two receipts.

| Subscriber | Own task updates | Own project messages | Own task messages | Own receipts | Foreign events |
|---|---:|---:|---:|---:|---:|
| A | 1 | 1 | 1 | 2 | **0** |
| B | 1 | 1 | 1 | 2 | **0** |

Both positive controls passed; absence of foreign events was not caused by a dead subscription. Tested UPDATE/INSERT only; this is not a claim about all event types or future policies. No publication/filter patch was made.

Temporary projects and dependent rows were deleted; test sessions were signed out. Counts returned to the pre-test baseline: 7 projects, 16 tasks, 53 project messages, 128 task messages, 2 meetings, 181 receipts, 208 notifications. Client identifiers and statuses matched the original snapshot. No test email was sent.

Evidence: `work/security-realtime-result.json`; command:

```powershell
node --env-file=.env.frankfurt.local tests/performance/security-realtime.mjs
```

## 5. Production HTTPS session-cookie verification

Tested the actual deployed origin `https://khaki-crocodile-610570.hostingersite.com` using a no-email sign-in for synthetic client 7, the normal GET confirmation and nonce-protected POST, and the resulting authenticated portal request. Login returned 307 to `/portal`; portal returned 200. The isolated session was signed out afterward.

Observed attributes, with all cookie values omitted:

| Cookie | Secure | HttpOnly | SameSite | Path | Domain | Expiry |
|---|---|---|---|---|---|---|
| Supabase session | **Yes** | No | Lax | `/` | Absent: host-only | Max-Age 34,560,000 seconds (400 days) |
| Confirmation state | **Yes** | Yes | Lax | `/auth/confirm` | Absent: host-only | Max-Age 600 seconds; cleared after POST |

Cookie storage lifetime is not JWT validity or a guarantee that a session lasts 400 days. Refresh/provider session policy still governs validity. The probe inspected actual HTTPS response attributes; it did not wait for JWT expiry or exercise a browser's later automatic refresh cycle. Future refresh cookie attributes are a sensible release spot-check, not a currently observed failure.

The actual Secure attribute disproves the earlier inference that SDK defaults alone might imply insecure production issuance. **No cookie/auth architecture change was needed or made.** Local HTTP sign-in correctly omitted Secure and remained functional.

Evidence: `work/security-production-cookie-result.json` (attribute metadata only).

## 6. Modest centralized headers

Implemented in `next.config.ts`:

* `X-Content-Type-Options: nosniff`
* `Referrer-Policy: strict-origin-when-cross-origin`
* `X-Frame-Options: DENY`
* `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Auth paths explicitly retain `Referrer-Policy: no-referrer`. The actual confirmation response keeps its existing `default-src 'none' ... frame-ancestors 'none'` CSP. X-Frame-Options was chosen for the general baseline so it cannot overwrite that route-specific CSP or impose new script/style/connect restrictions. Hydration and WebSocket sources were not restricted.

No HSTS includeSubDomains/preload, strict script CSP or provider change was made. HSTS remains a separate final-domain/deployment decision; transport cookies are already Secure.

Real HTTP checks against the newly built standalone server:

| Response | Result |
|---|---|
| Sign-in 200 | All four baseline headers present |
| Admin inbox 403 | All four baseline headers present |
| Synthetic confirmation GET 200 | Baseline framing/nosniff/permissions present; existing stronger CSP and no-referrer preserved |
| Anonymous `/admin` 307 | Vinext redirect response omits the configured baseline headers |

The redirect omission is a framework response-path limitation, not silently marked fixed. It does not render a frameable authenticated page. A broader server/framework adjustment was not introduced for it.

**Before/after deployment distinction:** previous Hostinger responses lacked these baseline headers. Changes are now in the local build only; no Hostinger deployment occurred, so do not assume production received them.

## 7. Feedback/request limits

Implemented on the client feedback API:

* Stream-counted **512 KiB** maximum body; actual bytes are checked even without Content-Length or with a misleading header. Oversized input returns **413**.
* Maximum **30 answer keys**, matching the existing template/task field cap.
* Key length at most 80; text/array-string values at most **10,000 JavaScript string units**.
* Global array cap of **20**, plus the authorized task form's actual configured option count, allowed values and no duplicates.
* Unknown keys, wrong field types and missing required answers rejected with **400**.
* Validation uses the imported task's form snapshot, not the mutable reusable template.
* No silent truncation; user-facing error messages do not echo payloads.

The authorized task lookup now includes `form_schema` so validation does not introduce another Supabase query. Existing access checks remain. Ordinary form UI need not change.

Current Frankfurt shape check: maximum 5 fields, 10-character field IDs, 5 options, and 74-character existing text answers. Thus the new bounds exceed observed legitimate data and match the existing editor's larger supported limits.

Real authenticated local HTTP results against a disposable task:

| Payload | Status |
|---|---:|
| Body exceeding 512 KiB | 413 |
| 10,001-character answer | 400 |
| Unknown form key | 400 |

Unit tests also cover excess keys/arrays, duplicate/invalid choices, unknown keys, wrong types, UTF-8 byte counting, malformed JSON and exact boundaries. Evidence: `work/security-local-http-result.json`.

These are feedback-route limits, not a newly imposed global cap on unrelated endpoints.

### Direct RPC boundary — proposal, not applied

Direct authenticated RPC callers still bypass these API size limits. The authorization migration intentionally preserved the feedback validation/workflow suffix unchanged. No table constraint or additional SQL input-bound change was silently added.

Exact proposed validation sequence is in `docs/proposals/feedback-rpc-input-bounds.md`: object/512 KiB normalized-JSONB limit, 30 known keys, bounded correctly typed strings, checkbox option cardinality/membership/uniqueness, and existing required/one-time rules. It is **not applied** and needs review/approval plus Unicode/boundary regressions. This remains a P2 resource/storage-abuse risk for an authorized client with an available feedback task, not the fixed disabled/hidden-task bypass.

## 8. cancel_meeting conclusion

Tested a disposable future meeting within the same rollback-only transaction:

* Anonymous invocation: rejected with SQLSTATE **23502**, the downstream NOT NULL failure. The meeting remained scheduled after the exception; no cancellation persisted.
* Authenticated foreign client: rejected with **P0001**.
* Authorized client: cancellation succeeded within the test transaction, then rolled back.

This does **not** demonstrate exploitable anonymous cancellation. It confirms reliance on a downstream constraint rather than a sound explicit anonymous guard. Null-safe authorization and removing unnecessary anon execution remain sensible hardening proposals. **No change to this function or its grants was made**, honoring the stop-before-grants requirement.

## 9. Validation summary

| Check | Result |
|---|---|
| Full `npm test` | **353 tests / 42 files passed** |
| Live RPC/cancellation regression | **25 cases passed** |
| Two-client unfiltered Realtime | Own-event controls passed; **0 foreign events** each direction |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build:frankfurt` | Passed; standalone output generated |
| Real local HTTP | Sign-in/portal successful; headers and rejection statuses verified |
| Production HTTPS cookie probe | Secure verified; sign-in/portal successful |
| Live function/grant reread | New guards verified; anon false, authenticated true |
| Git whitespace check | No whitespace errors; existing Windows line-ending notices only |

An initial new-test syntax error and a test-only HeadersInit typing error were corrected. The final build uses the corrected tests/types. Build output contains plugin timing advisories, not build failures.

The original verified Frankfurt server was stopped before building. One replacement listener is running on port 3000, PID **25212**, with command `node --env-file=.env.frankfurt.local dist/standalone/server.js`, started through `npm run start:frankfurt`. Local URL: `http://127.0.0.1:3000`.

## 10. Remaining risks / launch decision

**The reproduced P0 task authorization bypass is fixed in Frankfurt.** No remaining demonstrated cross-client read/event leak, admin escalation, insecure issued HTTPS session cookie or unauthorized cancellation emerged from these tests.

Outstanding work is explicit:

1. Deploy the application header/feedback changes through the normal approval process; they are currently local only. Repeat deployed header/HTTP checks after release.
2. Review/approve direct-RPC feedback bounds; API-only limits do not close that resource boundary.
3. Spot-check actual browser refresh cookie attributes and normal UI completion/feedback after deployment. Initial production cookie issuance is already verified Secure.
4. Treat cancel_meeting's nullable anonymous guard as hardening, with a separate approved change; its tested transaction currently rolls back.
5. Decide HSTS for the final production domain, and optionally address Vinext's header omission on redirect responses. Neither justifies changing the working auth flow now.

There is no remaining **demonstrated P0 blocker from this scope**. Release readiness still requires deploying the approved application changes and accepting or closing the explicitly deferred P2 direct-RPC bounds. Do not describe the project as fully secure or the earlier formal Cloudflare audit as completed.
