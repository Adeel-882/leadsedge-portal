# Desktop secure-link investigation — diagnosis incomplete

Date: 2026-10-06. Production: https://portal.leadsedge.us.

**Not fixed or accepted.** The specific desktop failure has not been captured. No fresh real credential or email was generated in this investigation. Mobile success is user-reported, not independently reproduced. No authentication policy was changed based on a hypothesis.

## Follow-up: normal Gmail click versus copying the same link

The user now reports that a normal desktop Gmail click fails, while the same email link copied into another browser or Incognito succeeds. This is evidence against an inherently malformed credential. If the exact credential succeeds after the failed normal click, that failure did not irreversibly consume it. This does not establish Gmail or tracking as the cause: the comparison also changes cookies, extensions, and browser profile.

| Evidence | Normal desktop Gmail click | Copy to another browser / Incognito |
| --- | --- | --- |
| Outcome | User reports `/auth/error?reason=invalid` | User reports successful client login |
| Actual first host and redirect chain/statuses | Not captured | Not captured |
| Rendered Gmail href / wrapper | Not captured | User reports copying the same email link; structure not captured |
| Query preservation | Not measured | Successful authentication supports validity, not a measured parameter comparison |
| Referer origin, POST Origin, Sec-Fetch-Site | Not captured | Not captured |
| Cookie names/domain/path and duplicate names | Not captured in affected profile | Not captured |
| Exact server rejection stage | Not captured | Not captured |

Browser discovery was repeated after the follow-up: only Codex In-app Browser and MCP Apps were available, with no tabs. Desktop Chrome, Gmail, Guest, Incognito, extensions, and mobile remain unavailable. The in-app browser is not a substitute for the affected profile. No normal-click chain is fabricated from source code.

### Old-domain cookie hypothesis

