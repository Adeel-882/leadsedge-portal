# Template titles and searchable project chats

Validated October 5, 2026 against Frankfurt staging and the local standalone Node build.

## Live function comparison and migration

The live `public.import_template_tasks(uuid, uuid, uuid[], public.task_status)` body matched the latest repository definition in `202608270001_single_lead_workflow.sql` (normalizing line endings). The suffix was persisted at insertion, not added by the editor. The API calls this RPC; the editor initializes its editable title directly from `task.title`.

New migration: `supabase/migrations/202610050001_preserve_imported_template_title.sql`. It was generated from the live `pg_get_functiondef` output, not by rewriting an old migration. The only replacement is:

```sql
-- Before
template_task_row.title || ' - ' || primary_client_name
-- After
template_task_row.title
```

Application used a transaction with a guard asserting that the live function still matched the audited definition, and recorded version `202610050001` in `supabase_migrations.schema_migrations`. Post-application inspection confirmed the entire function definition equals the prior definition with that one replacement. Owner (`postgres`), ACL, `SECURITY DEFINER`, `search_path=public`, and `SETOF uuid` contract are identical. No grant, policy, table, scheduling, or historical data update is included. The now-unused local `primary_client_name` variable is deliberately retained to preserve everything else exactly.

Removed the unused TypeScript `normalizeImportedTaskTitle` helper and its obsolete suffix test. It was not on the import runtime path; authorization predicates in the same file are unchanged.

## Live import proof

Imported exactly one draft through the actual browser Import Template flow, then opened Edit Task:

- Title field: **Lead Assignment**.
- New task: `1f0876a1-cc28-4f39-ba79-f71c7dfc87b3`.
- Project: `72000000-0000-4000-8000-000000000001` — Primary Client Project 1.
- Assigned client: `71000000-0000-4000-8000-000000000001` — Frankfurt Test Client 1.
- Template task: `8895d70b-db36-4837-a325-bf35c2eaef1d`.
- Feedback enabled; delay **7 days**; pending state. Database comparison confirms timing, description, form schema, visibility, and completion requirement match the template copy.
- All **14 historical task titles** match the pre-test snapshot; exactly one task was added. The template title remains Lead Assignment.

The draft remains available for inspection. It was not activated or completed, so no assignment activation or feedback scheduling was triggered by this test. Completion scheduling logic was not changed. Screenshot: `work/template-title-proof.png`.

## Messages selector

`components/messages-workspace.tsx` adds a separate search input to the existing admin-only project popup. `lib/message-workspace.ts` supplies case-insensitive, trimmed matching on client or project name using existing authorized active-project metadata. There are no new metadata requests, polling, realtime channels, or full-page reloads on selection.

Selection reuses an existing `project:<projectId>` inventory entry or adds an empty client-cache representation. It does not insert a conversation record. It closes the popup, clears any rail search hiding the selected result, updates the current encoded thread URL through the existing history mechanism, and opens the existing project message query/cache. Task keys are never selected by this action. The result list scrolls inside the compact popup and includes a no-results state.

Project messages already have an explicit unique `project_threads` record created with the project. The existing send endpoint looks up that record and inserts into `project_messages`, not `task_messages`. Opening an empty conversation works even when it is absent from the normal message inventory.

## Browser and database validation

- Searching **Eric** matched Eric Williams and selected project `260c8778-b35f-442b-8e67-df26dac20a71`.
- URL: `/admin/messages?thread=project%3A260c8778-b35f-442b-8e67-df26dac20a71`; pane explicitly showed **Project conversation** and **No messages yet**.
- Sent one approved test message: “Project chat test — confirming this conversation is working.” It persisted and appeared in the project inventory after a validation reload.
- Database confirmed exactly **one project message and one project thread** for that project afterward. No duplicate project thread was created.
- Searching **Primary Client Project** selected the existing Primary Client Project 1 project conversation, retaining its history and the current deep-link convention.
- Synthetic control projects with zero messages were not active and were correctly excluded; their statuses were not changed. Eric's active empty project was used for the requested first-message check instead.
- Read-only SQL under the existing client's authenticated RLS context returned zero visible rows for Eric's foreign project, its messages, and the new draft task. No RLS policy or authorization logic changed.
- Screenshots: `work/project-selector-proof.png`, `work/project-first-message-proof.png`.

## Checks and runtime

- Focused import/selector/workflow tests: **39 passed**, 3 files.
- Full suite: **325 passed**, 37 files.
- Typecheck and lint: passed.
- Clean `npm run build:frankfurt`: passed, standalone output generated.
- Exactly one port-3000 Node listener verified, launched by `npm run start:frankfurt`, using `--env-file=.env.frankfurt.local dist/standalone/server.js`.
- Temporary no-email admin session handoff helper was closed after browser validation.

Changed files: the new migration, `components/messages-workspace.tsx`, `lib/message-workspace.ts`, unused-title-helper removal in `lib/authorization.ts`, its obsolete test removal in `tests/authorization.test.ts`, `tests/project-chat-selector-and-import.test.ts`, and this report. The earlier proposal is retained as historical review material; the new migration is authoritative.

No Hostinger deployment/configuration, DNS, SMTP, auth implementation, invitation behavior, task badge, scheduling, RLS, realtime publication, Seoul, or Tokyo changes.
