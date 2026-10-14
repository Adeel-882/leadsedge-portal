# Resend hosted transactional templates — review package

Prepared 2026-10-15. Local implementation only. No emails sent, provider templates created/published, database changes, push or deployment. Existing auth and Multi-Admin files are unchanged.

## Integration

Seven categories are wired through lib/hosted-email.ts using installed Resend 6.24.0. Both ENABLED=true and a nonempty ID are required per category. No environment file was changed. Disabled/missing-ID categories use the original HTML before any provider attempt. Hosted mode omits HTML, text and subject: the published template owns presentation and subject. Sender and recipient remain application-controlled. Provider errors are sanitized; exceptions still follow the caller's exception path. No second send/fallback occurs after a hosted attempt.

Assignment selection, queue-time data, destination, idempotency key, delivery records and retries are unchanged. Automation queue/claim/update logic is unchanged. Meeting templates intentionally have no recipient-name greeting: existing payload names sometimes identify the client rather than the receiving administrator. Feedback-submitted names identify the submitting client. No administrator invitation integration is included.

## Configuration and contracts

For every prefix below set PREFIX_ID to the published template ID/alias and PREFIX_ENABLED=true only at approved activation. Default/false/missing means legacy.

| Category | Configuration prefix | Variables |
|---|---|---|
| client_invitation | RESEND_TEMPLATE_CLIENT_INVITATION | CLIENT_NAME, ACTION_URL |
| task.assigned | RESEND_TEMPLATE_TASK_ASSIGNED | CLIENT_NAME, TASK_TITLE, ACTION_URL |
| feedback.requested | RESEND_TEMPLATE_FEEDBACK_REQUESTED | CLIENT_NAME, TASK_TITLE, PROJECT_NAME, ACTION_URL |
| feedback.submitted | RESEND_TEMPLATE_FEEDBACK_SUBMITTED | CLIENT_NAME, TASK_TITLE, PROJECT_NAME, ACTION_URL |
| meeting.confirmation | RESEND_TEMPLATE_MEETING_CONFIRMATION | MEETING_TITLE, START_DISPLAY, TIMEZONE, ACTION_URL |
| meeting.cancelled | RESEND_TEMPLATE_MEETING_CANCELLED | MEETING_TITLE, START_DISPLAY, TIMEZONE, ACTION_URL |
| meeting.reminder | RESEND_TEMPLATE_MEETING_REMINDER | MEETING_TITLE, START_DISPLAY, TIMEZONE, ACTION_URL |

Manifest: manifest.json contains proposed aliases, exact subjects, HTML filenames and variable definitions. IDs are not provisioned. Do not paste credentials into defaults. No PROJECT_NAME is invented for assignment emails; that payload only needs the client, task and URL.

## Designs and previews

All seven root HTML files are provider-ready source drafts with triple-brace placeholders. previews/ contains synthetic rendered copies and index.html is a review gallery at mobile width. Official colors, inline styles, presentation tables, fluid 600px cards and raster logo are used. Template names/copy/CTA/subjects live here, not in the hosted send payload.

The adapter HTML-escapes variables for these reviewed HTML text/quoted-attribute contexts. Preserve these contexts when editing. ACTION_URL entities decode to the original URL when clicked. Do not move escaped variables into subjects, raw CSS or scripts; current subjects are static. Actual Resend interpolation, encoded URL round trip and Gmail rendering must be tested with an approved disposable inbox before activation. Local HTML previews cannot prove Gmail dark-mode behavior. Missing or oversized variables fail before delivery rather than producing a broken email.

## Logo evidence

https://portal.leadsedge.us/brand/leadsedge.jpg returned HTTPS 200, Content-Type image/jpeg, Content-Length 10924 on 2026-10-14 18:58 UTC. This is the existing public/brand/leadsedge.jpg asset, also used by the app. Displayed at 56x56 with alt text. Server cache max-age is 31536000: use a versioned asset URL if the logo changes rather than assuming immediate cache refresh. No substitute logo was generated.

## Meeting hold

Do not enable meeting templates yet. Repository cancellation RPC definitions omit targetUrl; automation falls back to /portal/meetings even for the administrator. Confirmation/reminder payloads have role-specific links. This integration deliberately preserves destinations; review live definitions and all meeting routes in a separately approved change before activation. Existing meeting history also distinguishes meeting.confirmation email events from meeting.booked notifications.

## Resend dashboard setup (requires separate approval)

1. Create seven draft transactional templates using names/aliases in manifest.json.
2. Import the corresponding root HTML, set the exact manifest subject and declare listed string variables. Use only synthetic preview values. ACTION_URL must have no real credential as a default.
3. Keep application-controlled From. Preserve the actual logo URL and ACTION_URL button placeholder. Do not add required variables without coordinating code.
4. Preview mobile/desktop, light/dark, images blocked and long names. Verify escaping is not double-applied by the provider. Check HTML and generated plain-text output; template API cannot also send an application text body.
5. After approval publish, record template ID, export the published definition and retain the initial version. Publishing alone does not enable application sending.
6. Set only the approved category's configuration and restart/redeploy as required by hosting environment loading. Later compatible published design/copy edits need no application deploy.

## Deployment and Multi-Admin isolation

Development base: 716d8120510104673251436ab9494e0c324fe295. This is NOT a verified production baseline. Existing release documentation says Multi-Admin was already committed; a clean status does not exclude it. No Hostinger deployment SHA/artifact is available in this task. STOP before deployment until the deployed SHA and backup artifact are obtained.

work/resend-templates-only.patch is a focused patch against that development base, not a validated production release. It includes only the four email implementation files, tests and this review package. Apply/check it in a separate branch/worktree from the verified production baseline; resolve incompatible hunks by review, rerun all checks and inspect the full release diff. Do not ship this checkout or its local build wholesale. Do not run migrations. No schema migration is needed for this feature.

Changed paths: lib/email.ts, lib/assignment-email.ts, lib/automation.ts, new lib/hosted-email.ts, new tests/hosted-email.test.ts, and docs/resend-templates/ (manifest, seven source HTML files, seven previews, preview index and this README). No dependency, auth, RLS, scheduling, notification-trigger or administrator-invitation changes.

## Rollout / rollback

Start with task.assigned only, then client_invitation, feedback.requested and feedback.submitted. Hold all meeting categories. Obtain an approved disposable inbox before real sends. Test exact delivered href, logged-out task continuation, logged-in authorized access, foreign-client rejection, invitation Continue/reuse rejection and delivery IDs. Never publish a real invitation URL in a dashboard preview.

Before changing mode/template IDs, finish or reconcile outstanding attempted sends in that category. Do not switch payload modes mid-retry: assignment provider keys require stable payloads. Existing retries retain their current behavior; general automation has no provider idempotency key and this change does not introduce one. After an uncertain outcome, reconcile rather than replay with another mode. Rollback future sends by disabling that category; reconcile attempted rows first. Alternatively restore and publish backed-up template content. Do not reset sent statuses or generate replacement credentials just to retry rendering.

## Validation

Initial sandbox runs hit Windows EPERM dependency/temp-file errors; rerun outside the sandbox is required. Final full suite: 472 passed, 1 optional skipped (55 passing files, 1 skipped). Focused final email suite: 31 passed. Typecheck and lint completed without reported errors. Frankfurt standalone build passed outside the sandbox (exit 0). A 390px browser-frame preview was visually inspected: logo, copy, button and footer fit without horizontal clipping. Real Gmail/light-dark rendering still needs the approved delivery test. Provider sends and actual Gmail/device checks remain deliberately unperformed pending approval.
