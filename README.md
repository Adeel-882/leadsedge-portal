# Leadsedge Portal

Leadsedge Portal is a focused, responsive client-delivery application for lead assignments, automated feedback, meetings, isolated task conversations, project chat, and notifications. It has separate admin and client interfaces and uses Supabase authentication and PostgreSQL Row Level Security for authorization.

The application builds as a portable Vinext standalone Node.js server. Cloudflare Workers, Wrangler, Docker, and hosting-provider-specific adapters are not required to build or run it.

## Implemented routes

- `/admin` — dashboard, search/filter, and two-step project/client creation
- `/admin/templates` — create, duplicate, archive, and inspect templates
- `/admin/projects/[projectId]` — project overview
- `/admin/projects/[projectId]/tasks` — task list, filters, create task, import template
- `/admin/projects/[projectId]/tasks/[taskId]` — task details, editor, activation, isolated conversation, activity
- `/admin/projects/[projectId]/chat` and `/admin/messages` — separate general project chat
- `/admin/meetings` and `/admin/meetings/[meetingId]` — upcoming/history/cancelled meetings and detail
- `/admin/notifications` and `/admin/settings` — unread activity, availability, office hours, and Google Calendar connection
- `/portal` — mobile-first client home
- `/portal/tasks` and `/portal/tasks/[taskId]` — assigned active/completed tasks, lead details, completion, forms, isolated conversations
- `/portal/meetings` and `/portal/meetings/[meetingId]` — secure availability lookup, booking, details, and cancellation
- `/portal/messages`, `/portal/notifications`, `/portal/account` — project chat, activity, and passwordless account
- `/auth/sign-in`, `/auth/callback`, `/auth/error`, `/auth/sign-out` — magic-link lifecycle
- `/setup` — guarded one-time first-administrator promotion

The Lead Assignment remains one task throughout activation, completion, delayed feedback, submission, and conversation history. Phase 2 does not recreate a separate Lead Feedback task.

## Database

Apply `supabase/migrations/202608260001_phase1.sql` to a new Supabase project. It creates:

- users, admin settings, clients, projects, and the future-ready `project_clients` membership table
- templates and template tasks
- project tasks, one task thread per task, task messages, task activity, and form submissions
- one general project thread per project and project messages
- notifications and email delivery records
- indexes, update triggers, transactional RPC functions, Realtime publications, and RLS policies

The migration includes `setup_first_admin`, `seed_default_template`, `create_project_bundle`, `import_template_tasks`, `complete_project_task`, and `submit_form_task`. The default Lead Assignment template and its structured feedback form are created by the first-admin setup function.

Existing Phase 1 installations must apply `202608270001_single_lead_workflow.sql`. This additive migration:

- moves feedback schema, delay, lifecycle state, and submission timestamps onto the Lead Assignment task
- merges matching Lead Assignment/Lead Feedback pairs while archiving the redundant task and preserving messages, activity, notifications, and submissions where possible
- reduces the default Lead Assignment template to one task
- adds server-generated notification deep links and resource context
- installs a minute-level Supabase Cron job for persistent delayed feedback activation
- adds a service-role-only transactional project/client deletion function with administrator and shared-client safeguards

It does not reset the database or remove unrelated users, projects, or administrators.

Apply `202608270002_message_read_receipts.sql` after the single-lead workflow migration. It adds recipient-specific read receipts for project and task messages, conversation-scoped read acknowledgements, independent message and notification counters, and Realtime receipt updates. Existing messages with an exact notification link retain their current read state; older messages without a reliable link are initialized as historical/read so users are not given a false legacy backlog.

Apply `202608270003_phase2_automation_and_meetings.sql` last. It is additive and introduces feedback cancellation/idempotency/run history, a durable email outbox, availability settings, office-hour rules, encrypted Google Calendar connection storage, meetings, project activity, and RLS-protected booking/cancellation functions. It does not reset, reseed, or delete existing Supabase data.

## Feedback automation

Supabase Cron continues to run `process_due_feedback_requests_job()` each minute. The job atomically activates due feedback, records an automation run, creates one in-app notification, and enqueues one branded email using a unique deduplication key. Configure a scheduler to call `GET /api/cron/automation` every minute with `Authorization: Bearer <CRON_SECRET>` so queued Resend mail is delivered even when nobody has the portal open. Manual requests drain the queue immediately. For local acceptance only, set `LEADSEDGE_ENABLE_MINUTE_FEEDBACK_DELAYS=true`; production remains hours/days by default.

## Google Calendar

Create a Google OAuth Web application and enable the Calendar API. Configure these authorized redirect URIs exactly:

- local: `http://localhost:3000/api/admin/calendar/google/callback`
- production: `https://your-domain.example/api/admin/calendar/google/callback`

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a long random `CALENDAR_TOKEN_ENCRYPTION_KEY`. The integration uses the server authorization-code flow with offline access, validates a short-lived HttpOnly state cookie, encrypts the refresh token before database storage, checks Calendar free/busy data, creates events for confirmed bookings, and removes them on cancellation. OAuth and calendar tokens never enter browser JavaScript or application logs.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase values. Vinext loads `.env.local` during both `build` and `start`; similarly named files such as `.env.local.example` are not loaded.
2. Apply migrations in order. Existing installations apply the non-destructive follow-ups: `202608260002_harden_first_admin.sql`, `202608270001_single_lead_workflow.sql`, `202608270002_message_read_receipts.sql`, then `202608270003_phase2_automation_and_meetings.sql`.
3. In Supabase Authentication, add your own development user. Do not use a shared or hard-coded password.
4. Set the Auth Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to the allowed redirect URLs. Add the equivalent HTTPS wildcard for each deployed environment.
5. Start the app, request a magic link at `/auth/sign-in?next=/setup`, then finish the one-time setup at `/setup`.
6. Optionally configure Resend by verifying a sending domain and setting `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Without it, Supabase-backed records and authentication still work, while invitation delivery shows a separate warning.
7. Keep `LEADSEDGE_DEMO_MODE=false` for real data. Demo records are loaded only when this value is explicitly `true`.

Run `npm run verify:backend` to validate the production-mode environment and make a safe server-side query. It reports only configuration/connection status and never prints key values.

## Production Node build

For the current Frankfurt staging backend:

```powershell
npm run build:frankfurt
npm run start:frankfurt
```

Open `http://127.0.0.1:3000`. The standalone server reads `HOST` and `PORT`, defaults to `0.0.0.0:3000`, and accepts hosting-platform overrides. `.env.frankfurt.local` remains local and gitignored; do not copy its private values into source control.

For another environment, inject its variables through the process environment, run `npm run build`, and start the generated bundle with `npm start`.

Supabase email templates may be branded as a fallback, but new-client invitations are generated server-side and sent through Resend with Leadsedge Portal branding. Failed deliveries are recorded and the project overview provides a resend action.

Custom client emails use a server-compatible TokenHash URL: `/auth/confirm?token_hash=…&type=invite&next=/portal` for a new invitation and `type=magiclink` for a resent link. The confirmation route verifies the one-time token with Supabase, writes the authenticated session to cookies, validates the application role and client/project membership, then redirects to the correct role-specific workspace. Token hashes and session tokens must never be logged.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before deployment. The authorization tests cover cross-client task denial, draft visibility, completion rules, task-title normalization, and input validation. Database RLS remains the authoritative protection for project and task URLs.
