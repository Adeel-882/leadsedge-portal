# Magic Link-only release plan

Prepared October 12, 2026. Planning only: no push, deployment, or Supabase mutation authorized. Keep the existing administrator account and authorization model.

## Exact release scope

`work/magic-link-only.patch` contains only these working-tree changes relative to HEAD:

| File | Change |
| --- | --- |
| app/auth/sign-out/route.ts | Explicit SDK scope `local`, rather than the global default. |
| app/auth/confirm/route.ts | Accept same-origin nested `/auth/confirm` destinations alongside `/auth/callback`; correct the explanatory template comment. |
| tests/auth-confirm.test.ts | Four regressions: independent browser state without PKCE, provider-rejected replay, nested task destination, external destination rejection. |
| tests/auth-sign-out.test.ts | Two regressions for local logout and HTTPS/local redirects. |

Optional Git documentation: this plan, `docs/multi-device-admin-signin-fix.md`, and `docs/auth-templates/magic-link-tokenhash-proposed.html`. Committing or deploying the proposed HTML does not activate it in Supabase.

Do not copy entire current auth files into an older release: they also contain committed Multi-Admin integrations. Apply the patch hunks only, then inspect the complete release diff.

## Multi-Admin separation

HEAD `e8d4b11a81a216153456271b0a672b59e67b41b7` already commits Multi-Admin routes, UI, invitation services, auth-session/confirmation integration, tests and `202610090001_simple_admin_invitations.sql`. Its parent `ad714b4` is a candidate pre-feature baseline, NOT a verified deployed production SHA. Selective staging on HEAD does not remove these committed features from an artifact.

Additionally exclude the unrelated working-tree changes in `scripts/test-administrator-database.mjs`, `tests/security/administrator-compatibility.sql`, and `docs/simple-multi-admin-final-readiness.md`.

Before execution, identify the actual deployed Git SHA/artifact. Prepare an isolated release branch from that verified single-admin baseline and apply the narrow patch. If the deployed baseline already includes Multi-Admin, stop and prepare a separately reviewable removal plan; do not silently revert shared auth code. Do not ship HEAD wholesale or run migrations. Preserve all unfinished work in the existing checkout.

## Compatibility

App-first rollout preserves existing login paths: no changes to OTP requests, PKCE code exchange, callback, TokenHash verification, cookies, CSRF checks, role checks or provider settings. The extra redirect case only unwraps a validated same-origin destination. The deliberate logout change makes logout device-local.

Existing ConfirmationURL emails continue using their existing flow, including its scanner-consumption and cross-browser PKCE limitations. The app-only release does not fix those emails retroactively. Old links remain supported until consumed, superseded or expired. New template emails use existing TokenHash POST verification without the requesting device's verifier.

## Deployment order after separate execution approval

1. Record current deployed SHA and preserve its deployable artifact and environment configuration securely. Never put credentials in Git or this report. Verify `NEXT_PUBLIC_APP_URL=https://portal.leadsedge.us` in the production build/runtime configuration.
2. Prepare the isolated four-file patch release as above. Review its full baseline-to-release diff; rerun focused/full tests, typecheck, lint and the Frankfurt build on that exact tree. Prior checkout results (52 files, 436 tests; typecheck/lint/build passed) are not a substitute for testing the isolated release tree.
3. Deploy the application first. Leave Supabase templates/settings unchanged. Verify a fresh same-browser login, admin/client destinations, task deep link and logout. No Multi-Admin migration or identity changes.
4. Immediately before the separately authorized template change, read and securely back up the exact live Magic Link subject and HTML. Record timestamp/project reference and content checksum. Compare with the earlier backup `work/magic-link-template-before.html`; if content drifted, review the replacement again. This ignored local backup is not an external disaster-recovery copy.
5. Change only Magic Link HTML to the reviewed proposed file. Keep subject `Your secure LeadsEdge Portal sign-in link`. Leave Invite template, SMTP, expiry, sessions, allowlist, RLS and schema unchanged. Re-read the saved template and verify exactly the intended href change.
6. Run the fresh-email acceptance below. Record only safe stages, statuses and request IDs. Never record full links, hashes, codes, tokens or cookie values.

The proposed file matches the captured original template after exactly one href replacement (line endings and outer whitespace normalized):

```html
https://portal.leadsedge.us/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;next={{ .RedirectTo | urlquery }}
```

Provider rendering and actual delivery of this template remain to be validated after authorization.

## Rollback

- Template/delivery failure: restore the exact backed-up Magic Link HTML and subject; re-read to confirm. Keep the compatible app release. This restores the former scanner/PKCE limitations too.
- Application rollback: restore the template first, then the saved app artifact. Already-delivered TokenHash emails cannot be rewritten; the reviewed pre-feature candidate supports TokenHash, but verify the actual rollback artifact does too and test its destination handling. Nested deep links may fall back to the role home in older code.
- No schema rollback, role changes, identity deletion or global logout. Consumed/superseded credentials cannot be revived; request a fresh email after recovery. Restoring old app code also restores its global sign-out behavior.

## Fresh desktop/cross-device acceptance

Use the existing authorized account; no new administrator identities. Finish each test before requesting the next email so later requests do not supersede pending links.

1. Desktop A requests a fresh email and opens it on A: production HTTPS confirmation appears; GET does not authenticate; explicit Continue reaches `/admin`.
2. A requests another fresh email. Transfer it privately to a clean desktop B/profile without A's cookies. B opens the same app TokenHash URL, sees Continue, and reaches `/admin` after one POST. Do not export/copy cookies. Verify there is no PKCE exchange for this flow.
3. Verify both devices can make authenticated requests, then sign out B. Verify A still works after a real session refresh, not just cached-page rendering; B is signed out.
4. With another fresh link, perform controlled preview/repeated GETs before human Continue. Prefer a GET-only controlled probe; Slack preview testing should only use an explicitly approved private destination. Preview must not redeem a token. Human POST succeeds once; replay in a clean context is rejected.
5. Repeat fresh mobile-request to desktop-open. Check an existing authorized client and a task deep link reach their permitted destination with no cross-role access.
6. Verify expired/reused credentials fail safely without ending another device's existing session. Do not lower production expiry to test this.

The user's AirForShare success supports cross-device feasibility of that tested link; it does not by itself validate this unactivated template. Captured provider logs independently identified Slack's earlier consuming GET.

Stop before execution. No push, deployment or provider change has been performed for this plan.
