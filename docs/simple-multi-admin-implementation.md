# Simple multi-admin invitations — implementation and migration review

Date: 2026-10-09. Baseline commit: `ad714b46ca09e3f4cbaafdf1c227df490db7326b`.

## Status and approval boundary

The application implementation and an additive SQL migration are prepared. **The migration has only been applied to disposable local PostgreSQL databases. It has NOT been applied to Frankfurt.** No real invitation email or Auth account was generated. Existing Frankfurt administrators, including the synthetic performance administrator, are unchanged.

The previous RBAC proposal and its SQL drafts have been marked **CANCELLED / DO NOT APPLY**. There are no Super Admin roles, permission tables, presets, grant editors or authorization revisions in this implementation.

The exact proposed migration is [202610090001_simple_admin_invitations.sql](../supabase/migrations/202610090001_simple_admin_invitations.sql). Review its security consequences below before authorizing any Frankfurt execution. Provider-backed isolated acceptance remains a validation gate; this report does not recommend bypassing it.

## Existing model and read-only Frankfurt audit

The working tree was clean before editing. Baseline tests passed: 48 files / 402 tests.

Frankfurt was inspected with a read-only catalog transaction through the existing guarded Frankfurt connection; no Seoul/Tokyo connection was made. The live findings were:

- Existing application enum: `admin | client`.
- `public.is_admin()` checks the authenticated user's current `public.users.role = 'admin'`.
- Both `adeelahmed@broadigo.com` and `admin.frankfurt@performance.example.com` remain `admin`.
- No `administrator_invitations` table exists yet.
- Users SELECT policy admits an administrator or the user's own profile. Users UPDATE requires `is_admin()` in both USING and WITH CHECK. An ordinary client cannot currently update its own role through this policy.
- `handle_new_auth_user()` unconditionally creates a client-role profile, ignoring role metadata. Preserve it.
- `setup_first_admin()` remains serialized and refuses to run when an administrator already exists. It is neither modified nor used for this feature.
- Existing broad admin RLS remains the source of equal full access. No business-data RLS policy is rewritten.

## Product behavior

Admin Settings now links to `/admin/settings/admins`. The page lists active administrators and pending/expired invitations with name, email, date and inviter where available. Legacy administrators have no invented inviter. The date for a newly accepted admin is the acceptance date; legacy accounts use their existing profile creation date.

Add Administrator opens an accessible native dialog with Full Name and Email Address only. It explains that the recipient receives full access and can invite more administrators. Pending invitations have Resend and Revoke; revocation has a confirmation dialog. There is no active-admin delete, disable or demotion action.

The page uses current surfaces, fields, buttons and theme tokens. A compact responsive dialog was inspected in desktop light mode and mobile dark mode. The list supports horizontal scrolling on narrow screens. No existing navigation, message chronology, conversations or TanStack Query implementation was changed.

Until the migration is approved and installed, the page can show existing administrators but reports that invitations are unavailable, disables Add Administrator and fails closed on mutation requests. It never generates an Auth account or email before reservation succeeds.

## Invitation creation and delivery

1. The server uses the existing authoritative `requireApiRole('admin')`. Mutations also require same-origin JSON, including an explicit Origin check or same-origin Fetch Metadata fallback for an opaque/missing Origin.
2. Zod validates a trimmed 2–120-character name and normalized email; unknown request fields such as `role` are rejected.
3. `prepare_administrator_invitation` rechecks `is_admin()` inside PostgreSQL, serializes by normalized email, rejects existing client/admin/Auth profiles and duplicate pending invitations, then reserves the invitation.
4. Server-only Supabase Admin SDK generates an invite for a new identity, or a magic link for the same already-bound identity on resend. A reservation UUID in metadata is a binding aid only; it does not assign a role. Neither `role=admin` metadata nor any browser field can grant access.
5. The service-only binding RPC validates inviter, invitation state/expiry, exact Auth UUID/email, creation/reservation relationship for a new identity, initial client-role profile, and absence of any business client association. It locks the profile while checking.
6. Build the local/production `/auth/confirm` link using `hashed_token` and the actual returned `verification_type`. Never use `action_link`. The role-aware builder retains an internal `/admin?admin_invitation=<id>` destination; the UUID is context, not an authentication credential.
7. Resend sends the existing dark/near-black LeadsEdge style, white text and #FF4134 action. Subject: **You're invited to LeadsEdge Portal as an Administrator**. Button: **Accept Invitation**. HTML escapes names and URL attributes; plain text is included. The message explicitly discloses full administrator access.

No token, generated link, service key, session or cookie is returned to the browser's management API, written to the invitation table, or logged. Provider exceptions are converted to safe generic failures. Delivery status records only preparing/sent/failed. A provider idempotency key is scoped to each invitation generation.

