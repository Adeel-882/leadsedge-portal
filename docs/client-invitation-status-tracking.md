# Client invitation status — local release checkpoint

## Result and cause

Prepared locally on November 19, 2026. **Not applied to Frankfurt, pushed, or deployed.**

The overview previously selected only `email_deliveries.status/created_at`, displaying Sent or Failed. Neither that table nor `auth.users.last_sign_in_at` correlates a particular invitation with successful portal authorization. Inferring invitation use from either would mislabel scanner visits, later resends, and unrelated logins.

## Read-only Frankfurt evidence

- Guarded project `tfrljxzknnhkynobvetg`, region `eu-central-1` against `.env.frankfurt.local` and the Frankfurt pooler identity.
- Management API returned `mailer_otp_exp = 86400`. No Auth configuration changed.
- Inspected live `email_deliveries`, `clients`, `project_clients` columns, grants, RLS policies, triggers, and the definitions/ACLs of `is_admin`, `activate_current_client`, and `create_project_bundle`.
- Relevant delivery schema matches the original repository table: UUID ID, client/project associations, provider ID, sent/failed status, error text, and creation timestamp. No expiry or successful-use field exists. Delivery RLS is enabled with the existing admin-read policy; there are no non-internal delivery triggers.
- There were 16 historical client-invitation delivery records, all marked sent. No contents, Auth records, or credentials were exported.
- Proposed table is absent; all three proposed function names are unused. Migration `202611190001` is absent from live migration history. The live ledger ends at `202610060001`; later changes elsewhere may have been applied outside that ledger. Do not use a bulk migration command or treat ledger absence alone as proof of schema absence.
- Safe catalog evidence: `work/invitation-status-audit.json`, `work/invitation-tracking-preflight.json` (gitignored). Read-only transactions ended with rollback.

## Implementation

One additive table stores independent invitation attempts with a generated UUID, intended client/project/Auth-user associations, issuance/expected-expiry timestamps, delivery result, existing delivery-history ID, and first successful sign-in timestamp. It stores only a SHA-256 fingerprint of a domain-separated credential type and token hash—not the token hash itself. This fingerprint cannot authenticate with Supabase. No tracking ID is added to URLs or trusted from a browser.

Preparation occurs before the email is sent. New-client project creation and existing-account resend both call the same helper after their existing identity and role checks. No client/project duplication logic or bundle RPC was changed. A failed preparation sends no email. Provider results and the existing `email_deliveries` record are finalized atomically. Finalization is idempotent. Network ambiguity remains pending/unavailable, not falsely labelled as accepted or rejected; no automatic email retries were added.

The only successful-use hook is in `/auth/confirm` POST, **after** `verifyOtp` returns both a user and session and `completeAuthenticatedSession` succeeds. It sends the fingerprint and verified user ID to a service-only RPC. The RPC independently checks the stored Auth identity, client role, active client status, and membership in the invitation's specific project, then records database time. It preserves the first timestamp on repeat calls.

GET is unchanged and non-consuming. Nonces, origin checks, cookies, token verification, activation, and role-based destinations are unchanged. Administrator sign-ins and PKCE callback handling are unchanged. Old PKCE links and unrelated credentials cannot be retrospectively attributed to an invitation. A mismatched/unknown fingerprint makes no update.

Authenticated clients and admins cannot call the tracking write RPCs or directly write the table. Admins can read only the status columns, under RLS; even admins cannot retrieve the fingerprint through their browser session. No existing RLS policy, grant, trigger, function, or Realtime publication is modified.

## Status rules

1. Recorded successful authorization → Signed In Successfully, permanently, including after expected expiry.
2. Explicit provider rejection → Invitation Delivery Failed.
3. Unconfirmed/ambiguous delivery → Delivery status unavailable.
4. Provider acceptance and no success at/after expected expiry → Invitation Expired.
5. Provider acceptance before expected expiry with no success → Awaiting Sign-In.

Provider acceptance does not prove inbox receipt or email reading. Awaiting copy explicitly warns that a newer link can invalidate an older one early. Supabase remains the credential authority; expected expiry is display metadata, not a second authentication gate. If Supabase successfully verifies a credential near the nominal boundary, an authorized completion is recorded rather than rejected by a second clock check.

The latest attempt is selected per project/client using creation time and UUID as deterministic tie-breaker. Older successful attempts remain stored but do not mark a new resend successful. A later legacy/untracked send takes precedence over an older tracked success. Historical delivery-only records say Sign-In Not Tracked and are not assigned invented expiry or success timestamps. Last Login (any link) is shown separately from provider Auth metadata and is not treated as evidence of invitation-specific portal authorization. Existing People-page Last Login is untouched.

## UI and caching

Only the existing Primary Client section changes. Uses existing status-pill classes and semantic success/warning/danger theme tokens. Responsive text wraps, including email addresses. The status is streamed behind a small loading fallback and fails independently of project data. It is fetched per request without persistent/shared caching or polling. Resend refreshes the overview on both successful and failed delivery attempts.

## Exact release files

