# Invitations, task attention, assignment email and project activity

Validated October 1, 2026 against the local standalone Node application at `http://127.0.0.1:3000` and Frankfurt staging. No schema, Auth, RLS, publication, scheduling, SMTP, DNS, Cloudflare, Seoul or Tokyo changes.

## Outcome and delivery blocker

Invitation copy, Tasks attention badge, imported Lead Assignment email queuing/delivery integration, and the detailed admin project timeline are implemented. The badge and timeline were exercised against real authenticated HTTP requests and the browser. **Live email delivery is not accepted as working:** the configured Resend key was rejected with `validation_error`, “API key is invalid.” A read-only provider request independently reproduced the credential failure. No credentials or provider settings were changed. Invitation presentation is tested with the provider mocked; no unnecessary invitation was sent after diagnosing this blocker.

## 1. Invitation cause and exact copy

`lib/email.ts` previously interpolated `projectName` into both the subject and the invitation target sentence. Names and URLs were escaped correctly; the problem was which field the presentation used.

Subject: **Your LeadsEdge Portal invitation**

> Welcome to LeadsEdge Portal
>
> Hi Zack Wilson, you’ve been invited to LeadsEdge Portal. Use the secure button below to open your portal — no password is required.
>
> View Your Portal
>
> This link is private and expires automatically. If you weren’t expecting this invitation, you can ignore this email.

The actual full name remains dynamic. The action URL is passed through and escaped exactly as before. No invitation token generation, expiry, confirmation, PKCE or cookie code changed. Email branding is now LeadsEdge Portal; broader application branding was not redesigned.

## 2. Tasks badge

The count is the number of rows in the existing authorized client task inventory where `status = 'active' AND requires_completion = true`. The inventory query retains:

- `assignee.auth_user_id = viewer.id`
- assignee status is not disabled
- `client_visible = true`
- `archived_at IS NULL`
- `status <> 'draft'`
- existing authenticated database RLS, including project/client access

`requires_completion` is the only additional task-list projection. Draft/unavailable tasks, completed tasks, archived tasks, informational tasks without a completion action, admin-only tasks, foreign-client tasks, notifications and feedback on completed leads do not count. The workflow uses active/draft for availability; due dates are not treated as an activation trigger. Feedback continues to appear in its existing Home/task UI.

The shell observes the same account/role-scoped `tasks` TanStack key as the Tasks screen. The existing Realtime manager already invalidates that key on task inserts/updates, reconnect and visible reconciliation. No counter arithmetic, polling, second channel or new database count RPC. Desktop and mobile share the count, display up to `99+`, and expose the exact value in the accessible label. A task list can now load while another portal screen is open; concurrent observers share the same request/cache key.

## 3. Assignment email

### Audit evidence

Frankfurt's task table had only its `set_updated_at` trigger. The current import RPC inserts the independent task copy, task thread and `task.imported` activity but no assignment email. Manual task creation also did not queue email. The task-editor PATCH queued email only on a status transition to active. There were **six pending `task.assigned` rows** at audit time, alongside two pending meeting-cancellation and two pending feedback-request rows.

The database's existing minute scheduler runs feedback processing; it is not an HTTP email-outbox drain. The app already has Resend, `email_outbox`, a unique `dedupe_key`, and the protected `/api/cron/automation` worker. No new schema was necessary.

### Scope and trigger

The user's explicit clarification was **“Only send for imported Lead Assignment tasks.”**

`queueAssignmentEmails()` is the canonical assignment-email producer. It is called after a successful import and when an edit makes work newly actionable (activation, visibility/completion requirement becoming true, or assignment change). Ordinary edits do not call it. Eligibility is re-read on the server:

- linked `template_task` whose reusable template is named `Lead Assignment`
- active, visible, unarchived and requiring completion
- an enabled assigned client who belongs to that project
- linked public profile with client role and a matching email

