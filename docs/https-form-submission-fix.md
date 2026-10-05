# HTTPS confirmation submission audit

Date: 2026-10-06. Permanent production origin: `https://portal.leadsedge.us`.

## Root cause and live evidence

A controlled, no-email sign-in using an existing synthetic Frankfurt test client reproduced the deployed defect:

1. HTTPS GET `/auth/confirm` returned a confirmation page. Its form action was relative (`/auth/confirm`) and its state cookie was Secure.
2. The successful HTTPS Continue POST returned **307 Location: `http://portal.leadsedge.us/portal`**.
3. That HTTP destination returned 301 back to HTTPS.

A 307 preserves the POST method/body. The successful form submission therefore downgraded to HTTP before returning to HTTPS. This explains the mobile Chrome warning; HTTPS on the initial page does not prevent an insecure redirect after submission. Admin and client use the same success branch, differing only in the destination. The test session was signed out afterward. The initial test harness followed the same-host HTTP destination with its in-memory cookie header; it did not emulate Secure-cookie enforcement. No real customer session was used. Subsequent validation does not follow redirects.

The route used `new URL(request.url).origin` for its final absolute redirect. Installed Vinext `dist/server/proxy-trust.js` defaults request protocol to HTTP unless `VINEXT_TRUST_PROXY=1` or a nonempty `VINEXT_TRUSTED_HOSTS` enables proxy trust. Hostinger terminates public HTTPS before the Node app. The observed HTTP Location proves that the deployed route's effective origin was HTTP. Hostinger's actual environment values and raw internal headers were not directly inspected.

Harmless missing-token/error probes returned HTTPS on the deployed site, so they alone did not reproduce the successful submission defect.

## Audit scope

Searched application, components, shared helpers, proxy, configuration, scripts, tests, and repository references for HTTP URLs, old Hostinger hosts, request/nextUrl origins, URL constructors, form actions, server actions, forwarding headers, and application-origin environment variables.

- Confirmation uses a relative form action; no change needed to that action.
- Shared messages, feedback, and sign-in forms submit through same-origin client handlers. Admin people search uses a relative action.
- Confirmation, legacy callback, and sign-out used request-derived redirect origins.
- Email links, invitations, assignment links, and Google calendar callback destinations use `appUrl()` and now inherit the canonical origin.
- Other request URL uses parse query parameters or produce diagnostics, rather than external destinations.
- No active shared form contains a hard-coded old Hostinger action. Local development/test/tooling HTTP URLs remain intentional.

## Changes

| File | Change |
| --- | --- |
| `lib/app-origin.ts` | Shared canonical external origin; non-loopback configurations map to permanent production HTTPS; explicit localhost/127.0.0.1/IPv6 loopback configurations remain supported. Does not trust caller-supplied forwarding headers for outbound destinations. |
| `lib/env.ts` | `appUrl()` uses the shared origin for all generated application links. |
| `lib/request-origin.ts` | Uses the same canonical configured origin when determining the scheme for its matching host; existing origin/nonce/state protections retained. |
| `app/auth/confirm/route.ts` | Canonical redirect/cookie origin; 303 redirects ensure POST becomes GET on success or failure. |
| `app/auth/callback/route.ts` | Canonical legacy callback redirects. |
| `app/auth/sign-out/route.ts` | Canonical sign-out redirect. |
| `app/layout.tsx` | Canonical metadata base. |
| `tests/app-origin.test.ts` | Production, obsolete host, malformed config, local origins, and hostile forwarding-header regression coverage. |
| `tests/auth-confirm.test.ts` | HTTP upstream/HTTPS browser tests for both roles and both credential kinds; checks 303, HTTPS, cookies, non-consuming GET, and cross-origin rejection. |
| `docs/https-form-submission-fix.md` | This report. |

No database, RLS, identity, provider configuration, SMTP, DNS, or Hostinger configuration was changed. PKCE and TokenHash verification behavior and role authorization are preserved.

## Hostinger deployment configuration

Set **`NEXT_PUBLIC_APP_URL=https://portal.leadsedge.us` in both the build environment and runtime environment**. Remove any old Hostinger or localhost value from production. Vinext embeds this public variable at build time: an actual local-origin build continued using its compiled local origin even when launched with a production runtime override. A fresh build is required; restart alone is insufficient.

For accurate framework request origins behind Hostinger, set `VINEXT_TRUSTED_HOSTS=portal.leadsedge.us` when Hostinger overwrites trusted forwarded headers. This also enables forwarded protocol handling; a separate `VINEXT_TRUST_PROXY=1` is redundant. The upstream should receive `X-Forwarded-Proto: https` and the public host. Do not enable broad proxy trust on an unprotected, directly accessible upstream. Corrected external redirects do not depend on this setting.

`LEADSEDGE_TRUST_PROXY_HEADERS` is a separate application origin-check setting, not Vinext's setting. Preserve it unless the proxy replaces Host with an internal host; in that case it must be true only behind the trusted header-overwriting proxy. Do not relax cross-origin validation.

Local development remains supported using an explicit local `NEXT_PUBLIC_APP_URL`, including the existing Frankfurt local environment. Build local standalone output with the local URL; build deployment output with the production URL.

## Validation

- Full test suite: **43 files, 368 tests passed**.
- Typecheck: passed.
- Lint: passed.
- Frankfurt standalone production build with local configuration: passed.
- Production-origin Frankfurt standalone build: passed (build-time `NEXT_PUBLIC_APP_URL=https://portal.leadsedge.us`, Frankfurt backend unchanged).
- Real HTTP probe against that standalone build: confirmation GET 200 with relative action and Secure state cookie; invalid-state POST 303 directly to `https://portal.leadsedge.us/auth/error?reason=invalid`; callback redirected to the same HTTPS origin. Temporary probe server stopped afterward.

Unit regressions cover successful admin/client POSTs for both TokenHash and PKCE against an HTTP request URL with an HTTPS browser origin. Each returns the expected HTTPS destination with 303 and attached session cookies. GET remains non-consuming; cross-origin POST is rejected before verification.

The standalone probe uses only a synthetic hash and invalid state, never calls verification with a real token, and never follows redirects. Live production will retain the defect until these changes are rebuilt and redeployed. After deployment, manually test one fresh email Continue for each role and confirm the POST returns 303 directly to the HTTPS destination with no intervening HTTP request.
