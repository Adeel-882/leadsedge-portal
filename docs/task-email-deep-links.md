# Task notification deep links and existing sessions

Date: 2026-10-09.

## Root cause

`assignmentEmailLink()` in `lib/assignment-email.ts` generated `/auth/sign-in?next=/portal/tasks/<taskId>`. The sign-in page always rendered the login form, even when the browser already had an authorized session. This alone explains the forced-login behavior; no domain mismatch is needed to reproduce it.

A second issue affected a direct task URL without a session: both the portal layout and task page call the shared role guard, whose unauthenticated redirect hard-coded `next=/portal`. That discarded the intended task before authentication.

No production Hostinger environment or affected browser cookie inventory was available to independently rule out an additional deployment mismatch. The repository canonical origin helper already uses `https://portal.leadsedge.us` for non-loopback configuration; explicit local origins remain supported. An automated regression verifies the old Hostinger configuration does not generate old-host task links.

## Corrected behavior

- New assignment emails use `https://portal.leadsedge.us/portal/tasks/<taskId>`, constructed through the existing canonical origin helper. The URL contains no token, code, JWT, or other session credential.
- A signed-in client follows the task URL using existing session claims and bootstrap authorization. Task data still passes the existing assignment, visibility, enabled-client and membership/RLS boundaries.
- Without a valid session, the role guard preserves the task path in a validated relative `next`. The proxy overwrites the internal pathname header with the actual request path; a caller cannot select it by supplying a forged header. Both layout and page guards therefore agree on the destination.
- The sign-in form carries that destination into the existing magic-link request. Existing TokenHash confirmation and PKCE confirmation/callback logic validate it and return to the role-appropriate task path after authentication.
- Previously sent emails still point to sign-in. If that page receives `next` and an authenticated viewer, it now redirects to the safe role-appropriate destination rather than displaying a fresh-login form. The destination performs task authorization; this does not grant access or switch accounts.
- An administrator opening a client task URL retains the existing `/admin` role redirect. Wrong-client access remains denied. A separate browser with no cookies still needs authentication.

No invitation generation, one-time verification, cookie policy, nonce, origin gate, RLS, schema, task scheduling, Messages, Realtime, or caching behavior was changed for this task. Existing diagnostic-only modifications to `app/auth/confirm/route.ts` and the desktop-auth investigation report predated this task and remain separate working-tree changes.

## Email presentation

No HTML, colors, copy, or label was changed. The checked-out assignment email currently uses `sendBrandedEmail` with the label **View Lead**, rather than the request's described dark **View Task** presentation. That discrepancy was reported rather than silently redesigning the email. Only the action destination changes.

## Files changed for this task

| File | Change |
| --- | --- |
| `lib/assignment-email.ts` | Direct, reusable task URL with encoded task ID |
| `proxy.ts` | Server-controlled current pathname for logged-out redirects |
| `lib/auth.ts` | Preserve validated role-appropriate destination when requiring sign-in |
| `app/auth/sign-in/page.tsx` | Shared safe-path validation and existing-session redirect for old emails |
| `tests/assignment-email.test.ts` | Direct URL, no credentials, canonical production host |
| `tests/task-sign-in-destination.test.ts` | Logged-out task destination, existing session, role and redirect safety |
| `tests/proxy-task-destination.test.ts` | Forged pathname header overwritten |
| `tests/sign-in-existing-session.test.ts` | Old-email session reuse, logged-out form, invalid destinations, admin routing |
| `tests/auth-confirm.test.ts` | Additional exact-task return through PKCE; prior invitation deep-link coverage retained |
| `docs/task-email-deep-links.md` | This report |

## Validation

- Full suite: **46 files, 390 tests passed**.
- Typecheck: passed.
- Lint: passed.
- `npm run build:frankfurt`: passed.
- Existing suite coverage includes foreign/disabled-client filtering, hidden/draft/archived filtering, cold/warm task authorization, role separation, one-time invitation verification, non-consuming GET, nonce/state/origin checks, external redirect rejection, Messages and scheduling behavior. Disabled identities or task states were not changed for live tests.

### Real HTTP against the built standalone server and Frankfurt

Used an existing primary synthetic client and assigned fixture task. No email was sent, no task/client/project record was created or edited, and no permission or provider setting changed.

1. Anonymous task GET returned 307 to `/auth/sign-in` with the exact task in `next`, even when supplied a forged pathname header.
2. A fresh no-email magiclink TokenHash passed the existing Continue flow and returned 303 to the exact task.
3. Authenticated task GET returned 200 and contained the assigned task's content.
4. The old `/auth/sign-in?next=<task>` URL redirected directly to the task using the existing session.
5. A different client's task was denied by the existing task access path.
6. A request without cookies still redirected to sign-in with the exact task destination.
7. Only the probe's session was revoked (`scope: local`), then the temporary server stopped. Other sessions were not globally signed out.

The first selected synthetic client had no usable tasks, so the probe stopped before generating a token. A subsequent attempt used the correct fixture but incorrectly sent Origin port 3000 to the temporary port 3098 server. Safe diagnostics proved `POST_ORIGIN_REJECTED`; the probe was corrected, not the application's origin gate. That token was not consumed. A fresh credential was then used for the successful run. The temporary HTTP transport used 3098 while configured local redirect URLs remained 3000; redirect paths were verified and requested explicitly from the same temporary server, without following external redirects.

Chrome, Gmail, mobile, and separate physical browser profiles were unavailable in connected browser tools. Cookie-bearing/cookie-free HTTP requests verify the server flows, but are not a claim of real Chrome/mobile email-click acceptance. No destructive test used client business data.

## Deployment and configuration

Nothing was pushed or deployed. Rebuild and redeploy the application to activate this change in production. Keep `NEXT_PUBLIC_APP_URL=https://portal.leadsedge.us` at build and runtime; no new configuration, schema migration, RLS change, SMTP change, or Supabase Auth setting is required. Local builds should retain their local origin.

After deployment, manually open a newly sent task notification in an already signed-in browser, then repeat after logout and verify return to the same task. Also test an older email and another account/browser. The separate normal-Gmail-click invalid-link investigation remains unresolved and is not claimed fixed by these task-destination changes.
