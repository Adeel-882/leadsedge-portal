**CANCELLED by user on 2026-10-09. Historical proposal only; do not implement or apply its SQL. The approved direction is simple equal-admin invitations, with no RBAC or Super Admin bootstrap.**

# Multi-admin RBAC: audit and approval proposal

Date: 2026-10-09. Repository baseline: `9cb5605610f4d3213c91f554f168088e9e1a47e4`.

**Status: design only. No RBAC schema, policy, function, account, permission, Auth setting, or authorization behavior has been changed.** Client Meetings removal and message chronology are a separate application-only change. This proposal is not a claim that granular permissions are already enforced.

## Evidence and current architecture

Frankfurt was inspected in a read-only transaction using the staging environment and a pooler explicitly checked against the Frankfurt project reference and `eu-central-1`. The transaction ended with rollback. Catalog evidence covers 24 public tables, 38 public RLS policies, function definitions/security settings/ACLs, and the two current administrators. The full relevant definitions are retained in [the live inventory](proposals/rbac-live-inventory.md). No Seoul or Tokyo connection was made.

| Existing account | Profile role | Auth state | Proposed treatment, pending approval |
|---|---|---|---|
| Adeel Ahmed — adeelahmed@broadigo.com — `dbf41fdf-2b4a-4f8c-a8da-6b34350dbc65` | admin | Email confirmed; no ban | Active Super Admin |
| Frankfurt Performance Admin — admin.frankfurt@performance.example.com — `c987cadf-3098-49d6-bd26-eddac2de9e99` | admin | Email confirmed; no ban | Disabled ordinary admin; retain identity and all owned records |

The second account owns staging projects. Disabling access must **not** delete/reassign those projects or cancel meetings. Because current client-message receipts target the owner, suppressing delivery to this disabled account would leave its projects without an active admin receipt recipient; it would not automatically notify Adeel. Keep it active with an explicitly approved Operations grant set, or separately approve owner/recipient routing before disabling it if those projects need live notifications. The disabled entry in the draft is a decision for approval, not an automatic cleanup. It will never silently become a Super Admin.

The application role enum remains `admin | client`. `lib/auth.ts` gets verified claims, then the request-cached `get_portal_bootstrap()` result. `requireRole`, `requireApiRole`, `AdminLayout`, screen loaders and APIs currently check that role, not module permissions. `lib/query-cache.ts` keys caches by identity and role; no authorization revision exists. `AdminShell` displays all admin modules. Settings combines profile, notifications, scheduling and Google Calendar connection.

`public.is_admin()` currently returns whether `public.users.id = auth.uid()` has `role='admin'`. It has no active-status or permission check. `is_project_member()` and `can_access_task()` immediately admit every admin. These helpers feed messages, tasks, activities, unread counts and multiple RLS policies. All 38 policies are permissive; adding another permissive permission policy would leave the old broad access intact.

`handle_new_auth_user()` deliberately creates a **client** profile regardless of user metadata. Preserve that safeguard. Current client invitation creation uses a server-only Admin SDK call, verifies the returned profile, creates project/client records with a user-session RPC, and sends the existing branded confirmation link through Resend. Reuse verification/cookie mechanics, not client entitlement logic, for admin invitations.

`setup_first_admin()` uses an advisory lock and a no-existing-admin check before promoting its caller and seeding the default template. After an approved explicit bootstrap it must be revoked; it must never become a recovery/backfill shortcut.

## Authorization risks the design must close

