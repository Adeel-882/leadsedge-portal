# LeadsEdge light/dark brand transformation

Completed October 5, 2026. UI-only change, locally built with the Frankfurt environment.

## Before and after

The previous system used #176f65 primary teal, #0f5a52 dark teal, #e6f1ef selected tint, green-tinted neutrals, fixed white component backgrounds and no theme preference. The full app now uses shared light/dark semantic tokens with #FF4134 brand accents. Navigation, progress, unread badges, project/task conversation selection and own-message bubbles use the new identity. Uploaded logo bytes are preserved in public/brand/leadsedge.jpg with a square, contained rendering.

The per-file audit is in [theme-color-audit.md](theme-color-audit.md). It lists the old utility and semantic replacement; later contextual corrections are noted at its top. No hardcoded hex colors remain in app/component TSX. Colors reside in globals.css, apart from the intentionally self-contained confirmation-page stylesheet. Email templates are excluded from this UI task.

## Exact palettes

CSS variables are defined in app/globals.css and exposed as Tailwind semantic utilities through @theme inline. Root data-theme selects the palette. Layout dimensions and existing responsive Messages containment are preserved.

| Token | Light | Dark |
|---|---|---|
| canvas | #f7f7f5 | #070707 |
| surface | #ffffff | #111111 |
| surface-subtle | #f3f3f1 | #171717 |
| surface-strong | #e9e9e5 | #242424 |
| elevated | #ffffff | #1b1b1b |
| ink | #171717 | #f7f7f2 |
| muted | #666662 | #b0b0aa |
| muted-strong | #484844 | #d2d2cc |
| line | #e5e5e1 | #303030 |
| line-strong | #d4d4cf | #555550 |
| brand | #ff4134 | #ff4134 |
| brand-hover | #f03b2e | #f03b2e |
| brand-text | #bd291f | #ff756b |
| brand-soft | #fff0ed | #301715 |
| brand-foreground | #171717 | #171717 |
| danger | #a52632 | #ffa3ab |
| danger-soft | #fff0f2 | #35191e |
| danger-border | #e5bcc1 | #71313b |
| danger-fill | #972130 | #972130 |
| success | #216642 | #85d7a1 |
| success-soft | #edf7f0 | #14291d |
| warning | #77530f | #efd080 |
| warning-soft | #fff6df | #302713 |
| warning-border | #d9c18c | #6b562a |
| info | #365e86 | #a1c8ee |
| info-soft | #edf4fb | #162738 |
| track | #e5e5e1 | #303030 |
| toast-bg | #242424 | #ededeb |
| toast-fg | #ffffff | #171717 |

Focus halo: rgb(255 65 52 / .22). Global keyboard focus outline uses brand red. Reduced-motion handling is retained. Shadows are neutral black with restrained opacity rather than green-tinted shadows. Destructive controls use danger text, border and soft fill, separating them from solid red primary actions.

## Preference and rendering

lib/theme.ts contains the only preference/store implementation. localStorage key leadsedge-theme accepts light/dark, defaults to light and tolerates blocked storage. A small root head script applies the saved preference before body paint. The root HTML attribute suppresses the expected pre-hydration attribute difference. useSyncExternalStore supplies a stable light server snapshot and updates the accessible toggle after hydration. Storage events synchronize other tabs; same-tab events synchronize controls and unsubscribe on unmount.

ThemeToggle appears beside notifications/avatar in both admin and client headers, including mobile, and in the normal auth shell. Existing Phosphor Sun/Moon icons and native button keyboard behavior are used. Labels describe the next action. Switching changes only the HTML data attribute, localStorage and a local event: no fetch, router call, cache invalidation, Supabase call, reload or subscription is added.

/auth/confirm intentionally remains fixed light with red/neutral styling and no new JavaScript or external assets. A comparison with HEAD after stripping its style block confirms its remaining source is identical. Auth behavior is unchanged.

## Coverage

- Shared primitives: primary/secondary/ghost/danger/icon controls, fields, checkboxes/radios, cards, status pills, tables, menus, dialogs/drawers, empty states, skeletons, rich text, notifications, progress and avatars formerly tied to teal.
- Admin: dashboard/metrics/project table and actions, People/profile, Templates/editor, project overview/tasks/editor/import, Meetings, Settings/availability/calendar connection, Messages/project selector, activity and notification surfaces.
- Client: Home/priority cards, task lists/details and feedback forms, Messages, Meetings/booking fields, account and notifications.
- Messages: rail, selected indicator, search, project selector, unread pill, pane, bubbles and composer all use theme tokens. Sending, ordering, pagination, receipts and realtime logic are unchanged.
- Mobile admin navigation: six existing items now use six columns instead of wrapping the last two into a second row. Client bottom navigation retains its four-column layout. Theme toggle stays in the header.

Intentional green is limited to actual success/healthy/completed status: active/completed chips, successful sign-in request, saved settings/availability, connected calendar, setup success and invitation sent status. Blue/amber remain for information/warnings. Existing external/uploaded content is not recolored. Neutral avatar fills formerly tied to teal now use brand-soft; the logo image itself is unmodified.

## Accessibility

Normal-size white text on #FF4134 measures only 3.47:1. To retain the exact requested brand fill while meeting AA normal-text contrast, primary buttons, own-message bubbles and unread counts use #171717 (5.17:1). Hover #F03B2E keeps 4.58:1. Small red links/labels use #BD291F in light and #FF756B in dark. Automated tests enforce >=4.5:1 for body, muted, brand foreground, hover foreground, brand text on selected fill, and semantic status text/fills in both themes. This is targeted contrast validation, not a formal whole-site accessibility certification.

## Validation

