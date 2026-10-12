# Multi-device administrator sign-in — diagnosis and prepared fix

Date: 2026-10-12 (Asia/Karachi). Production: https://portal.leadsedge.us. Existing administrator: adeelahmed@broadigo.com.

## Status

**Root cause established for the captured Slack-transferred link. Production fix is NOT applied or accepted yet.** The live Magic Link template needs an approved change. No fresh real email/token was generated during this investigation. Cross-device browser acceptance remains pending. No provider configuration, credentials, identities, schema, RLS, deployment or hosting setting was changed. Seoul restoration/Multi-Admin work has stopped; its files and earlier uncommitted work are preserved.

## Exact failure evidence

Read-only Frankfurt Management API Auth configuration, unified Auth/gateway logs, and selected auth.flow_state timestamps were inspected. Credential equality was compared in memory only; secret URLs and values were never printed or saved. Times below are Pakistan time on October 12:

| Time | Evidence |
|---|---|
| 19:35:54 | Production POST /auth/v1/otp accepted; redirect_to origin is https://portal.leadsedge.us, path /auth/confirm, with next parameter. The named admin's matching magiclink flow was created at 14:35:54.611662 UTC. |
| 19:36:19.745 | GET /auth/v1/verify by **Slackbot-LinkExpanding**, type magiclink, PKCE-prefixed credential; response 303. |
| 19:36:19.827 | Named admin's auth.flow_state.auth_code_issued_at set. The Slack request consumed the email token and issued a PKCE code; this did not complete an authenticated session. |
| 19:36:25.910 | Chrome GET /auth/v1/verify with the **same credential**, compared in memory. |
| 19:36:26 | Corresponding Auth request logs **One-time token not found**; 303 redirect. |
| 19:36:52 and 19:42:16 | Subsequent Chrome retries of that same credential fail again. |

The Slack request's Auth request ID is `01a1308b-05ad-7358-a63b-2b9c21b71c33`; the first failed Chrome request is `01a1308b-1de7-7df8-93de-3d8a52b493db`. These are correlation identifiers, not credentials.

No /token?grant_type=pkce exchange or POST /verify appears in this captured sequence. An earlier /token request at 19:31:27 was grant_type=refresh_token, not code exchange. User reports opening within a minute and reaching the error directly; this agrees with upstream consumption, not a failure of our Continue POST. Expiry is configured to 3600 seconds. There was no intervening /otp between the Slack verification and Chrome's failure.

An earlier flow was issued at 19:34:28 and code-issued at 19:35:03, followed by an expired Chrome attempt at 19:35:19. The earlier successful caller is not identified by the gateway sample; do not attribute that separate attempt to Slack.

The error URL reported by the user includes provider error parameters. Current repository and a public production synthetic probe redirect from /auth/confirm to the clean HTTPS `/auth/error?reason=expired`, dropping those extra parameters. The exact browser hop retaining them was not captured. Provider/gateway evidence, rather than that URL suffix, establishes the failure stage.

## Live production mechanism and configuration

- `app/api/auth/magic-link/route.ts` uses anonymous/public `signInWithOtp`, shouldCreateUser:false, generic anti-enumeration response, and configured-origin /auth/confirm?next=... . It does not send through the application's Resend helper or use a service-role key.
- Installed @supabase/ssr sets flowType=pkce. The request browser receives a PKCE verifier through the response-bound cookie adapter.
- Live Magic Link template href is **{{ .ConfirmationURL }}**; no TokenHash variable. Invite provider template has the same href strategy.
- SMTP is **smtp.resend.com:465**. Earlier claims that built-in SMTP blocks template editing are outdated. No SMTP setup is needed for this proposed fix.
- Normal sign-in email therefore sends the user to Supabase GET /auth/v1/verify first. The app's non-consuming page is too late to protect that initial credential.
- Provider Site URL is exactly https://portal.leadsedge.us. The allowlist includes production /** plus historical localhost, 127.0.0.1, Worker and Hostinger destinations. Captured actual OTP/verification destinations use production HTTPS, not the old domains. Removing obsolete allowlist entries is a separate approved cleanup, not necessary to explain this incident.
- Hostinger's private environment is not connected. Public HTTPS probes and actual provider request destinations establish correct outward origin for these requests; they are not a complete environment-variable audit.
- Auth health reports **v2.197.0**.

## PKCE versus TokenHash

Installed auth-js `_exchangeCodeForSession` requires the stored verifier and raises AuthPKCECodeVerifierMissingError before requesting /token if it is absent. A code created by a direct Supabase GET on a different device can therefore fail independently of the scanner problem. That SDK error is not the error observed in this incident: this link was already rejected at provider GET /verify.

Installed `verifyOtp({token_hash,type})` POSTs the hash and type to /verify and stores the returned session, with no PKCE verifier lookup. The existing confirmation route already supports this path: GET renders only; POST enforces state, nonce and origin, verifies once, attaches cookies, then checks the authoritative database role/client authorization.

Supabase's documented PKCE email template uses **TokenHash + type=email** for `signInWithOtp` Magic Link emails. The route accepts that type. Direct generated invitation links continue to use their existing supported type=invite; helper/Admin generateLink consumers must continue using the returned verification_type. These sources should not be conflated. [Official passwordless guide](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Sessions and sign-out

Live configuration: sessions_single_per_user=false; sessions_timebox=0; sessions_inactivity_timeout=0; refresh_token_rotation_enabled=true; security_refresh_token_reuse_interval=10. No concurrency change is needed. Ten retained session rows exist for the admin; this is not proof all ten remain refreshable. No session/token values were queried.