## Secure acceptance and equal access

The existing confirmation GET remains non-consuming. Its protected state, explicit Continue POST, origin/nonce checks, `verifyOtp`, response-bound session cookies and safe redirects are reused.

Only a precisely addressed administrator-invitation destination invokes the new acceptance RPC, after Supabase verification has returned a user and session. Ordinary client invitations, ordinary admin/client login and the legacy PKCE callback retain their original authorization path. There is no new unauthenticated promotion endpoint or email-only acceptance fallback.

`accept_administrator_invitation` uses `auth.uid()` rather than a caller-supplied user ID. In one transaction it:

- serializes against resend/revoke/another acceptance;
- requires a pending, unexpired invitation bound to this exact identity;
- requires Auth-confirmed email matching the invitation and public profile;
- confirms the inviter is still an administrator;
- requires the candidate to be an unlinked client-role signup profile, not a business client;
- updates that profile to the existing `admin` role;
- records accepted_by and accepted_at and consumes the invitation.

The session helper then rereads the profile through the user's session. Success redirects to clean `/admin`, removing the invitation context query. Failure signs out the local session and fails closed.

The new admin is an ordinary existing-model administrator: no secondary entitlement table or special hierarchy is consulted. Direct PostgreSQL tests demonstrated Admin A inviting B, B activating, B reading all existing admin-authorized projects, and B inviting C.

## Expiry, resend, revocation and failure handling

Invitation authorization lasts 24 hours. Supabase's independently configured one-time email token may expire sooner; both conditions must pass. No Supabase expiry setting was changed.

Resend serializes on the email, rechecks account conflicts, revokes the prior invitation and creates a new generation. It carries the bound UUID so no second account is created. The old destination ID cannot accept the new generation even if an old authentication credential has not yet expired. A one-minute resend guard reduces accidental duplicate sends; failed delivery may be retried immediately.

Revocation records actor/time without deleting the pending Auth identity. Accepted invitations cannot be resent/revoked through these actions. Concurrent acceptance succeeds once; replay fails. No active administrator is demoted or deleted.

External Auth/email operations cannot be part of the PostgreSQL transaction. If delivery fails after binding, the list offers resend with the same identity. If Auth generation succeeds but binding fails or the process exits before binding, an unprivileged orphan signup profile may remain; the code fails closed and never deletes identities automatically. Retrying an unbound orphan or inviting the same email after revocation can require an operator to inspect the conflicting account. Do not “repair” this by converting any matching client profile. This deliberate recovery limitation should be considered during acceptance testing.

## Exact database changes and security consequences

The new additive migration creates:

1. **One table** `public.administrator_invitations`: safe identity/actor metadata, state, delivery status, expiry/acceptance/revocation times. A partial unique index allows only one pending invitation per normalized email. RLS permits authenticated admins to SELECT; no direct authenticated/anonymous mutations are granted.
2. **Five invitation functions**: prepare, service-only bind, accept, revoke and service-only delivery recording. Functions use fixed `search_path=pg_catalog`, fully qualified application/auth objects, explicit role checks and least-privilege EXECUTE grants. The binding/delivery functions are not executable by browser users.
3. **Profile column privilege restriction**: revoke table-wide UPDATE on `public.users` from public/anon/authenticated, grant only UPDATE(full_name) to authenticated. Existing RLS still requires admin. This preserves the fields currently written by Settings/People and prevents direct role/id/email edits even by an admin browser. Trusted activation/setup/Auth functions retain their controlled behavior.
4. **Client-link race guard**: a trigger on client INSERT or auth_user_id UPDATE takes a shared lock on the referenced public profile and requires role=client. Acceptance takes an exclusive profile lock before checking for client associations and promoting. A competing client link must either finish first (acceptance rejects it) or observe the completed admin promotion (client linkage rejects it). Existing rows, memberships and RLS are not rewritten.

No changes to enum values, `is_admin()`, setup_first_admin, existing business-data RLS, Realtime publication, scheduling, identities or active roles are included. There is no account backfill and no synthetic-admin disable step.

Before applying, recheck current callers of users UPDATE if any additional application changes have landed: a new writer of fields other than full_name would need deliberate accommodation. Also check for any existing malformed client link to an administrator before enabling the new identity guard. The guard does not silently rewrite such a row.

## Tests and validation

