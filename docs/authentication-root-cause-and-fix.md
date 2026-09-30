# Authentication root cause and fix

**Date:** 2026-09-09
**Environment audited:** Frankfurt staging (`eu-central-1`, Supabase Free), local standalone Node server on `http://127.0.0.1:3000`
**Outcome:** Root cause identified and fixed. Admin and client both authenticate end to end against Frankfurt. No Cloudflare runtime, no DNS/SMTP/Hostinger changes, no schema, RLS or fixture changes.

No secrets, token hashes, OTPs, authorization codes, cookie values or keys appear in this document.

---

## 1. Answer first

`/auth/error?reason=invalid` was **not** expiry, not scanner consumption, not PKCE cookie propagation, not TokenHash formatting, and not rate limiting.

`app/api/auth/magic-link/route.ts` was refactored to point Supabase's `emailRedirectTo` at the new scanner-resistant route:

```
emailRedirectTo = ${appUrl()}/auth/confirm?next=/portal
```

But `emailRedirectTo` is not where the emailed link points. It is where **Supabase redirects the browser after Supabase has already verified the token itself**. The Frankfurt project uses the built-in mailer, whose template emits `{{ .ConfirmationURL }}`, so every real sign-in email contains Supabase's own verification URL. When the user clicks it, Supabase consumes the token and then redirects the browser to `emailRedirectTo` carrying **either a PKCE authorization code in the query string or the session in the URL fragment** — never a `token_hash` query parameter.

`GET /auth/confirm` required `token_hash` and rejected everything else. So every real sign-in email landed on a route that could not possibly find the credential Supabase had just issued, and returned `reason=invalid` — regardless of how fresh the email was.

The fix makes `/auth/confirm` accept both credential shapes, keeps the explicit Continue step for both, and unifies authorization between the two email entry points.

---

## 2. Current authentication architecture

```
Browser  →  vinext standalone Node server (dist/standalone/server.js)  →  Supabase Frankfurt
```

No Cloudflare Worker in the runtime path. No `wrangler.toml`, no bindings, no `workers.dev` reference in configuration. (The two `cloudflare` strings inside the bundle are library-internal *environment detection* in Supabase Realtime and a Next.js CDN-header strip — nothing is required at runtime.)

| Piece | File | Role |
| --- | --- | --- |
| Link request | `app/api/auth/magic-link/route.ts` | `signInWithOtp` with `shouldCreateUser: false`; anti-enumeration response; issues the PKCE verifier cookie |
| Email confirmation | `app/auth/confirm/route.ts` | GET renders a non-consuming Continue page; POST is the only consumer |
| Legacy callback | `app/auth/callback/route.ts` | Compatibility for links emailed while `emailRedirectTo` pointed here |
| Shared authorization | `lib/auth-session.ts` *(new)* | Role, client and membership resolution used by both entry points |
| Shape + routing helpers | `lib/auth-flow.ts` | Credential validation, safe redirect targets, provider-error classification |
| Cookie binding | `lib/supabase/response-bound.ts` | Binds Supabase cookie writes to the exact returned response |
| Session refresh | `proxy.ts` | Keeps the session cookie fresh; explicitly **not** an authorization boundary |

Authorization remains in the database. Every read in `lib/auth-session.ts` runs through the newly authenticated user's own session, so RLS decides what is visible; the route checks exist to fail closed with a useful reason instead of dropping a half-authorized viewer into a shell that would bounce them.

---

## 3. Environment findings

| Check | Result |
| --- | --- |
| `.env.local` project | `llmmtdzlurunphdfrqlg` — **Seoul**, `NEXT_PUBLIC_APP_URL=http://localhost:3000` |
| `.env.frankfurt.local` project | `tfrljxzknnhkynobvetg` — **Frankfurt**, `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000` |
| `build:frankfurt` / `start:frankfurt` | Confirmed as documented, both via `node --env-file=.env.frankfurt.local` |
| Seoul reference in built output | **None** (`dist/` grep is clean) |
| Frankfurt reference in built output | Present in server and client bundles |
| Running process | One only: `node --env-file=.env.frankfurt.local dist/standalone/server.js`, listening on port 3000 |
| Runtime project identity | Proved live: the server issues cookies named `sb-tfrljxzknnhkynobvetg-…` |
| Private keys in client bundle | **None.** 126 files across `dist/client` and `dist/server/ssr` scanned against the actual values of `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET`, `RESEND_API_KEY`, `CALENDAR_TOKEN_ENCRYPTION_KEY` — zero matches |
| Cloudflare runtime dependency | None |

### One environment trap found and fixed

`tests/performance/create-browser-session.mjs` read `.env.local` **unconditionally**, so it generated tokens against the retired Seoul project even when the server under test was Frankfurt. It now prefers the environment the process was actually started with and only falls back to the file.