1. **Direct database bypass:** every role=admin can currently reach broad RLS branches. Navigation/API-only permissions are insufficient.
2. **Profile escalation:** `users` UPDATE currently uses only `is_admin()`. Prevent direct updates to role/id/email/auth ownership; only approved transactional admin functions may change entitlements. Limiting the UI form is insufficient.
3. **Security-definer bypass:** task import, project creation, feedback actions, people reads, unread counts and receipt updates bypass ordinary caller RLS and need their own permission checks.
4. **Service-role bypass:** project deletion runs `delete_project_bundle_admin` with service credentials and a human actor UUID. Revalidate that actor's current `projects.delete` and, when requested, `clients.delete` inside the RPC. The API must derive the UUID from verified session state, never request JSON.
5. **Owner bypass:** `cancel_meeting()` authorizes a meeting owner without checking admin permission. A disabled administrator may still be that owner. Own-row paths in meeting/calendar/settings policies also need an admin status/permission gate.
6. **Metadata leakage:** unread totals, notifications, receipt IDs, activity bodies, joins, dashboard aggregates and sender directories can disclose a module even when its main page is hidden.
7. **Message policy correlation:** live INSERT policies compare `thread.project_id = thread.project_id` and `thread.task_id = thread.task_id`. The accompanying draft correlates these with the outer message resource instead. This is a separately visible policy correction, not a claim of a reproduced cross-client exploit. It has not been applied.
8. **Field permissions:** a generic task UPDATE grant would let `tasks.edit` change the assignee without `tasks.assign`. Enforce field changes in the database, not just the HTTP body validator. Client auth linkage/project identity/template provenance must also be immutable through generic updates.
9. **Receipts and ownership:** current message triggers notify the project owner for a client message, and the primary/assigned client for an admin message. They do not fan out to every administrator. Preserve recipient semantics; stop new owner-side metadata delivery when that owner lacks Messages access. Do not silently turn every admin into an unread recipient.
10. **Stale sessions/caches:** disabling an admin or removing a grant must deny subsequent database requests even if the Auth JWT is still valid. Previously delivered data cannot be recalled from a malicious client; the supported UI must clear it promptly.

## Role and schema design

Keep Auth identities and `public.users.role` unchanged in shape. Add an admin entitlement layer:

- `admin_accounts`: user UUID, `super_admin | admin`, active/disabled status, display preset label, monotonically increasing authorization revision, timestamps. FK deletion restricted to prevent accidental identity removal.
- `admin_permissions`: known permission catalog with reserved management flags.
- `admin_permission_grants`: explicit user/permission pairs, grant actor/date. No implicit preset privileges.
- `admin_invitations`: normalized email/name, eventual bound Auth UUID, inviter, preset label, pending/accepted/revoked/expired state, expiration and acceptance times. One pending invitation per email.
- `admin_invitation_grants`: proposed explicit grants, rechecked on acceptance.
- `admin_access_audit`: actor, target/invitation, event, time, before/after permission/status snapshots. No OTPs, tokens, cookies or generated invitation links.
- `leadsedge_private` schema: non-Data-API helpers for arbitrary-actor checks. No browser schema access.

Only Super Admins manage administrator access in v1. The `admins.*` taxonomy documents distinct operations and UI intent, but those scopes are reserved rather than delegable to ordinary admins. This avoids ambiguous delegated escalation. An ordinary admin cannot grant anything, change their own grants, invite a Super Admin, or edit a Super Admin. If delegated admin management is desired later, add explicit grant ceilings/target-role restrictions in a separate reviewed change.

Permissions are platform-wide by module/action. No project/territory ACL is introduced. Add a separate scoped grants relation in a future version if necessary; avoid nullable scope columns whose null might accidentally mean unrestricted access.

## Permission matrix and current operation mapping

Every mutation requires the corresponding view dependencies as well as its action permission. An empty custom grant set has no business-data access.