| Validation | Result |
|---|---|
| Baseline | 48 files / 402 tests passed |
| Final application suite | 51 files / 430 tests passed |
| Typecheck | Passed |
| Lint | Passed |
| Frankfurt standalone build | Passed after all application changes, including final dialog sizing |
| Standalone HTTP checks | Sign-in 200; unauthenticated Administrators page redirects to sign-in; administrator API GET/POST return 403 |
| Local runtime | One Frankfurt standalone Node listener on port 3000, left running for manual review |
| Direct PostgreSQL migration/lifecycle tests | Passed on disposable local databases |
| Real concurrent PostgreSQL transactions | One duplicate creation succeeds; one concurrent acceptance succeeds |
| Desktop/mobile UI fixture | List, two-field dialog, local submit, dark theme, revoke confirmation inspected |
| Desktop/mobile confirmation requests | Passed with HTTPS proxy/opaque-Origin request shapes, non-consuming repeated GET, one OTP call, one acceptance, session cookies and clean `/admin` redirect |

Run local database tests with `node scripts/test-administrator-database.mjs` against a disposable PostgreSQL cluster listening only on `127.0.0.1:55432`. The runner never loads environment files or connects to Frankfurt. It creates a uniquely named test database and drops only that database after assertions. Set LOCAL_PG_BIN if the local PostgreSQL binaries are elsewhere. Test schema is a minimal reproduction of the current identity/admin/client RLS model, not a full Frankfurt dump.

Direct database coverage includes anonymous/client denial, duplicate/admin/client conflicts, direct role updates, role metadata forgery, pending invitation visibility, exact identity binding, service-only function privileges, expiry, revocation, replay, reissue generation, late client association, unconfirmed/changed email, equal admin RLS access, invitation chaining and actual concurrency.

**Validation limit:** Supabase Auth and Resend are mocked in application confirmation/delivery tests; the browser management preview uses in-memory API fixtures. Actual role activation runs against real local PostgreSQL. No Docker/local Supabase Auth service is available in this environment. Therefore a complete real-provider email → Supabase Auth → browser → local database acceptance round trip has not been run. Do not describe the feature as live-ready or use those mocks as proof of provider delivery. Complete that test with disposable accounts in an approved isolated Supabase/email environment before proposing Frankfurt execution.

No test email was sent to a real address. No staging Auth identity was created, promoted, disabled or deleted.

## Files changed

- `app/admin/settings/page.tsx` — Administrators section/link.
- `app/admin/settings/admins/page.tsx` — existing admin guard and new page.
- `components/admin/administrators.tsx` — list, invite/resend/revoke UI.
- `app/api/admin/administrators/route.ts` — admin list/invitation creation.
- `app/api/admin/administrators/[invitationId]/route.ts` — resend/revoke.
- `lib/administrator-invitations.ts` — strict validation, types and exact destination parsing.
- `lib/administrator-mutation-origin.ts` — same-origin JSON mutation protection.
- `lib/administrator-invitation-service.ts` — server-only Auth binding/link/email orchestration.
- `lib/administrator-invitation-email.ts` — branded escaped invitation content/delivery.
- `lib/auth-session.ts` — narrowly scoped, explicit-invitation acceptance after verified identity.
- `app/auth/confirm/route.ts` — forwards protected invitation context; clears context on success.
- `supabase/migrations/202610090001_simple_admin_invitations.sql` — unapplied additive migration.
- `tests/administrator-invitations.test.ts` — page/API access, validation, list, duplicate and mutation cases.
- `tests/administrator-invitation-delivery.test.ts` — binding/type/URL/delivery and safe errors.
- `tests/administrator-invitation-acceptance.test.ts` — targeted session completion and email content.
- `tests/auth-confirm.test.ts` — desktop/mobile invitation handoff regression cases.
- `tests/security/administrator-fixture.sql`, `tests/security/administrator-invitations.sql` — isolated database model and direct authorization assertions.
- `scripts/test-administrator-database.mjs` — local-only database test runner and concurrent transactions.
- `docs/multi-admin-rbac-proposal.md`, `docs/proposals/rbac-01-foundation.sql`, `docs/proposals/rbac-02-enforcement.sql` — cancellation notices only; no previous proposal applied.
- `docs/simple-multi-admin-implementation.md` — this report and approval boundary.

## Remaining review/approval items

1. Review the exact additive SQL and its two hardening consequences: profile column UPDATE restriction and client-identity linkage trigger.
2. Arrange/authorize a disposable isolated Supabase Auth and email test environment for the remaining real-provider round trip. No changes to Frankfurt/Seoul/Tokyo are inferred from that need.
3. After that validation, explicitly approve Frankfurt migration execution. Until then, invitation creation remains unavailable there.
4. Deployment/push remains a separate user action. No Hostinger, DNS, SMTP or production secret change is required by this implementation.

Rollback before any activation can remove the new functions/trigger/table with a reviewed migration; retain the profile UPDATE hardening unless separately justified. After any invitation is accepted, dropping the invitation table does not demote the newly active admin. Preserve its attribution/history and never silently demote or delete an account during rollback.