### One host trap made visible

`lib/env.ts` and `app/layout.tsx` fall back to `http://localhost:3000` when `NEXT_PUBLIC_APP_URL` is unset. Both Frankfurt and Seoul env files set it explicitly, so the fallback is dormant — but it is exactly what bites anyone running `npm run build` / `npm run start` without an env file: the emailed link returns to `localhost:3000` while the PKCE verifier and session cookies live on `127.0.0.1:3000`, which are different origins to a browser. The fallbacks were left alone (changing a global default is riskier than the trap), and instead the magic-link route now logs an explicit `Sign-in origin mismatch` warning naming both origins whenever the configured origin differs from the browsing origin.

---

## 4. Identity audit (read-only — nothing was modified)

### `eliters8820@gmail.com`

| Field | Value |
| --- | --- |
| `auth.users.id` | `9b9aff32-7855-459a-9538-8631cd118e25` — matches expected |
| `email_confirmed_at` / `confirmed_at` | Set |
| `banned_until` / `deleted_at` | Null |
| `auth.identities` | One `email` identity; `user_id`, `sub` and `identity_data.email` all consistent; `email_verified: true` |
| `public.users` | Same id, `role = client`, "Frankfurt Test Client 1" |
| `public.clients` | `71000000-0000-4000-8000-000000000001`, `status = active`, `auth_user_id` matches — matches expected |
| Fixtures | 3 project memberships, 15 `project_tasks`, 40 `project_messages`, 120 `task_messages`, 120 `task_activity`, 3 meetings |

### `adeelahmed@broadigo.com`

| Field | Value |
| --- | --- |
| `auth.users.id` | `dbf41fdf-2b4a-4f8c-a8da-6b34350dbc65` |
| `email_confirmed_at` | Set |
| `auth.identities` | One consistent `email` identity |
| `public.users` | `role = admin`, "Adeel Ahmed" |

**No identity corruption.** The relink held. No client was recreated, no project duplicated, no record modified.

---

## 5. Exact failure reproduction

### Supabase evidence

`admin.generateLink({ type: 'magiclink' })` against Frankfurt returns (token redacted):

```
verification_type : magiclink
hashed_token      : 56 chars, lowercase hex, no pkce_ prefix
action_link       : https://<ref>.supabase.co/auth/v1/verify
                      ?token=<TOKEN>&type=magiclink
                      &redirect_to=http%3A%2F%2F127.0.0.1%3A3000%2Fauth%2Fconfirm%3Fnext%3D%252Fportal
```

`action_link` is exactly what `{{ .ConfirmationURL }}` renders in the email template. **Following it:**

```
GET /auth/v1/verify  →  303
Location: http://127.0.0.1:3000/auth/confirm?next=%2Fportal
          #access_token=<REDACTED>&refresh_token=<REDACTED>&type=magiclink
```

Every credential is in the **fragment**, which browsers never transmit to a server. Following the same link a second time:

```
303 → http://127.0.0.1:3000/auth/confirm?next=%2Fportal
      #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
```

Also fragment-only. **The server therefore saw the identical bare request — `GET /auth/confirm?next=%2Fportal` — for a fresh link and for an expired one.** That is precisely why the user reported the failure "even when using the newest sign-in email": the server had no way to tell the two apart, and defaulted both to `reason=invalid`.

For links created through the app's own `signInWithOtp` the flow is PKCE (proved below), so Supabase appends `?code=…` to the query instead. That shape was equally unhandled.

### Application evidence

Against the pre-fix running server:

| Request | Result |
| --- | --- |
| `/auth/confirm?next=/portal&code=<code>` — the real email shape | `307 → /auth/error?reason=invalid` |
| `/auth/confirm?next=/portal` — the fragment-only shape | `307 → /auth/error?reason=invalid` |
| `/auth/confirm?token_hash=<56 hex>&type=email` — the synthetic shape | `200` Continue page |

The PKCE flow was confirmed live and non-destructively by posting an unknown address to `/api/auth/magic-link` (no email sent, no user created) and observing the response set `sb-tfrljxzknnhkynobvetg-auth-token-code-verifier`. `@supabase/ssr@0.12.5` hard-sets `flowType: "pkce"` in `createServerClient`, so every app-issued sign-in email is a PKCE link.

---

## 6. Root cause

**`emailRedirectTo` was pointed at a route that only accepts a credential shape Supabase does not deliver to it.**

`/auth/confirm` was designed for the scanner-resistant TokenHash flow, which requires the Supabase **email template** to be customised to `{{ .TokenHash }}`. That template change requires custom SMTP, which is not configured. So the built-in mailer kept sending the direct verification URL, Supabase kept consuming the token itself, and the browser kept arriving at `/auth/confirm` carrying a PKCE code (or a fragment) that the route discarded.

