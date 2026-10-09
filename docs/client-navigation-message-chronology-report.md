# Client navigation, message chronology, and RBAC audit

Date: 2026-10-09.

## Status

Client Meetings removal and shared message chronology are implemented. **Multi-admin RBAC is proposed, not implemented or approved.** No database/schema/RLS/Auth/account changes were applied. No email, invitation, test message, production deployment, or Git push was performed.

Baseline: clean working tree at `9cb5605610f4d3213c91f554f168088e9e1a47e4`; 46 test files / 390 tests passed before edits.

Final runtime: temporary demo preview stopped; one normal Frankfurt standalone listener on port 3000 (PID 18812 at verification). `/auth/sign-in` returned HTTP 200 without the demo banner. Open `http://127.0.0.1:3000` for manual testing. No authenticated staging session was generated.

## Client Meetings

- Shared client navigation now contains Home, Tasks and Messages on desktop, tablet and mobile. The mobile grid has three equal columns.
- Removed the home booking/upcoming-meeting card, meeting wording and its unused home-loader query.
- Both `/portal/meetings` and `/portal/meetings/[meetingId]` authorize the client and then redirect to `/portal`.
- Historical notifications are retained. A client meeting notification targets Home instead of opening the retired meeting interface.
- Admin Meetings routes, actions, availability, calendar integrations and database records remain unchanged. The built admin Meetings route returned HTTP 200 during local demo validation.
- Client booking/cancellation APIs, meeting screen-data authorization and shared scheduling utilities remain unchanged because changing backend authorization requires approval. No client meeting page is left exposed by the retired routes. Existing email deep links safely reach the redirect.

## Shared conversations

All project/task chat contexts, including embedded task conversations, use `Conversation` and now share one formatter/grouping function.

- Each persisted message displays the authoritative `createdAt` value as a 12-hour local time with AM/PM, beneath its bubble and aligned to its sender.
- Group headings are Today, Yesterday, weekday for two through six days ago, and full date for older/future dates.
- Local calendar-date arithmetic handles 23/25-hour DST days; it does not subtract elapsed 24-hour intervals.
- The server and initial hydration render neutral placeholders; `useSyncExternalStore` supplies the browser timezone afterward. A local-midnight timer and foreground/visibility refresh update labels without network polling.
- UTC timestamps/storage are unchanged. Optimistic entries say “Sending…” until the server timestamp replaces them.
- Grouping runs over deduplicated, flattened history, so page boundaries do not duplicate date separators.
- Earlier-history loading preserves scroll position by measuring the list before prepend and applying the height difference after commit. Realtime delivery, optimistic reconciliation, cursor/page size, cache identity and 500-message retention logic are unchanged.
- Neutral theme tokens give gray labels in light mode and muted light-gray labels on near-black surfaces in dark mode. Timestamps are not brand red.

## Validation evidence

| Check | Result |
|---|---|
| Baseline suite | 46 files, 390 tests passed |
| Final full suite | 48 files, 402 tests passed |
| Typecheck | Passed |
| Lint | Passed |
| `npm run build:frankfurt` | Passed; standalone output generated |
| `git diff --check` | Passed; only repository CRLF conversion warnings |
| Built GET `/portal/meetings` | 307; Location `/portal` |
| Built GET `/portal/meetings/<id>` | 307; Location `/portal` |
| Built GET `/admin/meetings` | 200; Meetings content present |
| Browser project conversation | One August 25, 2026 heading; authoritative 4:00 PM / 4:08 PM times |
| Browser task conversation | One August 26, 2026 heading; authoritative 2:10 PM / 2:22 PM times |
| Browser mobile/client | Home / Tasks / Messages only; equal-width bottom navigation |
| Browser desktop/client | Home / Tasks / Messages only; booking card absent |
| Browser themes | Light project conversation and dark mobile/desktop conversations inspected |

New tests cover route redirects, historical meeting targets, client/admin navigation boundaries, Today/Yesterday/weekday/older date labels, Karachi midnight, both New York DST transitions, grouping across pages, optimistic/realtime response deduplication, authoritative timestamp use, 500-message retention and hydration-safe server snapshot.

The build was previewed temporarily at `127.0.0.1:3001` with explicit demo data. It did not read/mutate Frankfurt business records. The demo has an existing client-cache identity mismatch on SPA Messages navigation, so shared conversation rendering was checked through the admin demo path. Its realtime warning is expected without an authenticated staging session. **Live authenticated realtime delivery, a 50+ message browser pagination run, and physical mobile Chrome were not exercised in this pass.** Existing regression tests passed; no claim is made that mocks replace those live checks.

## RBAC findings and proposal

Read-only Frankfurt evidence confirms two admin identities and a broad role-based model: `is_admin()` checks only `public.users.role = 'admin'`, and many RLS policies/definer functions admit every admin. A UI-only permission editor would be insecure.

The [full RBAC proposal](multi-admin-rbac-proposal.md) contains the live identities, existing risk map, module/action matrix, two-role entitlement model, explicit-grant presets, server/RLS/definer enforcement, invitation acceptance, revocation/cache handling, Super Admin safeguards, recovery, rollback and security-test plan. The [live inventory](proposals/rbac-live-inventory.md) preserves actual policy and function definitions.

The [foundation SQL](proposals/rbac-01-foundation.sql) and [enforcement SQL](proposals/rbac-02-enforcement.sql) are **unapplied review drafts outside `supabase/migrations`**, not a deployable RBAC release. The proposal explicitly identifies the remaining field-sensitive write/invitation RPCs, metadata filtering, bootstrap/cache/UI cutover, and database validation required before final execution-ready migration approval.

Proposed bootstrap: Adeel Ahmed becomes active Super Admin; the synthetic performance admin becomes disabled while retaining identity and owned records. Neither change has occurred. Approval must explicitly confirm both treatments or specify the synthetic account's intended grants.

## Changed files

Application:

- `app/globals.css` — three-column client nav and theme-aware chronology styles.
- `app/portal/meetings/page.tsx` — safe list-route redirect.
- `app/portal/meetings/[meetingId]/page.tsx` — safe detail-route redirect.
- `app/portal/notifications/page.tsx` — client notification destination handling.
- `components/portal/portal-shell.tsx` — remove Meetings from shared client nav.
- `components/cache/home.tsx` — remove meeting card/wording; map historical meeting links.
- `components/notifications-list.tsx` — client-only destination mapping; admin behavior retained.
- `lib/client-navigation.ts` — safe historical notification destination helper.
- `lib/screen-data.ts` — remove home-only meeting read; admin reads retained.
- `components/conversation.tsx` — chronology rendering and earlier-history scroll restoration.
- `components/use-message-clock.ts` — hydration-safe browser timezone/local-day tracking.
- `lib/message-time.ts` — shared calendar grouping/time formatting.

Regression coverage:

- `tests/client-meetings-removal.test.ts`
- `tests/message-time.test.ts`

Documentation / unapplied design:

- `docs/client-navigation-message-chronology-report.md`
- `docs/multi-admin-rbac-proposal.md`
- `docs/proposals/rbac-live-inventory.md`
- `docs/proposals/rbac-01-foundation.sql`
- `docs/proposals/rbac-02-enforcement.sql`

Ignored `work/` files contain read-only audit scripts/output and local edit helpers; they are not application or migration artifacts.

## Approval boundary

Approve the RBAC architecture, Super-only admin management, coordinated database/API/UI enforcement, and explicit account bootstrap before implementation. Final cutover SQL and isolated database regression evidence must be reviewed before any Frankfurt execution. The completed UI improvements do not depend on applying RBAC.