Cookies scoped solely to `khaki-crocodile-610570.hostingersite.com` cannot be attached by a conforming browser to `portal.leadsedge.us`. The domains are unrelated. Cookie domain scoping is described in [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#domain). Therefore a direct cross-domain cookie-name collision is not a viable explanation by itself. A redirect back to the old host, or duplicate cookies scoped to `portal.leadsedge.us` / its parent `leadsedge.us`, would be different hypotheses requiring evidence.

The application sets its confirmation cookie without Domain, at `/auth/confirm`. The installed Supabase SSR defaults use Path `/`, SameSite Lax, and no Domain. The response adapter forwards SDK cookie options. None of this inventories the user's existing cookies; no cookie was cleared or renamed.

### Required capture to find the divergence

In the affected Chrome profile, enable Network Preserve log before the next fresh-link click; if the link opens a new tab, ensure DevTools records that tab from navigation start. Record document requests through the confirmation POST. Share only host, path, status, query **names**, safe `type` value, token/code **presence**, redirect host/path, Referer **origin only**, Origin classification, Sec-Fetch-Site, and cookie **names/attributes only**. Do not share a raw HAR, Copy as cURL output, complete request URL, Cookie/Set-Cookie values, form body/nonce, or token-bearing screenshots.

Use the next fresh link copied into the **same normal profile** first to isolate click handling from profile state. A successful one-time login consumes that credential, so subsequent acceptance comparisons need independently fresh equivalent links. Only reuse a failed attempt's credential when intentionally investigating whether it was consumed; do not interpret a replay after success as a regression.

Find the matching existing `[auth-confirm]` rejection log by timestamp. `POST_STATE_REJECTED` identifies cookie/nonce failure; `POST_ORIGIN_REJECTED` identifies the origin gate; `GET_*` identifies parameter/provider rejection; `POST_VERIFICATION_FAILED` supplies the SDK name/code. Optional additional tracing already exists locally but has not been deployed or enabled. Inspect extensions only after the same-profile paste comparison; do not disable security extensions or alter tracking based on this report alone.

No additional application changes or cause-specific tests were added for this follow-up because no exact divergence has been measured. The previous 371-test, typecheck, lint, and production-build results apply to the unchanged application tree; they are not Chrome acceptance proof. Exact cause, Gmail wrapping, Resend involvement, stale current-domain cookies, extensions, and all requested desktop/mobile acceptance remain unresolved. Nothing was deployed.

## Current link producers

| Source | Provider | Link shape and type | Initial destination | Consumes on GET? | Final destination |
| --- | --- | --- | --- | --- | --- |
| Public login (`app/api/auth/magic-link/route.ts`) | Supabase Auth configured mailer; live SMTP/template unavailable | `signInWithOtp`, `shouldCreateUser:false`, PKCE SSR client; actual mailed href depends on live template | Requested redirect `/auth/confirm?next=...` | App confirmation GET: no. A default upstream `/auth/v1/verify` link verifies on GET. Actual current template unconfirmed. | Role-validated `/admin`, `/portal`, or permitted deep link |
| New-client project invitation (`app/api/admin/projects/route.ts`) | Resend | Admin `generateLink(type:invite)` hashed token → `/auth/confirm?token_hash=...&type=invite&next=/portal` | App confirmation | No | `/portal` |
| Resent project invitation (`app/api/admin/projects/[projectId]/invitation/route.ts`) | Resend | Admin `generateLink(type:magiclink)` hashed token → same app route, `type=magiclink` | App confirmation | No | `/portal` |
| Lead assignment (`lib/assignment-email.ts`) | Resend | Ordinary `/auth/sign-in?next=/portal/tasks/<id>`; no credential in the assignment email itself | Sign-in page | No | Task after subsequent sign-in |
| Local demo (`scripts/create-sign-in-link.mjs`) | No email | Admin hashed token and returned verification type → app confirmation | App confirmation | No | Role destination |

App invitations do not use `properties.action_link`. Their HTML escapes the URL, preserving query parameters after HTML decoding. Public login deliberately remains a public, non-service-role path. There is no general public signup flow in the inspected application; live Confirm Signup template settings are unknown. Callback remains a legacy PKCE exchange path.

The task link currently opens sign-in even for an already authenticated client because the sign-in page does not redirect authenticated viewers to `next`. This is a separate observable product gap, not evidence for the reported desktop invalid-link failure; it was not changed in this investigation.

## Production observations

Harmless synthetic `type=invite` confirmation requests (no valid credential):

- First GET: 200; repeated GET with its state cookie: 200.
- Nonce remained equal across those GETs.
- Cookie: host-only (no Domain), Path `/auth/confirm`, Secure, HttpOnly, SameSite=Lax, Max-Age 600.
- Form action: `/auth/confirm`; Cache-Control: no-store; Referrer-Policy: no-referrer.
- POST with that state and `Origin:null`, `Sec-Fetch-Site:cross-site`: 303 HTTPS error, `reason=invalid`.
- POST with that state and `Origin:null`, `Sec-Fetch-Site:same-origin`: 303 HTTPS error, `reason=expired` for the intentionally nonexistent token. Given the inspected route's error branches, this is evidence it passed origin/state checks and reached verification. Provider logs were unavailable, so the exact SDK error name/code is not claimed.

These HTTP probes supply browser-style headers; they are not evidence of headers emitted by the user's desktop/mobile browser. The actual in-app browser rendered the synthetic magiclink Continue page. Its subsequent UI observation timed out, so it is not counted as successful authentication evidence.

The user's quoted sentence, “For security, invitation and sign-in links expire and can only be used once,” appears unconditionally on `app/auth/error/page.tsx`. It does not identify expiry, consumption, or any other failure stage.

## What is and is not established

| Required finding | Evidence/status |
| --- | --- |
| Exact desktop stage A–H | Unknown: no failing browser request or server log available |
| Why mobile worked | Unknown; need separate fresh links and browser evidence |
| Actual desktop vs mobile href shapes | Not captured; do not infer from source code alone |
| Scanner/prefetch | Not observed; repeated app GET is non-consuming |
| Resend rewrite/tracking | Unknown; local key could not read domains (`validation_error`, invalid API key). No setting changed. |
| Supabase ConfirmationURL strategy | Live template unavailable. Source comments describing built-in mailer are historical, not proof of current settings. |
| Cookie survives | Proven in controlled HTTP cookie-jar probe only; not failing desktop browser |
| Origin:null emitted by desktop | Not captured; safe same-origin case verified in production HTTP probe and tests |
| New production HTTPS redirect fix | Probe returned HTTPS 303; old HTTP 307 issue not reproduced |
| All secure-link types work | Not established |

Official Supabase documentation describes ConfirmationURL as a provider verification URL and explains email prefetching risks: https://supabase.com/docs/guides/auth/auth-email-templates. That documents a possible mechanism, not this user's incident. Resend documents domain-level click tracking: https://www.resend.com/changelog/update-click-open-tracking-via-api. No global or per-email tracking changes were made without live evidence.

## Minimal diagnostic changes, not a claimed auth fix

- `app/auth/confirm/route.ts`: timestamps on rejection logs; opt-in `LEADSEDGE_AUTH_DIAGNOSTICS=true` traces `GET_RECEIVED`, `GET_READY`, `POST_RECEIVED`, `POST_VERIFY`, `POST_COMPLETE` with booleans, allow-listed type/fetch metadata, and credential kind. No token, authorization code, nonce, cookie, session, or email values in new tracing. Fixed a diagnostic collision where `completion.stage` overwrote `POST_AUTHORIZATION_DENIED`; it is now `authorizationStage`.
- `tests/auth-confirm.test.ts`: trace secrecy, post-clear second submission rejection, and invitation task deep-link coverage.
- This report.

No nonce, expiry, one-time verification, origin policy, cookie attributes, role checks, RLS, schema, messaging, task logic, deployment configuration, or provider template was changed. Existing stage-specific rejection logs may be enough; additional successful-stage tracing is disabled by default. Nothing was deployed or enabled in Hostinger.

One-time semantics remain enforced by Supabase. The second-submission regression demonstrates cleared browser state is rejected before another verification; it does not claim stateless local code independently prevents replay of a saved cookie. A replayed real credential must still be rejected by Supabase.

## Validation and remaining acceptance

- 43 test files / 371 tests passed.
- Typecheck passed.
- Lint passed.
- Production-origin Frankfurt standalone build passed.
- Production safe HTTP probe: results above.
- Desktop Chrome/Gmail/incognito: unavailable in connected browser inventory; attempting Chrome returned “Browser is not available.”
- Mobile Gmail/browser: unavailable. Responsive in-app testing is not a substitute.
- Supabase dashboard/Auth logs and Hostinger logs: not connected.

Next evidence needed: whether desktop reaches Continue before failing; whether mobile and desktop used distinct fresh links; the `reason` query parameter and timestamp of the failing attempt; matching safe `[auth-confirm]` stage and SDK name/code from Hostinger. Capture only origin/path/query-key names/type from each actual email href, never credential values. Use separate fresh links for each test and do not click a mobile-consumed link on desktop.

With that evidence, choose the smallest cause-specific fix. Do not change templates, tracking, cookies, PKCE, or origin checks based solely on the generic error notice. Final acceptance remains fresh login, invitation, and task access through real desktop Chrome and mobile, with role/task destinations verified.