### Why the synthetic tests passed while the real flow failed

`tests/auth-confirm.test.ts` built **every** request through one helper that always set `token_hash` and `type`. Nothing in the suite ever constructed the URL Supabase actually produces. `tests/magic-link-route.test.ts` asserted `emailRedirectTo === '…/auth/confirm?next=%2Fadmin'` — it encoded the bug as the expectation rather than catching it. The suite was self-consistent and completely disconnected from the provider's real behaviour.

### The unexplained "valid TokenHash URL still redirected to invalid"

Not reproducible on the current build. On the running Frankfurt server, a well-formed 56-character hex `token_hash` with `type=email`, `type=magiclink`, uppercase hex, or a `pkce_` prefix all return `200` and render the Continue page. Two plausible causes for the earlier observation, both now eliminated:

1. **A Seoul-generated token tested against a Frankfurt server.** `create-browser-session.mjs` read `.env.local` unconditionally (fixed in §3).
2. **A truncated copy-paste.** The URL is ~130 characters and wraps in a terminal; a clipped hash fails the shape check silently.

Both classes are now self-diagnosing: every rejection logs its stage and the credential's shape (§9).

---

## 7. Supabase type semantics — proved, not inferred

From the **installed SDK** (`@supabase/auth-js@2.112.4`, `lib/types.d.ts`):

- `GenerateLinkProperties.action_link` is documented as `auth/v1/verify?type={verification_type}&token={hashed_token}&redirect_to={redirect_to}`
- `GenerateLinkType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change_current' | 'email_change_new'`
- `EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email' | (string & {})`

From **live Frankfurt Auth**, using disposable performance fixtures:

| Token source | `verification_type` | `verifyOtp({ type })` result |
| --- | --- | --- |
| `generateLink({ type: 'magiclink' })` | `magiclink` | `type: 'magiclink'` → **session created** |
| `generateLink({ type: 'magiclink' })` | `magiclink` | `type: 'email'` → **session created** |

So `email` and `magiclink` are **not** interchangeable in the type system, but Frankfurt's GoTrue does accept `email` as a catch-all that resolves a hashed token against both the confirmation and recovery token columns. **`type=email` was therefore never the cause of any failure here.**

Correctness rule applied in code: never hard-code the type — carry `properties.verification_type` through. `scripts/create-sign-in-link.mjs`, `app/api/admin/projects/route.ts` (`invite`) and `.../invitation/route.ts` (`magiclink`) all now match their token source.

---

## 8. What the live emails actually contain

**Option A is true.** Emails from `signInWithOtp()` currently point at Supabase's **direct `/auth/v1/verify` URL**, not at the LeadsEdge `/auth/confirm?token_hash=` URL. Proved in §5 by the `action_link` returned by Frankfurt itself, which is the same construction the template renders.

Consequences, stated plainly:

- **Code readiness:** the scanner-resistant TokenHash flow is implemented, tested and working. It is exercised today by admin invitations, invitation resends, and `npm run signin:frankfurt`.
- **Email delivery readiness:** it is **not** reached by normal sign-in emails, and cannot be until the email template is customised — which the Supabase dashboard gates behind custom SMTP.
- Until then, a mail scanner that follows a sign-in link **will** burn the token at Supabase before the user clicks. The app cannot prevent that, because the consumption happens on Supabase's side. What the app now does is report it correctly: such a click yields `reason=expired` ("this link has expired or has already been used") instead of a misleading `reason=invalid`.

No SMTP, DNS, Hostinger or Resend domain work was performed.

---

## 9. Code changes

### `app/auth/confirm/route.ts` — accepts both credential shapes

GET now recognises three arrivals:

| Arrival | Behaviour |
| --- | --- |
| `token_hash` + `type` | Store in the state cookie, render Continue. Never verifies. |
| `code` (PKCE — today's real emails) | Store in the state cookie, render Continue. Never exchanges. |
| `error` / `error_code` from Supabase | Map to a real reason — `otp_expired` → `reason=expired` |
| Nothing server-visible | `reason=invalid`, logged as `GET_NO_SERVER_VISIBLE_CREDENTIAL` |

POST remains the only consumer and now dispatches on the stored credential: `verifyOtp()` for a token hash, `exchangeCodeForSession()` for a code. Same-origin check, nonce check, single-use state cookie and secure headers are unchanged.

### `lib/auth-session.ts` — new, shared by both entry points

Previously `/auth/confirm` did full role/client/membership checks while `/auth/callback` did none. Both now use one helper.

It also fixes a latent bug found during the audit: the old order read `project_clients` **before** calling `activate_current_client()`. The hardened RLS policy from `202609040001_harden_disabled_client_membership.sql` only exposes membership rows to a client whose status is `active`, so a newly **invited** client would have appeared membership-less and been rejected on their very first sign-in. Activation now precedes the membership read. The membership read remains the disabled-client gate.

### `lib/auth-flow.ts`

- Token hash validation broadened from `/^[0-9a-f]{56}$/i` to `/^(?:pkce_)?[0-9a-f]{32,128}$/i`. Pinning one digest length encodes a GoTrue implementation detail and turns any provider-side change into an unexplained `reason=invalid`; Supabase remains the authority on whether a token is real, so this check only screens obvious junk before a round trip.
- Added `isSupabaseAuthorizationCode()` and `describeCredential()` (shape-only, safe to log).
- `classifyOtpError()` now recognises a missing PKCE verifier and returns a new `different_device` reason.

### `app/auth/error/page.tsx`

New message for `different_device`: *"This link must be opened in the same browser that requested it."* A PKCE link can only complete in the browser holding the code verifier — opening the email on a phone after requesting it on a laptop is the most common way a genuinely valid link fails, and it previously surfaced as an unexplainable "invalid".

### `app/api/auth/magic-link/route.ts`

Unchanged in behaviour, plus a warning when the configured sign-in origin differs from the browsing origin (§3).

### Diagnostics

Permanent, structured, secret-free. Every rejection names its stage:

```
[auth-confirm] {"stage":"GET_TOKEN_HASH_REJECTED","tokenPresent":true,"length":8,
                "pkcePrefixed":false,"tokenShapeValid":false,"parsedType":"email","next":"/portal"}
[auth-confirm] {"stage":"GET_NO_SERVER_VISIBLE_CREDENTIAL","queryKeys":["next"],"next":"/portal"}
[auth-confirm] {"stage":"POST_VERIFICATION_FAILED","credentialKind":"code",
                "name":"AuthPKCECodeVerifierMissingError","code":"pkce_code_verifier_not_found","status":400}
```

Token hashes, OTPs, authorization codes, verifiers, access/refresh tokens, keys and cookie values are never logged. The server log produced by the full validation run was scanned for all of them: zero matches. This is production-quality logging, not temporary instrumentation, so there is nothing to remove.

---

## 10. Security review of the change

| Property | Status |
| --- | --- |
| `shouldCreateUser: false` | Preserved. Verified live: 10 auth users before and after an unknown-email request. |
| Anti-enumeration | Preserved. Unknown and known addresses return byte-identical `200` bodies. |
| Public route free of service role | Preserved. Route works with `SUPABASE_SERVICE_ROLE_KEY` deleted (test asserts it). |
| GET never consumes a token | Enforced for **both** shapes. Verified live: two consecutive GETs, then a successful POST. |
| POST is the only consumer | Verified live: replaying a consumed token returns `reason=expired`. |
| Same-origin POST | Cross-origin POST rejected before any Supabase client is constructed. |
| Token never reaches client JS | Held in an `HttpOnly`, `SameSite=Strict`, `/auth/confirm`-scoped cookie. The page contains only a random nonce; asserted absent from the HTML live. |
| Redirect safety | External `next` sanitised to the role's default; cross-role `next` rejected. |
| RLS | **Unchanged.** No migration written, no policy altered. |
| Authorization in the browser | None added. All checks run server-side through the user's own session. |
| Service-role credentials in client bundle | None (§3). |

The `code` branch is not a security regression. The authorization code is bound to the PKCE verifier cookie in the requesting browser, so a mail scanner that follows the link cannot exchange it. The token consumption a scanner causes happens inside Supabase and is outside the app's control until the email template changes.

---

## 11. Tests

`npm test` — **18 files, 105 tests, all passing.** `npm run typecheck` and `npm run lint` clean.

New regression coverage in `tests/auth-confirm.test.ts`, under `describe('the URL Supabase actually redirects to')` — the shapes the old suite never tried:

1. PKCE code renders the Continue page and does not exchange
2. POST exchanges the code exactly once and lands the client in `/portal`
3. An administrator reaches `/admin` through the same exchange
4. `error_code=otp_expired` on the redirect reports `expired`, not `invalid`
5. A fragment-only arrival fails closed and logs `GET_NO_SERVER_VISIBLE_CREDENTIAL`
6. A malformed code is rejected before Supabase is contacted

`tests/auth-callback.test.ts` extended for shared role routing, RLS-hidden membership denial, provider errors, and malformed codes. `tests/magic-link-route.test.ts` extended for the origin-mismatch warning.

Requested coverage:

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Unknown email does not create user | `magic-link-route`, live acceptance |
| 2 | Generic anti-enumeration response | `magic-link-route`, live acceptance |
| 3 | Client identity recognised | live e2e |
| 4 | Admin identity recognised | live e2e |
| 5 | GET does not verify | `auth-confirm`, live e2e |
| 6 | Repeated GET does not consume | `auth-confirm`, live e2e |
| 7 | POST verifies exactly once | `auth-confirm`, live e2e |
| 8 | Session cookies reach the browser | `auth-confirm`, `auth-callback`, live e2e |
| 9 | Client lands `/portal` | live e2e |
| 10 | Admin lands `/admin` | live e2e |
| 11 | Disabled client denied | `auth-confirm`, `auth-callback` (RLS-hidden membership) |
| 12 | Client denied `/admin` | live e2e (`307 → /portal`) |
| 13 | Cross-client isolation | live isolation run |
| 14 | Malformed TokenHash rejected safely | `auth-confirm`, live HTTP matrix |
| 15 | Correct generateLink verification type | `auth-flow`, live Supabase probe (§7) |
| 16 | Safe internal `next` | `auth-flow`, `auth-confirm` |
| 17 | External `next` rejected | `auth-flow`, `auth-confirm`, live HTTP matrix |
| 18 | Canonical `127.0.0.1` origin | live runs; origin-mismatch warning |
| 19 | No private secrets in client bundle | bundle scan (§3) |
| 20 | No Cloudflare runtime dependency | build + config audit (§3) |

---

## 12. Manual validation on the accepted build

Procedure: port 3000 checked, only the verified LeadsEdge Node process stopped, `dist/` removed, `npm run build:frankfurt`, `npm run start:frankfurt`. Exactly one listener (`0.0.0.0:3000`, one PID). `npm run build` / `npm run start` were not used.

```
================ CLIENT (eliters8820@gmail.com) ================
verification_type       : magiclink
token shape             : 56 chars, hex=true, pkce_prefix=false
GET  /auth/confirm      : 200 | page rendered: true | leaks token: false
  state cookie set      : true
GET  again (scanner)    : 200 | still non-consuming: true
POST /auth/confirm      : 307 -> http://127.0.0.1:3000/portal
  session cookies set   : true
  state cookie cleared  : true
  token replay rejected : /auth/error?reason=expired
GET  /portal            : 200 | shows client name: true
GET  /admin as client   : 307 /portal

================ ADMIN (adeelahmed@broadigo.com) ================
POST /auth/confirm      : 307 -> http://127.0.0.1:3000/admin
GET  /admin             : 200
GET  /portal as admin   : 307 /admin

anonymous /portal       : 307 /auth/sign-in?next=/portal
anonymous /admin        : 307 /auth/sign-in?next=/admin
```

Client isolation, read through the signed-in client's own session (RLS applying):

```
projects visible : 3  | all own: true
tasks visible    : 15
clients visible  : 1  | only self: true

own task page     : renders, shows its title
foreign task page : renders the not-found page, title absent
foreign messages  : 404 {"error":"Conversation is unavailable."}
/admin as client  : 307 -> /portal
```

HTTP matrix on the accepted build:

| Case | Result |
| --- | --- |
| 56-hex, `type=email` | `200` |
| 56-hex, `type=magiclink` | `200` |
| Uppercase hex | `200` |
| `pkce_`-prefixed hash | `200` |
| Malformed hash | `307 → reason=invalid` |
| External `next` | `200`, sanitised to `/portal` on completion |
| **PKCE code (real email shape)** | **`200` — was `reason=invalid`** |
| `error_code=otp_expired` | **`307 → reason=expired` — was `reason=invalid`** |
| Fragment-only arrival | `307 → reason=invalid` (logged with its stage) |
| `type=recovery` | `307 → reason=invalid` |
| Cross-origin POST | `307 → reason=invalid`, no Supabase client created |

---

## 13. Acceptance criteria

| # | Question | Answer |
| --- | --- | --- |
| 1 | Exact bug? | `emailRedirectTo` pointed at `/auth/confirm`, which only accepted `token_hash`. Supabase's built-in-mailer link verifies server-side and redirects there with a PKCE code or a fragment — never a `token_hash`. |
| 2 | Why did tests pass? | Every confirm test built its URL with `token_hash`; the magic-link test asserted the buggy `emailRedirectTo` as expected output. No test used the provider's real redirect shape. |
| 3 | Is the server on Frankfurt? | Yes — proved by the `sb-tfrljxzknnhkynobvetg-…` cookies it issues; no Seoul reference in `dist/`. |
| 4 | Client auth end to end? | Yes — session, `/portal`, own data. |
| 5 | Admin auth end to end? | Yes — session, `/admin`. |
| 6 | Does the client reach the existing client ID? | Yes — `71000000-0000-4000-8000-000000000001`, 3 projects, 15 tasks, self only. |
| 7 | Does the admin reach `/admin`? | Yes, and is redirected away from `/portal`. |
| 8 | Is GET non-consuming? | Yes, for both credential shapes. |
| 9 | Is POST the only consumer? | Yes; replay returns `expired`. |
| 10 | Correct `verifyOtp` type per source? | `generateLink({type:'magiclink'})` → `verification_type: 'magiclink'`; carry it through rather than hard-coding. Frankfurt also accepts `email` as a catch-all (proved). `invite` links use `invite`. |
| 11 | Are PKCE cookies still needed? | **Yes — they are now load-bearing.** Every live sign-in email is a PKCE link, so the verifier cookie is required for the exchange. The response-bound adapter is correct and was kept. |
| 12 | Old URL or new URL in emails? | **Old** — Supabase's direct `/auth/v1/verify` URL. |
| 13 | Does scanner resistance need custom SMTP? | Yes, for emailed sign-in links. It is already active for admin invitations, resends and `npm run signin:frankfurt`. |
| 14 | RLS and isolation unchanged? | Yes. No migration, no policy change, no data change. |
| 15 | All tests pass? | 105/105, plus typecheck and lint. |
| 16 | Clean Frankfurt build? | Yes — `dist/` removed and rebuilt via `build:frankfurt`. |
| 17 | Exactly one Node server? | Yes — one PID owning `0.0.0.0:3000`. |
| 18 | Admin demo now? | Yes — `npm run signin:frankfurt -- adeelahmed@broadigo.com`. |
| 19 | Client demo now? | Yes — `npm run signin:frankfurt -- eliters8820@gmail.com`. |
| 20 | What remains for production? | §14. |

---

## 14. Remaining work — production email and domain only

None of the following blocks the local demo, and none was performed.

1. **Custom SMTP on the Frankfurt project.** Required before the auth email template can be edited at all.
2. **Complete Resend domain verification for `mail.leadsedge.us`** (DNS records via Hostinger).
3. **Customise the Magic Link template** to point at the portal's own route, which activates scanner resistance for real emails:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/portal`
   No application code change is needed — `/auth/confirm` already handles that shape, and will keep handling the PKCE shape for links sent before the switch.
4. **Add the production origin** to the Supabase Auth redirect allow-list, and set `NEXT_PUBLIC_APP_URL` to it. The new origin-mismatch warning will flag a mistake here immediately.
5. **Consider tightening the token-hash validator** back toward an exact length once the template is live and the emitted `{{ .TokenHash }}` shape (including whether PKCE tokens carry the `pkce_` prefix) has been observed in production.

### Known operational limitation until step 3 lands

A sign-in email must be opened **in the same browser that requested it**. PKCE binds the link to the verifier cookie in that browser; opening it on a different device now returns a clear `different_device` message rather than a generic failure. The TokenHash flow has no such constraint, which is a further reason to prioritise the template change.

---

## 15. Local demo procedure

```bash
npm run build:frankfurt
npm run start:frankfurt
```

Then, in a second terminal:

```bash
npm run signin:frankfurt -- adeelahmed@broadigo.com
```

The link is written to `work/sign-in-link.txt` (gitignored, owner-only) rather than printed, so a one-time token never lands in a terminal transcript. Open it in a browser, click **Continue to portal**. Use the same command with `eliters8820@gmail.com` for the client portal. Each link is single use, and generating a new one invalidates the previous one for that account.

---

# Addendum — second failure: Continue returned `reason=invalid`

**Date:** 2026-09-09, after the fix above shipped.

The confirmation page rendered, but clicking **Continue to portal** still ended at `/auth/error?reason=invalid`.

## The reported hypothesis was wrong, twice over

The suspicion was that `npm run signin:frankfurt` produced a PKCE authorization-code link requiring a verifier cookie PowerShell cannot create. Two independent pieces of evidence disprove that.

**1. The helper never produced a code URL.** `work/sign-in-link.txt`, written by the failing run itself, parses as:

```
origin+path : http://127.0.0.1:3000/auth/confirm
param keys  : [ 'token_hash', 'type', 'next' ]
type param  : magiclink
token_hash  : 56 chars, hex=true, pkce_prefix=false
code param  : absent
```

**2. A missing PKCE verifier does not produce `reason=invalid`.** Probed live against the running build with a synthetic code:

```
PROBE 3: ?code= link with no PKCE verifier
GET  : 200 | Continue rendered: true
POST : 307 /auth/error | reason: different_device
```

`AuthPKCECodeVerifierMissingError` maps to `different_device`, not `invalid`. The observed reason therefore cannot have come from that path.

### The exact server-side error could not be recovered retroactively

The server handling that click was started separately, so its `[auth-confirm]` diagnostics went to a terminal not readable from this session, and the process was later replaced. That is a gap in the setup, not in the logging: the route already records the stage and every discriminating flag. It is closed by running the server with its output captured to `work/auth-audit/server.log`.

## Actual root cause: the nonce drifted away from the state cookie

Only two branches produce `reason=invalid` on the Continue POST — a rejected origin, and rejected state. Probing both:

```
PROBE 2: a second GET happens before Continue   -> reason: invalid
PROBE 4: Continue with no state cookie at all   -> reason: invalid
```

Every GET minted a **fresh** nonce and overwrote the single state cookie. Browsers fetch a URL more than once for entirely ordinary reasons — omnibox preload, a reload, a duplicated tab, an extension, a back-navigation re-fetch forced by `Cache-Control: no-store`. When that happened, the form already on screen carried a nonce the cookie had just replaced, and Continue was rejected as tampered state.

curl never caught it: one GET, one POST, always consistent.

## Fixes

**`app/auth/confirm/route.ts`**

- GET now reuses the nonce already issued for the same credential and `next` instead of minting a new one. `createdAt` is deliberately not refreshed, so re-opening the page cannot extend the ten-minute window. A genuinely different link still mints fresh state.
- The confirmation cookie moved from `SameSite=Strict` to `SameSite=Lax`. A sign-in link is opened from outside the site, and browsers withhold Strict cookies on externally initiated navigations — which would hide the state cookie from a repeat GET and reintroduce exactly the drift being fixed. Lax still refuses to travel on a cross-site POST; the explicit `Origin` check and the HttpOnly nonce remain the actual CSRF defence, both unchanged.

**`scripts/create-sign-in-link.mjs`**

Already used `hashed_token`; now it is structurally guaranteed and covered. The pure URL builder is exported so it can be tested without contacting Supabase, `verification_type` is mapped explicitly (`magiclink`→`magiclink`, `invite`→`invite`, `signup`→`email`) and any other value fails loudly rather than being coerced, and `action_link` is never read — asserted by a test that greps the builder's own source.

## Regression coverage added

`tests/sign-in-link-helper.test.ts` (9 tests) proves the eight requested properties: TokenHash URL not an action link or code URL; never reads `action_link`; carries the reported `verification_type`; rejects unsupported types; `/portal` for client and `/admin` for admin; GET non-consuming across repeats; `verifyOtp` called exactly once; `exchangeCodeForSession` never called; and no PKCE verifier present in the exchange.

`tests/auth-confirm.test.ts` adds the two that would have caught this: one nonce is kept across repeated GETs of the same link, and fresh state is minted when a different link is opened.

The PKCE callback and the `?code=` branch are untouched and still covered — real Supabase emails still need them.

## Verification

116 tests across 19 files, typecheck and lint clean. Clean `build:frankfurt`, one Node listener. Live: both accounts sign in end to end; repeated GET is non-consuming and nonce-stable; replay returns `expired`; client isolation unchanged (3 projects, 15 tasks, self only).

A real browser was not driven for this validation, because doing so would have put a one-time token into the conversation transcript. The HTTP validation uses a real cookie jar and reproduces the browser behaviour that mattered — the repeat GET with the cookie round-trip.

## Nothing else was touched

No SMTP, Supabase settings, identities, RLS, schema, Cloudflare, Hostinger, DNS, Seoul or Tokyo changes.

---

# Addendum 2 — the live browser failure: `POST_ORIGIN_REJECTED`

**Date:** 2026-09-09, from a real Chrome click.

The confirmation page rendered; Continue returned `/auth/error?reason=invalid`, logged as `POST_ORIGIN_REJECTED` with `secFetchSite: "same-origin"`.

## Diagnosis

The origin gate was instrumented to record every value it decides from — header values only, never a credential — and the click was reproduced in a real browser against a **synthetic** token hash, so nothing real was generated or consumed:

```
[auth-confirm] {"stage":"POST_ORIGIN_REJECTED","originMatches":false,
 "originHeader":"null",
 "hostHeader":"127.0.0.1:3000",
 "forwardedHost":null,"forwardedProto":null,
 "requestUrlOrigin":"http://127.0.0.1:3000",
 "nextUrlOrigin":"http://127.0.0.1:3000",
 "configuredAppOrigin":"http://127.0.0.1:3000",
 "effectiveOrigin":"http://127.0.0.1:3000",
 "secFetchSite":"same-origin"}
```

**The framework-normalisation hypothesis is disproved.** `request.url`, `request.nextUrl.origin`, the `Host` header and the configured origin all agree on `http://127.0.0.1:3000`. That normalisation quirk is real, but only inside vitest — the standalone server resolves the true host. Nothing was normalised to `localhost`.

**The browser sent `Origin: null`.** Not a missing header: the literal opaque origin.

The cause is our own security header. The confirmation page is served with `Referrer-Policy: no-referrer`, and the Fetch standard's "append a request Origin header" step says that for a non-GET request under a `no-referrer` policy the serialized origin is set to `null`. Chrome implements this exactly. So every Continue POST from that page — TokenHash link or PKCE link — arrived with `Origin: null` and was rejected by an equality check against the real origin.

Every earlier HTTP test passed because curl sends whatever `Origin` it is told and ignores referrer policy. The same blind spot as before, one layer down: the tests modelled a browser rather than using one.

**This supersedes the nonce-drift diagnosis in Addendum 1.** Repeated GETs minting fresh nonces was a genuine latent defect, and the fix for it stands, but it was not what broke the demo. This was.

## Fix

**`lib/request-origin.ts` (new)** — resolves the origin the browser actually addressed, from the `Host` header, with the configured `NEXT_PUBLIC_APP_URL` authoritative for scheme on its own host, and forwarded headers honoured only when `LEADSEDGE_TRUST_PROXY_HEADERS=true`. `request.url` and `request.nextUrl` are no longer trusted for this decision.

**`app/auth/confirm/route.ts`** — the gate now distinguishes a stated origin from an opaque one:

- A stated `Origin` must equal the resolved origin, exactly as before. `http://localhost:3000` posting to a canonical `http://127.0.0.1:3000` is still rejected.
- `Origin: null` or absent is decided by `Sec-Fetch-Site`, which must be **present and equal to `same-origin`**. Its absence is not treated as permission.

The referrer policy was deliberately **not** weakened. Relaxing it to `same-origin` would restore a real `Origin` header, but at the cost of putting the token-bearing URL into a `Referer` — and therefore into any access log along the path. `Sec-Fetch-Site` is set by the browser and cannot be influenced by page content, so it carries the same assurance without that cost.

### Why this is not a weakened CSRF posture

| Attack | Outcome |
| --- | --- |
| Cross-site form POST | `Origin: https://attacker` → mismatch → rejected |
| Cross-site POST with `referrerpolicy="no-referrer"` | `Origin: null` but `Sec-Fetch-Site: cross-site` → rejected |
| Sandboxed iframe | `Sec-Fetch-Site: cross-site` → rejected |
| Non-browser client forging both headers | Still needs the HttpOnly state cookie and its nonce |
| Any cross-site POST | The `SameSite=Lax` state cookie never travels, so there is no nonce to match |

## Proof, in a real browser

Same synthetic token, same click, before and after:

- **Before:** rejected at the gate → `/auth/error?reason=invalid`
- **After:** no `POST_ORIGIN_REJECTED`; the request ran the full path and Supabase rejected the fake token → `/auth/error?reason=expired` ("This link has expired or has already been used")

Reaching a Supabase verification error is the correct outcome for a token that was never issued, and it proves the origin gate, state cookie and nonce all passed.

## Regression coverage

`tests/auth-confirm-origin.test.ts` (11 tests). Requests carry an explicit `Host` header, which both models the real server and proves the route resolves the origin from the request rather than from the framework-normalised `request.url`:

1. `Origin: http://127.0.0.1:3000` → passes the gate
2. `Origin: null` + `Sec-Fetch-Site: same-origin` → passes (the live failure)
3. `Origin: null` + `Sec-Fetch-Site: cross-site` → rejected
4. Absent Origin with no site signal → rejected
5. `Origin: http://localhost:3000` against canonical `127.0.0.1:3000` → rejected
6. External origin → rejected
7. External origin claiming `Sec-Fetch-Site: same-origin` → rejected
8. State cookie still required after the gate passes
9. Matching nonce still required after the gate passes
10. TokenHash POST calls `verifyOtp` exactly once, never `exchangeCodeForSession`
11. PKCE code POST calls `exchangeCodeForSession` exactly once, never `verifyOtp`

## Demo helper — verified correct, unchanged

`npm run signin:frankfurt -- eliters8820@gmail.com` writes to `work/sign-in-link.txt`:

```
origin+path: http://127.0.0.1:3000/auth/confirm
params     : token_hash, type, next
type       : magiclink | next: /portal
code param : absent
supabase.co in URL: false
```

The helper's output was never the problem. A `?code=` URL means the Gmail/Supabase link was clicked rather than the helper link — and that path now works too.

## Verification

127 tests across 20 files, typecheck and lint clean. Clean `build:frankfurt`, no Seoul reference, one Node listener. Live: both accounts sign in end to end; GET non-consuming and nonce-stable across repeats; replay returns `expired`; a PKCE link without a verifier still reports `different_device`.

Nothing was changed in Supabase settings, SMTP, RLS, schema, identities, Cloudflare, Hostinger, DNS, Seoul or Tokyo.