| Scope | Current code / operations | Database boundary |
|---|---|---|
| `dashboard.view` | `/admin`, cached dashboard | Aggregate endpoint checks; component reads require projects/clients/tasks view; meeting card separately requires meetings.view |
| `clients.view` | People list/detail, client selectors, `get_admin_people`, `get_admin_client_last_login` | clients/profile reads and both RPCs |
| `clients.create` | New client in project creation | `create_project_bundle` currently upserts clients; conservative draft requires create AND edit |
| `clients.edit` | `PATCH /api/admin/people/[clientId]` | Client contact fields and corresponding client profile name only |
| `clients.delete` | Combined project/client delete | Service-only deletion RPC, together with projects.delete |
| `projects.view` | Project list/detail/activity, authorized selectors | projects, memberships, project_activity, project helper |
| `projects.create` | `POST /api/admin/projects` | Bundle RPC; includes membership/thread creation |
| `projects.delete` | Project menu delete | Actor-checked deletion RPC; disable raw direct table deletion |
| `tasks.view` | Task lists/details, feedback/form results, task activity | tasks and related reads/helper |
| `tasks.create` | New task; import template | Insert/task creation RPC; import also templates.view and tasks.assign |
| `tasks.edit` | Edit/status/activate/complete task; request/cancel feedback | Field-validated update; feedback RPCs; generated activity/notifications |
| `tasks.assign` | Create with assignee, change assignee, imported assignment | Additional field-sensitive database check, never a substitute for create/edit |
| `templates.view` | Templates list/editor/import selector | templates + template_tasks reads |
| `templates.create` | Create/duplicate/restore default | Template inserts + seed RPC; duplicate needs templates.view; creating steps also templates.edit in conservative draft |
| `templates.edit` | Template details, add/edit/reorder/delete a step | Parent update and step CRUD |
| `templates.delete` | Archive reusable template | Field-sensitive archive check, not just generic templates.edit |
| `messages.view` | Inbox, project/task conversation, earlier history, read acknowledgments and unread counts | messages, threads, receipts, message notifications, read/unread RPCs |
| `messages.send` | Normal user project/task message POST | Sender/resource/thread-correlation INSERT checks plus messages.view |
| `meetings.view` | Admin Meetings/dashboard card/calendar metadata | Own authorized meetings + availability; current owner scope preserved |
| `meetings.manage` | Cancel meeting, save availability, connect/disconnect own Google calendar | cancel/save RPCs, own connection writes; never another admin's refresh token |
| `invitations.send` | Initial client invite during project creation | Server-only Auth generation gated before any side effect |
| `invitations.resend` | Existing client's project invitation resend | Same current actor validation plus clients/projects.view |
| `settings.view` | Own settings and existing delivery/automation diagnostics | Own admin_settings; diagnostics tables; calendar needs meetings.view |
| `settings.manage` | Own display name/timezone/notification preferences | Only own allowed profile/settings fields |
| `admins.view` | Proposed Settings → Administrators / audit | Super-only management projections |
| `admins.invite` | Invite/resend/revoke pending admin invite | Super-only atomic reservation/finalization; existing Auth verifier retained |
| `admins.manage_permissions` | Permission/preset/role changes | Super-only locked revision-checked RPC |
| `admins.disable` | Disable/re-enable | Same serialized management RPC; no identity deletion |

Do not add unused `messages.manage`, `tasks.delete` or `projects.edit`: there is no current message moderation/task-deletion/project-edit API in the audited surface. When those operations are added, add and enforce their permissions then.

Dependency UX: projects.view includes clients.view because current project projections contain client contact metadata; tasks.view depends on projects.view; messages.view depends on tasks.view/projects.view/clients.view while the inbox uses the existing rich task/project projections. A later minimal conversation-directory projection could relax those dependencies. Create/edit/send/manage scopes require the module's view permission. The editor must show dependencies and validate on the server; database module gates still deny missing view scopes. No separate database lookup per button.

Preset examples (resolve to explicit grants):

- **Full Operations Admin:** all non-management scopes. No administrator management or promotion authority.
- **Sales/Client Manager:** dashboard, clients view/create/edit, projects view/create, tasks view/create/edit/assign, templates.view, invitations send/resend, messages view/send, meetings view/manage, settings view/manage. No delete or template authoring.
- **Support Admin:** clients.view, projects.view, tasks.view, messages view/send, settings.view/manage. No task edits, invites, deletion, templates, or meetings.
- **Custom:** dependency-validated explicit list; label has no authorization meaning.