- `.env.example`
- `app/admin/projects/[projectId]/page.tsx`
- `app/api/admin/projects/route.ts`
- `app/api/admin/projects/[projectId]/invitation/route.ts`
- `app/auth/confirm/route.ts`
- `components/admin/client-invitation-status.tsx`
- `components/admin/invite-button.tsx`
- `lib/client-invitation-status.ts`
- `lib/client-invitation-query.ts`
- `lib/client-invitation-tracking.ts`
- `supabase/migrations/202611190001_client_invitation_tracking.sql`
- `scripts/test-client-invitation-database.mjs`
- `tests/client-invitation-tracking.test.ts`
- `tests/client-invitation-overview.test.ts`
- `tests/auth-confirm.test.ts`
- `tests/invitation-resend.test.ts`
- `docs/client-invitation-tracking-rollback.sql`
- `docs/client-invitation-status-tracking.md`

## Verification

- Focused authentication/invitation tests: 65 passed; separate overview rendering/query tests: 9 passed.
- Full suite: **579 passed, 1 skipped** (67 passing files, 1 skipped).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build:frankfurt`: passed, standalone output generated using `.env.frankfurt.local`. Existing nonfatal build plugin-timing warnings remain.
- Local PostgreSQL 17.11, loopback only, synthetic accounts and a freshly created test database: migration, privileges, RLS, identity mismatch, foreign-project association, disabled client, unmatched fingerprint, resend ordering, first-timestamp preservation, idempotent delivery finalization, no duplicate clients/projects, and rollback-history preservation passed. Preexisting synthetic client/project/profile/delivery rows were fingerprinted before and after applying the additive migration and were identical. The disposable database was removed afterward.
- Tests verify that repeated GETs do not record success; expired/invalid/missing-session/unauthorized/disabled/no-membership results do not record success; the successful hook runs after authorization; admin and PKCE flows do not invoke the client tracking hook. Query tests verify request refresh and admin-only access.
- Status rendering tests cover all states, exact time markup, historical data, later untracked sends, and separate overall Last Login.
- **Visual desktop/mobile/light/dark browser validation is incomplete.** A synthetic local preview was prepared, but in-app browser navigation timed out. Computer Use then stopped because it could not reliably determine the Windows browser URL. No authenticated real-provider invitation or real email was tested in this phase; none was sent.

## Approval and deployment order

1. Review this diff and migration; obtain explicit production migration approval. Confirm a usable recovery checkpoint and repeat the read-only object/identity checks immediately before execution.
2. Apply **only** `supabase/migrations/202611190001_client_invitation_tracking.sql` to verified Frankfurt using a single-file SQL execution with stop-on-error. It is transactional with five-second lock and thirty-second statement timeouts. Do not run pending migrations as a batch.
3. Verify the new table, RLS, column grants, and service-only RPC grants. Confirm existing delivery and business rows remain unchanged. No production backfill or new Realtime membership is required.
4. Reconfirm `mailer_otp_exp` and set `LEADSEDGE_CLIENT_INVITATION_EXPIRY_SECONDS=86400` in the application environment (current verified value; application also defaults to it). If Auth expiry changes later, update this server setting too. Existing attempts retain their original expected validity window. No secret is needed for this new setting; the existing service-role configuration is reused.
5. Obtain separate application release approval. Deploy only the reviewed feature diff after the database is ready. Do not deploy this code before its migration: login remains fail-open for tracking outages, but invitation sending intentionally refuses to send without an attempt record.
6. With approved disposable accounts/project, validate new invitation, harmless GET, Continue, authorized portal arrival, admin refresh, resend after previous success, expired/failed presentation, and an unrelated sign-in. Check narrow/mobile layouts and both themes. Preserve all production business records. Ordinary admin/client sign-in regression remains part of release acceptance.

## Rollback

Roll back the application to its pre-feature artifact first. The additive database objects can safely remain; old code ignores them and continues writing delivery history. If disabling the feature's database writes is also required, use the reviewed `docs/client-invitation-tracking-rollback.sql`: it transactionally removes only the three new functions and reloads the API schema cache. It deliberately retains the new table and its admin-only read policy to preserve audit records. It does not remove any existing functions, delivery history, or business records. Re-enabling after this rollback requires restoring the function definitions only, not blindly re-running the table-creation migration. Removing the audit table is destructive and is not part of this rollback.

## Limitations

- Historical invitations cannot be attributed retroactively. Existing Last Login is not an invitation receipt.
- Expected expiry begins immediately before server-side credential generation; it is an estimate of the provider validity window, not a promise of usability.
- If the success write fails after valid authentication, login continues and emits only `[client-invitation] sign_in_record_unavailable`. That attempt may remain awaiting/expired despite actual use; monitor this event. It cannot safely be reconstructed later from a general Auth timestamp. No extra authentication system or broad audit pipeline was introduced.
- If provider acceptance or delivery-history persistence is ambiguous, the attempt is unavailable/pending and the admin is asked to inspect history before resending. This avoids automatic duplicate emails.
- Post-authorization success means the server established and authorized the session; it is not proof that a browser received the redirect or rendered the portal.
- Production authenticated/browser acceptance and visual validation remain release gates. No production mutation, Auth setting change, push, or Hostinger deployment has occurred.