- Full suite: 339 tests passed across 39 files (330 existing plus 9 theme cases).
- Theme tests cover stored dark/light/invalid/missing values, blocked storage, instant switching, persistence, notification/unsubscription, cross-tab changes and palette contrast.
- npm run typecheck: passed.
- npm run lint: passed.
- git diff --check: passed (only existing Windows line-ending warnings).
- Clean npm run build:frankfurt: passed; standalone output regenerated after removing only the verified repository dist directory. Build reports informational plugin timing notices.
- Browser: real built Node app, authenticated existing admin/client staging accounts, with previously approved no-email temporary sign-ins. Both themes viewed for Admin Dashboard, People, Templates, Meetings, Settings, project detail; Client Home, task detail and Messages. Task list/meeting controls also checked. Dark task editor and template editor, new-project modal, project selector and row menu inspected without saving.
- Dark choice survived route changes and hard refresh. Enter activated the toggle. Desktop, 820x1180 tablet and 390x844 mobile checks performed. Client mobile had no page overflow; desktop routes had no page overflow. Wide admin tables retain their internal horizontal scroll; the browser also reports a root horizontal scroll extent at the narrow admin dashboard despite all non-table element bounds fitting. No clipping workaround was added to hide it.
- Final admin mobile nav measurement confirms all six links share one row and fit the bottom bar.
- Messages composer remained visible on the checked desktop/tablet views. No message sends, completion, imports, invitations or scheduling submissions were performed for this theme task.

## Screenshots

Saved under work/. Main finished-screen pairs:

| Screen | Light | Dark |
|---|---|---|
| Admin dashboard | theme-light-admin-dashboard.png | theme-dark-admin-dashboard.png |
| Admin Messages | theme-light-admin-messages.png | theme-dark-admin-messages.png |
| Client Home | theme-light-client-home.png | theme-dark-client-home.png |
| Client task detail | theme-light-client-task.png | theme-dark-client-task.png |
| Client Messages | theme-light-client-messages.png | theme-dark-client-messages.png |

Additional screenshots: admin/client mobile, tablet Messages, admin modal/menu, task/template editors, project selector and client meetings. Original dashboard, client home and client task screenshots are available as theme-before-*.png. The original Messages captures caught loading skeletons, so they are not claimed as completed-conversation before/after comparisons. There was no old dark theme to capture.

## Scope and limitations

No schema, RLS, publication, Supabase configuration, business-data scripts, authentication logic, emails, scheduling, template import, unread calculation, query keys, cache/realtime logic or infrastructure configuration changed. Normal page reads retain the app's existing read/seen behavior. Temporary no-email sign-ins were used only for browser validation, not new accounts or permissions. No Hostinger deployment performed.

Native date/select popups follow browser color-scheme; OS-specific rendering was not exhaustively tested. A selected available meeting slot was not booked; slot styles were audited in the existing component. The no-JS confirmation page intentionally does not follow the stored dark preference. Historical email artwork and externally supplied rich content remain outside this theme scope.

## Changed files

Core: app/globals.css, app/layout.tsx, lib/theme.ts, components/theme-toggle.tsx, components/brand.tsx, public/brand/leadsedge.jpg, tests/theme.test.ts.

Presentation updates span the admin/client/auth shells and the page/component files listed in theme-color-audit.md. The only route handler touched is app/auth/confirm/route.ts, and only its CSS. The detailed file list below includes all tracked changes and new deliverables.
- app/admin/meetings/[meetingId]/page.tsx
- app/admin/people/[clientId]/page.tsx
- app/admin/projects/[projectId]/page.tsx
- app/admin/projects/[projectId]/tasks/[taskId]/page.tsx
- app/auth/confirm/route.ts
- app/auth/error/page.tsx
- app/globals.css
- app/layout.tsx
- app/not-found.tsx
- app/portal/account/page.tsx
- app/setup/page.tsx
- components/admin/admin-shell.tsx
- components/admin/availability-form.tsx
- components/admin/calendar-connection.tsx
- components/admin/dashboard-client.tsx
- components/admin/email-history.tsx
- components/admin/invite-button.tsx
- components/admin/messages-client.tsx
- components/admin/people-client.tsx
- components/admin/person-profile-client.tsx
- components/admin/project-activity.tsx
- components/admin/project-tabs.tsx
- components/admin/task-editor.tsx
- components/admin/tasks-client.tsx
- components/admin/template-editor.tsx
- components/admin/templates-client.tsx
- components/auth/auth-shell.tsx
- components/auth/sign-in-form.tsx
- components/brand.tsx
- components/cache/admin-meetings.tsx
- components/cache/client-meetings.tsx
- components/cache/home.tsx
- components/cache/task.tsx
- components/cache/tasks.tsx
- components/conversation.tsx
- components/demo-banner.tsx
- components/feedback-form-editor.tsx
- components/meetings/cancel-meeting-button.tsx
- components/meetings/meeting-scheduler.tsx
- components/messages-workspace.tsx
- components/notifications-list.tsx
- components/portal/complete-task-button.tsx
- components/portal/form-task.tsx
- components/portal/portal-shell.tsx
- components/progress-bar.tsx
- components/realtime-provider.tsx
- components/rich-text-editor.tsx
- components/settings-form.tsx
- components/setup-admin-form.tsx
- components/theme-toggle.tsx
- docs/theme-color-audit.md
- docs/ui-theme-transformation.md
- lib/theme.ts
- public/brand/leadsedge.jpg
- tests/theme.test.ts

Final runtime: exactly one port-3000 listener, PID 21224, node --env-file=.env.frankfurt.local dist/standalone/server.js, launched through npm run start:frankfurt. Temporary port-3018 validation helper closed. Browser viewport reset; admin dashboard left open.