## Exact SQL drafts and application cutover boundary

The proposed SQL is deliberately under `docs/proposals`, **not** the runnable migration directory:

1. [rbac-01-foundation.sql](proposals/rbac-01-foundation.sql): schema/catalog, RLS on new tables, authoritative permission helpers, atomic revision-checked access changes and invitation acceptance.
2. [rbac-02-enforcement.sql](proposals/rbac-02-enforcement.sql): exact replacements derived from the live function bodies, MD5 definition-drift guards, restrictive table gates, profile column restrictions, definer checks, first-admin revocation and **proposed explicit account bootstrap**.

These are review drafts, **not a deployable RBAC release**. No SQL execution/parse test against a modified database has been performed. They must not be applied independently to the current application: the existing application writes activity/notifications directly and requires coordinated new transactional write boundaries. Before an execution approval request, finish and validate the following cutover pieces in an isolated test database:

- Field-sensitive task write RPC/trigger: tasks.assign for any assignment change, immutable project/template provenance, preserve all current feedback/scheduling semantics. Move thread/activity/notification side effects inside the same authorized transaction. The draft restrictive policies deliberately deny unsupported raw writes instead of leaving them open.
- Template archive vs normal edit check; template-step creation permissions; no implicit delete grant from templates.edit.
- Client contact-update RPC/column allowlist that cannot rewrite auth_user_id, email, identity or memberships. Raw project/client deletion denied; supported delete remains the actor-checked RPC.
- Admin invitation reserve/bind/resend/revoke RPCs with actor locks and audit, described below. Foundation acceptance is not an invitation creation API.
- Bounded `get_admin_authorization()`/bootstrap addition returning active state, admin role, explicit permissions and revision. Current bootstrap replacement only denies disabled admins; it does not yet return the new fields.
- Minimal authorized sender-directory projection where needed: do not expose all administrator profiles/emails just to show a message sender name.
- Module-aware filtering of `project_activity`/`task_activity` entries with message/meeting/feedback context; receipt reads also check referenced conversation accessibility. Current draft table gates alone do not fully suppress cross-module metadata embedded in a permitted activity row.
- Check every notification event type against the actual producers before cutover; deny unmapped admin event types and include permission-aware INSERT/UPDATE checks for changed target metadata.
- Explicit role gating on client-only definer RPCs so a disabled admin can never fall back to a client path, even if malformed dual membership exists. Existing client predicates/scheduling remain intact.
- Catalog drift guard for policies/column grants in addition to function hashes, least-privilege EXECUTE grants for trigger-only helpers, and direct SQL/Data API tests for each path.

This list is intentional: applying only the foundation plus a UI permission editor would leave the system insecure. Approval should authorize this complete implementation plan, followed by review of the final cutover migration and test evidence before execution. No existing policy has been edited during this task.