A separate definite application bug was found: `/auth/sign-out` called SDK signOut() with its global default. Changed to **signOut({scope:'local'})**. Signing out on B must revoke B's session, not A's. Authorization-failure cleanup already used local scope and remains unchanged. Rotation is preserved. Real A/B independent refresh and logout validation is still pending. [Session documentation](https://supabase.com/docs/guides/auth/sessions).

## Gmail, Resend and Slack

Slack link expansion is directly recorded in the matched credential sequence. No evidence establishes Gmail rewriting/consumption for this incident. Resend's domain API returned HTTP400 validation_error with the locally available key; click tracking could not be inspected. SMTP host is independently confirmed via Supabase configuration. Do not infer tracking status from unavailable domain settings. Regardless of upstream wrapping, the captured Slack request reached the consuming Supabase endpoint.

A passive scanner fetching the proposed app TokenHash URL will receive only a confirmation page and its own state cookie; a human opening the same URL obtains independent state. Only explicit POST redeems the credential. This protects GET-only previews; it does not claim to defeat automation that actively submits forms or theft of the bearer link. Never publish/share credentials into reports or shared logs.

## New requests and old emails

The exact deployed Auth tag's CreateOneTimeToken clears existing tokens for the same user and token type before creating the new token. Thus successfully issuing a later magic-link token can supersede a pending earlier link; rate-limited/failed sends should not be treated as successful replacement. This concerns pending credentials, not existing device sessions. No live duplicate-send experiment was performed, to avoid invalidating the user's links. The captured second failure is consumption: no new send occurred between Slack and Chrome. [v2.197.0 one-time-token source](https://github.com/supabase/auth/blob/v2.197.0/internal/models/one_time_token.go).

Use the newest successfully issued email and complete each device's login before requesting another. No token lifetime, reuse policy or rate limit is weakened.

## Exact prepared changes

1. `app/auth/sign-out/route.ts`: local sign-out scope.
2. `app/auth/confirm/route.ts`: recognize same-origin nested /auth/confirm RedirectTo wrappers, just as existing /auth/callback wrappers; extract their safe next path and apply existing role destination checks. Correct historical comment that claimed the live email template was known from code alone.
3. `tests/auth-sign-out.test.ts`: explicit local SDK contract, production HTTPS redirect and local fallback.
4. `tests/auth-confirm.test.ts`: independent scanner/browser state with no requesting-browser verifier; provider-rejected saved-state replay; proposed template task destination; external wrapper rejection. Existing Origin:null, cross-site, expiry, nonce/state, admin/client, invitation/deep-link and secrecy tests retained.
5. `docs/auth-templates/magic-link-tokenhash-proposed.html`: full current branded provider template with its one ConfirmationURL href replaced; not applied.
6. This report.

No prepared Multi-Admin implementation files, role tables, permissions or migrations were changed. Prior uncommitted multi-admin test/report work remains present and is not part of this fix.

## Provider change awaiting approval

Change **only Frankfurt Magic Link template content**, retaining exact current subject:

`Your secure LeadsEdge Portal sign-in link`

Proposed HTML href:

```html
https://portal.leadsedge.us/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;next={{ .RedirectTo | urlquery }}
```

The full reviewable template is `docs/auth-templates/magic-link-tokenhash-proposed.html`. RedirectTo is URL-encoded as data, not used as the outward host. The app extracts its same-origin /auth/confirm?next=... destination, validates internal paths and routes admin to /admin or an allowed admin task; clients to /portal or an allowed client task. No external redirects are admitted. A missing/irrelevant destination falls back by database role.

Existing Invite template subject: `You’re invited to LeadsEdge Portal`. Its provider href also uses ConfirmationURL, but normal application client invitations already build TokenHash links and send through Resend directly. Leave provider Invite unchanged for this Magic Link repair unless a separate required flow is identified. A future approved provider Invite template would use the same app endpoint with type=invite and a role-validated destination; do not silently alter client invitation delivery.

Rollout order: review/approve and separately deploy the narrow application change (nested destination support and local logout), then approve/update only mailer_templates_magic_link_content. Re-read provider content and compare the exact intended replacement. Do not change SMTP, session policy, expiry, Site URL, allowlists or credentials. This request does not authorize automatic push/deploy.

Rollback: save the live Magic Link subject/content before any provider write (current content is already captured locally in ignored work/magic-link-template-before.html). Restore that exact content only if required; the old strategy restores scanner/PKCE limitations too. Application changes are backward-compatible with existing code and TokenHash links. Do not globally log out devices or mutate roles to roll back. Reverting a template cannot revive an already-consumed credential.

## Validation and remaining acceptance

- Full suite: **52 files / 436 tests passed**.
- Typecheck and lint: passed.
- Frankfurt standalone build: passed.
- Real public production GET with a nonexistent synthetic hash: 200 Continue; action=/auth/confirm; no-store; no-referrer; host-only Secure HttpOnly SameSite=Lax state cookie. No real token used.
- Synthetic provider error query: 303 to production HTTPS /auth/error?reason=expired.
- Browser discovery exposed only in-app browser; no second laptop/Chrome profile is connected. Dashboard navigation requested sign-in; read-only Management API supplied the evidence instead.
- Unit tests mock provider session creation/replay errors. They do not prove fresh-email cross-device success or concurrent refresh sessions.

After approval and rollout, acceptance requires fresh separate emails: A→A; A request→B open without A cookies; A and B both access/refresh sessions; B logout leaves A usable; controlled Slack preview before human TokenHash Continue does not create a /verify GET and human POST succeeds. Include mobile→desktop. Use the existing account or approved controlled identities, and never copy session cookies between devices. Avoid issuing another link until the previous scenario completes. Observe safe paths/statuses/provider request IDs and session-presence booleans only.

**The production incident is diagnosed; it is not yet fixed. Laptop A/B simultaneous authenticated operation has not been demonstrated in this run. Stop for approval before provider changes; no push or deployment.**
