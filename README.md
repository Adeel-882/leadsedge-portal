# Leadsedge Portal — Phase 1

Leadsedge Portal is a focused, responsive client-delivery application for lead assignments, lead feedback, isolated task conversations, general project chat, and notifications. It has separate admin and client interfaces and uses Supabase authentication and PostgreSQL Row Level Security for authorization.

## Implemented routes

- `/admin` — dashboard, search/filter, and two-step project/client creation
- `/admin/templates` — create, duplicate, archive, and inspect templates
- `/admin/projects/[projectId]` — project overview
- `/admin/projects/[projectId]/tasks` — task list, filters, create task, import template
- `/admin/projects/[projectId]/tasks/[taskId]` — task details, editor, activation, isolated conversation, activity
- `/admin/projects/[projectId]/chat` and `/admin/messages` — separate general project chat
- `/admin/notifications` and `/admin/settings` — unread activity and configurable display name/timezone
- `/portal` — mobile-first client home
- `/portal/tasks` and `/portal/tasks/[taskId]` — assigned active/completed tasks, lead details, completion, forms, isolated conversations
- `/portal/messages`, `/portal/notifications`, `/portal/account` — project chat, activity, and passwordless account
- `/auth/sign-in`, `/auth/callback`, `/auth/error`, `/auth/sign-out` — magic-link lifecycle
- `/setup` — guarded one-time first-administrator promotion

Meetings are an intentional Phase 2 placeholder in both interfaces.

## Database

Apply `supabase/migrations/202608260001_phase1.sql` to a new Supabase project. It creates:

- users, admin settings, clients, projects, and the future-ready `project_clients` membership table
- templates and template tasks
- project tasks, one task thread per task, task messages, task activity, and form submissions
- one general project thread per project and project messages
- notifications and email delivery records
- indexes, update triggers, transactional RPC functions, Realtime publications, and RLS policies

The migration includes `setup_first_admin`, `seed_default_template`, `create_project_bundle`, `import_template_tasks`, `complete_project_task`, and `submit_form_task`. The default Lead Assignment template and its structured Lead Feedback form are created by the first-admin setup function.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase values.
2. In Supabase SQL Editor, run the Phase 1 migration.
3. In Supabase Authentication, add your own development user. Do not use a shared or hard-coded password.
4. Set the Auth Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback` as a redirect URL.
5. Start the app, request a magic link at `/auth/sign-in?next=/setup`, then finish the one-time setup at `/setup`.
6. In Resend, verify a sending domain and set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
7. Set `LEADSEDGE_DEMO_MODE=false` outside local visual-demo use.

Supabase email templates may be branded as a fallback, but new-client invitations are generated server-side and sent through Resend with Leadsedge Portal branding. Failed deliveries are recorded and the project overview provides a resend action.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before deployment. The authorization tests cover cross-client task denial, draft visibility, completion rules, task-title normalization, and input validation. Database RLS remains the authoritative protection for project and task URLs.