PostgreSQL combines permissive policies with OR and restrictive policies with AND; table owners/security-definer execution need separate consideration. The additive restrictive approach retains existing client predicates while preventing an admin from reaching old broad branches without permissions. [PostgreSQL row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Server, UI and cache implementation plan

Create a centralized typed permission catalog and request-cached `requireAdminPermission(...scopes)`. SSR routes, cached screen endpoints, `/api/messages`, `/api/admin/*`, cancellation, calendar OAuth start **and callback**, and privileged service-role operations check it. The API rechecks before generating invitations or changing external calendar state. PostgreSQL remains authoritative for user-session queries and definer RPCs. No cross-user global permission cache.

Admin Settings gains `/admin/settings/admins`: branded existing table/dialog/button tokens, name/email/role/preset/status/added date, invite/revoke/resend, view/edit grants, disable/re-enable. Do not reuse client deletion. Show confirmation for role, grants and status changes; require another Super Admin to change one's own administrative access. Permission editor groups scopes by module and visibly explains dependencies. The navigation uses the same bootstrap data; an admin without dashboard.view lands on their first permitted module or an explicit no-access page, never an infinite redirect.

Keep the `admin` app role to preserve existing routing. Add authorization revision to private query scopes. On revision change: cancel queries, clear old private caches, unsubscribe sensitive realtime channels, rebuild authorized subscriptions and navigation. Recheck on foreground/focus, server navigation and privileged requests; no polling loop. A targeted existing notification event carrying **only an authorization invalidation signal** can accelerate refresh without adding publication tables; it must remain readable by the target even after disable. Do not put permission contents in an ordinary notification body. This event exception needs explicit SQL in the final cutover.

Database checks stop **new** privileged operations after a committed revocation; an already executing statement can finish against its transaction snapshot. Define this boundary rather than claiming instantaneous cancellation of in-flight work. Sensitive management operations serialize with the same lock; irreversible service-side actions recheck actor permission at their transaction boundary. A disabled user's support UI signs out/denies access and clears data. Auth session revocation may be an additional best-effort cleanup, never the security boundary.

Current subscriptions use Postgres Changes. Test INSERT/UPDATE permission loss with an already connected JWT and separately test DELETE behavior; don't assume a removed row can be checked like a surviving row. Remove sensitive payloads from unneeded subscriptions and unsubscribe on revocation. Previously delivered data cannot be revoked. [Supabase Postgres Changes documentation](https://supabase.com/docs/guides/realtime/postgres-changes).

## Invitation protocol and audit

1. Authenticated Super Admin submits name/email/preset/grants. Normalize email; validate permissions and dependencies; no management grants or Super Admin invitations in v1. Reject current clients/admins; no in-place client conversion.
2. Transaction takes management lock and email-specific lock, expires stale pending invitation, rejects duplicate active invitation, reserves pending row and explicit grants, writes invited audit. The server then generates an existing secure Auth invite for that email. **Never grant via raw user metadata.**
3. Service-only bind/finalize operation verifies actor still has admins.invite, reservation unchanged and unexpired, returned Auth UUID/email matches, and no client/admin association appeared. Bind UUID; queue/send existing branded Resend content. Reservation failure/orphan Auth profile grants no admin entitlement. Retry is idempotent. No generated link in logs/audit.
4. Email: subject “You're invited to join the LeadsEdge admin team”, existing dark branded template, white typography and #FF4134 button, identifies administrative invitation and expiry. Reuse TokenHash explicit-Continue verification, origin/nonce protections, cookies and safe internal redirect. Use actual generateLink verification_type. No silent rewrite of normal client sign-in behavior.
5. After verified session establishment, acceptance checks bound UUID, Auth-confirmed matching email, invitation status/expiry, inviter's current authority, no client association, valid grants. It atomically changes profile role, adds active ordinary admin membership/grants, consumes the invitation, and audits. UUID in a URL alone grants nothing.
6. Resend/revoke acquires the same locks. Revoke old pending invitation, reserve a new generation and invalidate the old membership acceptance path before sending. A still-valid Auth link can at most establish an identity session; revoked/expired membership acceptance still fails. Duplicate acceptance returns a safe already-used result without duplicate grants. Disabled inviter's pending invites cannot activate.

All management changes append immutable audit entries in the same transaction. Event details distinguish grants/role/status/invitation changes; views may expand the combined before/after record. No ordinary admin/browser may insert/update/delete audit rows. Email delivery success/failure is separately recorded; an email failure must not silently activate membership.

## Last Super Admin, concurrency and recovery

Access changes use one transaction advisory lock plus target row lock and expected revision. The actor is rechecked under that lock. Disallow self-access changes in the supported RPC. Reject demoting/disabling the last active Super Admin. Identity FKs restrict deletion. Invitation acceptance and promotion use the same lock. Privilege changes must not use unguarded service-role table updates. Two simultaneous demotions/disable requests must not each observe a removable final Super Admin.

Recovery is a manually reviewed database-owner operation through the normal secured operator channel, with identity verification, snapshot and audit. No unauthenticated recovery endpoint and no resurrection of setup_first_admin. Test authentication availability before disabling an incumbent Super Admin. Restoring a disabled admin does not reactivate revoked invitations automatically.

## Rollout and rollback

Approve the design and exact account treatment first. Implement and test against a disposable copy/transactional fixture database; never use production identities for adversarial tests. Refresh live catalog hashes before generating final migration. Snapshot function definitions, policies, grants, entitlement rows and ownership before cutover. Stage the permission-aware application and database changes in a maintenance window; enable them together, verify Super Admin access, then invite one explicitly approved ordinary admin. No automatic deployment.

Before cutover, the unused new schema can be removed after confirming no accepted invitations/audits need preservation. After cutover, prefer a forward fix with deny-by-default operation. Rolling back broad `is_admin()` policies while leaving limited admins enabled would restore their full access: **never** do that. If emergency rollback is approved, disable all newly limited/admin accounts and revoke sessions first, preserve audit, restore the captured policies/functions/application under maintenance, and validate only the explicitly trusted incumbent retains access. An automatic destructive down migration is inappropriate.

## Required RBAC security regression suite (after approval)

- PostgreSQL role/JWT fixtures: anonymous, client A/B, active Super Admin, view-only admin, custom admin, disabled admin, stale JWT/revision. Test table SELECT/INSERT/UPDATE/DELETE and every exposed RPC, not only application mocks.
- Admin Adeel retains approved operations. Synthetic account follows chosen disposition without deleting owned records.
- No Messages scope: direct project/task history, threads, receipts, unread totals, message metadata in notifications/activities and realtime all denied or filtered.
- View-only scopes cannot create/update/delete through manual HTTP, PostgREST or definer calls. Task edit cannot reassign; template edit cannot archive; profile update cannot promote.
- Client create/edit cannot hijack auth linkage. Clients cannot acquire admin_accounts/grants or accept an invitation bound to another Auth UUID. Existing client A/B projects/tasks/messages/feedback/meetings isolation still holds.
- Untrusted actor UUID in HTTP cannot reach service deletion; service RPC checks actor's current permissions. Disabled owner cannot cancel a meeting or read protected metadata through owner/self fallbacks.
- Invite expiration, replay, revoke-before-accept, resend-before-accept, email mismatch, inviter revocation, duplicate email and race with client creation all fail safely. No orphan Auth profile gains rights.
- Concurrent demotions, disabling actor while it changes another user, stale form revisions, simultaneous acceptance/resend, duplicate promotions and last-super removal serialize safely.
- Presets materialize exact grants; custom dependencies validated; management scopes never ordinary-admin bypasses. All changes audit actor/target/time and before/after without credentials.
- Revocation clears UI cache/subscriptions and affects next direct API/DB call with original JWT; account switches and BFCache cannot expose the prior identity's data. Verify realtime DELETE separately.
- Full existing Auth, templates, scheduling, invitation emails, message unread/cache/pagination and client isolation suites pass. Keep cron/service feedback execution separate from human admin permissions.

## Approval requested

Approve (1) the two-role entitlement model and platform-wide permission matrix, (2) Super-only administrator management, (3) the new tables plus coordinated RLS/definer/API/UI cutover and listed remaining SQL boundaries, and (4) the exact bootstrap: Adeel active Super Admin; synthetic performance admin disabled with records retained, or supply an explicit alternative grant set for that account.

After design approval, finish the application and final migration drafts and present execution-ready SQL/test evidence before applying anything to Frankfurt. **Multi-admin RBAC remains unimplemented pending this approval.**