Manual tasks and other templates do not email. Synthetic fixture tasks without template provenance do not email. A deliberately imported Lead Assignment test task is eligible under the user's chosen rule; there is no new internal-test flag.

An already-active import now creates its Bell notification with an ID derived from the durable outbox event. Existing activation notifications are retained rather than duplicated. That refinement is regression-tested; the first live import occurred before the Bell refinement and therefore is not claimed as live Bell validation.

### Duplicate protection and failures

The existing outbox unique key is scoped to task and client. Existing legacy task-only events are recognized. Conditional `pending/failed -> sending` claims prevent concurrent workers from sending the same row. Queue-time name/title and a stable URL keep retry content stable. Resend receives `assignment/<outbox-id>` as its idempotency key.

Resend documents a 24-hour idempotency retention window ([official source](https://resend.com/changelog/idempotency-keys)). Automatic retries of previously attempted rows older than 23 hours are held for reconciliation rather than risk another delivery outside that window. A process crash or failed delivery acknowledgment can also leave a row in `sending`; those ambiguous cases require delivery reconciliation, not blind replay. The existing five-attempt limit and five-minute retry delay remain.

Freshly queued mail is attempted through Vinext's supported `after()` callback. Provider failures do not fail the task response. The existing automation endpoint retries due failed rows and uses the same assignment dispatcher; other automation email types retain their current behavior. No scheduler or provider configuration was changed, and the historical pending queue was not drained during validation.

The queue write follows the task transaction, so a database outage between those writes needs operational repair; this change does not claim atomic task/outbox transactions. Duplicate prevention is per task/recipient. The existing import operation itself still creates a new independent task on each new invocation; it has not been redesigned as an idempotent import API.

### Link and copy

Subject: **New lead assigned in LeadsEdge Portal**. The body includes the client name and task title, but never the lead description or conversation. CTA: **View Lead**.

The stable link opens `/auth/sign-in?next=/portal/tasks/<task-id>`. The existing sign-in form carries `next` into the existing secure email flow, and role-aware authentication plus task authorization remain required. This deliberately adds a sign-in-email request step; it is not a preauthenticated one-click assignment email. It avoids generating competing one-time tokens for multiple assignments or storing credentials in the outbox. An already-signed-in recipient also sees that existing sign-in page. Improving that convenience would be separate auth work, which was not undertaken.

## 4. Admin activity

Client Home's Recent Activity is `getNotifications(5)`: recipient-specific notification titles/bodies. That remains unchanged. Admin overview previously read only five `project_activity` rows, mostly meetings, so task activity and project messages were absent.

The new admin-only endpoint combines **existing** `task_activity`, `project_activity` and user-classified `project_messages`. Task and actor names are joined in the source queries. There is no new event store, no copying every client's notifications, no per-task or per-actor query loop, and no fabricated history. `fixture.activity` is omitted. Project messages show sender/project context, not message content.

Supported presentation includes task created/imported/assigned/ready/draft/completed, lead completed, task comments, feedback scheduled/requested/submitted/cancelled, meeting booked/cancelled and project messages. Historic assignment events do not contain the assignee snapshot, so the timeline does not falsely label today's assignee as the historical recipient. It describes the actual recorded assignment update with its actor and task.

Each page is the newest 20 events, ordered by timestamp then UUID, with a validated compound cursor and **Load earlier activity**. Each of the three sources reads at most 21 rows; a project-name/access lookup makes four database reads per page. This is more than the old narrow project-activity query, but it is bounded and independent of task/event count. The browser caches pages under the existing identity/role key convention, `project-activity/<project-id>`.

The existing manager gained only activity-key invalidation for task/message hints and reconnect. Task/meeting mutations invalidate activity caches. No subscription, publication, channel or polling was added. Events stored only in non-published activity tables can need navigation/mutation invalidation or **Refresh activity**, particularly other administrators' meeting changes. No claim of complete Realtime coverage for every activity-only write.

## 5. Verification

- **315 tests passed, 35 files.** Added provider-copy/link escaping and idempotency tests, imported-task eligibility/delivery concurrency/failure tests, attention semantics, actor/context/order/cursor tests, admin-access denial, live-cache badge invalidation, and targeted timeline invalidation. Existing auth, Messages, authorization and scheduling suites remain passing.
- Typecheck: passed.
- Lint: passed, no warnings in final run.
- Clean `npm run build:frankfurt`: passed. Only the verified generated `dist` directory was removed. The verified old LeadsEdge listener was stopped before the final build.
- Started with `npm run start:frankfurt`. No Cloudflare runtime.
- Built client bundle: 69 inspected assets; Frankfurt public URL present; zero matches for configured private secret values.
- Real client API inventory: HTTP 200; count **8** initially.
- Imported one workflow through the authenticated admin API: HTTP 201. Browser badge updated **8 -> 9** without refresh; Realtime status live.
- Client submitted a task comment and completed the validation task in the browser. Badge updated **9 -> 8** without refresh. Final desktop and mobile views both showed 8.
- Live database readback: one assignment outbox row, one failed provider attempt, and feedback scheduled exactly **completion timestamp + 7 days**.
- Admin timeline HTTP 200 displayed import/comment/completion/feedback/project-message events. Browser pagination loaded **20 -> 40** events without error. Final build showed the human-readable feedback wording and Refresh activity control.
- Client request to admin activity: **403**. Foreign task request through the client task endpoint: **404**.
- Task-destination sign-in link: HTTP 200 and existing sign-in screen. Email completion of that new assignment link remains unverified because delivery is blocked; no claim of successful inbox delivery.

## 6. Files changed

- `lib/email.ts`: invitation/product copy; optional provider idempotency key.
- `lib/task-attention.ts`, `components/task-attention-count.ts`, `components/portal/portal-shell.tsx`: shared count and both nav badges.
- `lib/queries.ts`, `lib/types.ts`: completion requirement in the existing authorized task summary.
- `lib/assignment-email.ts`: eligibility, queue, notification, claim, safe delivery/retry logic.
- `app/api/admin/tasks/import/route.ts`, `app/api/admin/tasks/[taskId]/route.ts`, `lib/automation.ts`: canonical producer and existing worker integration.
- `lib/project-activity.ts`, `app/api/admin/projects/[projectId]/activity/route.ts`, `components/admin/project-activity.tsx`, `app/admin/projects/[projectId]/page.tsx`: bounded admin timeline.
- `lib/query-cache.ts`, `lib/realtime-sync.ts`: activity invalidation within the existing architecture.
- `tests/product-improvements.test.ts`, `tests/assignment-email.test.ts`, `tests/realtime-sync.test.ts`: regression coverage.

## 7. Staging changes and remaining work

Validation created one imported task, ID `26e0932f-1191-4402-88ff-70ba93acc7ae`, in the existing primary client's project. It was completed, retains its copied seven-day feedback schedule, and has one failed assignment-email outbox row. One task comment and one project message were added with explicit staging-validation text, with normal resulting activity/read-state effects. No identities, projects, templates, historical tasks or memberships were rewritten or deleted.

Before email acceptance, supply a valid authorized Resend credential through the normal secret-management process, then verify sender readiness and perform one controlled delivery test. No claim is made that a valid key alone proves sender/domain readiness. For durable unattended retries, the existing protected automation endpoint still needs its normal deployment scheduler. Neither SMTP nor DNS work was performed.

The completed validation task is no longer eligible for assignment delivery; do not replay its failed email as a current assignment. Historical pending rows were left untouched.

Final runtime check: one port-3000 listener, Node PID 12668, started with the Frankfurt environment file. Temporary validation port 3018 is closed. The admin project overview is left open with 20 activity events. Screenshot: work/product-admin-activity.png.
