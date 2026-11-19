# Project creation / invitation incident — release checkpoint

## Confirmed root cause (November 19, 2026)

The inspected checkout is `1dff6ff`. That commit introduced the invitation-tracking dependency. Its project endpoint commits `create_project_bundle`, then calls `sendTrackedClientInvitation`. The latter deliberately refuses to send if `prepare_client_invitation_attempt` fails. The endpoint returns HTTP 201 with the committed project ID and a warning, but the dashboard previously kept the creation form open whenever a warning existed. A second submission repeated the bundle creation.

Frankfurt was checked read-only with project-reference and region guards:

- `client_invitation_attempts`: absent from PostgreSQL. Data API GET returns **404 / PGRST205**, table not found in schema cache.
- `prepare_client_invitation_attempt`, `finish_client_invitation_delivery`, `record_client_invitation_sign_in`: all absent from PostgreSQL. Read-only Data API GET probes return **404 / PGRST202** for all three signatures.
- No tracking-table grants or policies exist because the table does not exist. Existing `email_deliveries` RLS remains enabled.
- This is **not merely a stale PostgREST cache**. Reloading it cannot create missing objects.
- A HEAD request did not expose the table error; the diagnosis uses catalog queries and the subsequent GET error, not that misleading HEAD result.
- The read-only OpenAPI endpoint returns HTTP 200 with existing RPC paths, confirming availability of the schema-discovery mechanism used by the new guard.
- `202611190001` is not recorded in the migration ledger. No production migration was applied during this investigation.

Production's reported deployment and error are consistent with this source path. The Hostinger deployment SHA was not independently authenticated/verified in this phase; local HEAD is not presented as proof of the deployed artifact.

## Existing Elite projects — preserve both

| Project ID | Created (Pakistan time) | Invitation records |
| --- | --- | --- |
| `8e8b083c-6fbf-4e49-9b1e-0aa0d901897c` | November 19, 2026, 7:20:02 PM | 0 |
| `d5c8bf89-6ef9-4dbe-a0c1-17830c34b047` | November 19, 2026, 7:20:29 PM | 0 |

Both reference the same client: `78052bba-8832-48bb-b6a9-3ca0f160c915`. Its status is `invited`, its profile role is `client`, its Auth identity exists, and its Auth email matches its client email. It has exactly two project memberships. No contact details or Auth credentials were printed/exported.

Neither has a sent or failed invitation delivery record. With the missing preparation RPC, these application requests returned before calling the email sender. `generateLink` prepares a credential; it does not send this application's Resend invitation. An independent historical Resend inbox audit was not performed, so this conclusion concerns these application attempts rather than every possible email from another source.

**Recovery target:** use the earlier project `8e8b083c-6fbf-4e49-9b1e-0aa0d901897c`. After restoring prerequisites or the old working sender, open `/admin/projects/8e8b083c-6fbf-4e49-9b1e-0aa0d901897c` and explicitly click the existing **Resend invitation once**. Verify provider acceptance and the existing client's sign-in. Keep the second project unchanged. Do not use Create Project to retry delivery, generate another client, relink Auth, or delete either project.

## Local fix

### Partial success

Every committed response includes the project ID/name and a distinct invitation state: sent, not sent, unknown, not requested, or pending. The helper distinguishes a definite no-send from ambiguous transport failure and from provider acceptance whose tracking save failed. Exceptions after a known commit cannot turn the operation into a failed creation response.

The dashboard recognizes a project ID before handling warning/error flags, including legacy HTTP 201 responses. It closes the creation form and displays a persistent “Project was created” notice, project name/ID, Open Project link, and the existing Resend Invitation control where appropriate. It does not offer another creation retry for that committed result. Cache-refresh failure cannot reopen the creation form. Pending delivery is not automatically resent.

### Durable idempotency

New migration `202611190002_project_creation_idempotency.sql` adds a small request table and four narrowly scoped functions. It does not rewrite `create_project_bundle` or any existing table, policy, or trigger.

- Required `Idempotency-Key` UUID, scoped to the authenticated administrator and a hash of the validated payload.
- The frontend stores only a payload hash and UUID in session storage, retaining the same request identity across retries/reloads. No contact fields or credentials are stored there. A synchronous in-flight guard also blocks rapid clicks before React rerenders.
- A database uniqueness constraint claims the request **before Auth provisioning**. Only the first request performs Auth/link/email work. Concurrent copies return pending or the original result.
- The wrapper locks the request row and commits the original project bundle and its recorded IDs in one transaction. A lost response cannot produce a second project on replay.
- Reusing a key with a different payload is rejected. Ordinary clients cannot call the write functions. Administrators can read only their own request rows and cannot directly clear them.
- Result storage is first-write-wins; a missing final response still leaves the committed identity available for recovery.
- Project/client IDs are retained as tombstones, intentionally without business-record foreign keys. Existing project deletion is not blocked, and replay cannot recreate an explicitly deleted project.
- An uncommitted request left reserved by a crashed process is **not automatically taken over or expired**: Auth provisioning could already have occurred. The UI keeps the same request and allows checking its result; an administrator must review a persistently stuck reservation before a new operation. No unsafe timeout-based automatic email retry or identity deletion was added.
- Idempotency covers the same request key, not a global ban on intentionally distinct projects with the same name/client. Different tabs/devices or deliberately different request IDs represent distinct operations. The old RPC is retained for compatibility; this application creation path uses the guarded wrapper.

### Readiness

Before provisioning a new Auth identity or committing a project, the server checks a read-only readiness RPC, tracking-table Data API visibility, and all three tracking RPC paths in the actual PostgREST schema description. The readiness RPC checks catalog signatures and service-role execution/table privileges. Missing setup returns 503 before side effects. No result is permanently cached.

Resend also checks tracking readiness before generating a replacement credential, avoiding invalidation of an old link when infrastructure is unavailable.

## Files changed

- `app/api/admin/projects/route.ts`
- `app/api/admin/projects/[projectId]/invitation/route.ts`
- `components/admin/dashboard-client.tsx`
- `components/admin/project-created-notice.tsx`
- `lib/client-invitation-tracking.ts`
- `lib/project-creation.ts`
- `lib/project-creation-request.ts`
- `lib/project-creation-readiness.ts`
- `supabase/migrations/202611190002_project_creation_idempotency.sql` (new, unapplied)
- `scripts/test-project-creation-database.mjs`
- `tests/project-creation.test.ts`
- `tests/project-creation-readiness.test.ts`
- `tests/project-created-notice.test.ts`
- `tests/project-creation-modal.test.ts`
- `docs/project-creation-incident-recovery.md`
- `docs/project-creation-idempotency-rollback.sql`

The previously reviewed tracking migration `202611190001_client_invitation_tracking.sql` is unchanged. Auth completion, invitation status display/tracking, messages, tasks, leads, and unrelated features remain intact.

## Verification

Final results: **607 tests passed, 1 skipped** (71 passing files, 1 skipped). Typecheck and lint passed. `npm run build:frankfurt` passed and generated standalone output using `.env.frankfurt.local`. The local PostgreSQL concurrency/security tests passed. Nonfatal build plugin-timing warnings remain unchanged.

- Application tests: see final results below; includes successful creation/delivery, missing readiness, absent table/RPC routes, provider failure, tracking preparation failure, existing-client selection, persistent request IDs, duplicate submissions, lost bundle responses, ambiguous email failures, result persistence failure, and the existing invitation/authentication suites.
- Modal interaction tests exercise actual dashboard event handlers with a synthetic hook harness: HTTP 201 plus warning closes the form; rapid duplicate clicks send once; network retry retains the request body/key; cache-refresh failure leaves committed success visible.
- Rendered notice tests cover project identity, recovery links, no resend while pending, and responsive wrapping/action classes. **No real desktop/mobile browser visual validation was completed in this phase.** Browser access was unavailable during the preceding local UI validation; these tests are not represented as screenshots or live authenticated browser tests. Manual release validation must cover desktop/mobile and both themes.
- Local PostgreSQL 17.11 tests use a disposable database and synthetic identities. Concurrent identical claims have one provisioning owner; concurrent bundle calls produce exactly one project, membership, project thread, and original notification. Tests also cover RLS isolation, changed-payload rejection, denied direct state resets, lost-response replay, no duplicate clients, unchanged Auth identities, unchanged client rows across both additive migrations, and explicit-deletion tombstones. No production records were used as test fixtures.
- Production was accessed read-only. No migration, identity, email, project, client, task, message, receipt, or notification mutation occurred.

## Production recovery options — approval required

### A. Restore tracking prerequisites, then release the complete fix

1. Temporarily avoid Create Project retries. Capture a usable recovery checkpoint and the existing deployment artifact/configuration. Reconfirm Frankfurt identity, relevant schema, grants, function names, and migration contents.
2. With explicit approval, apply **only** `supabase/migrations/202611190001_client_invitation_tracking.sql`. Use stop-on-error single-file execution. Verify its table, RLS, grants, and three functions, plus unchanged preexisting records. The migration notifies PostgREST; verify API paths afterward and reload the schema cache only if still necessary.
3. This first migration alone restores the dependency required by the currently reported live sender and allows the existing Elite project's Resend action. It does **not** fix the old frontend partial-success bug or add idempotency; avoid new project creation until the complete fix is released.
4. Review and separately approve **only** the new `202611190002_project_creation_idempotency.sql`. Apply it as a second explicit single-file operation, not a bulk migration command. Verify own-admin RLS, function execution grants, and `project_creation_readiness()` under a real administrator session before deploying this application revision.
5. Obtain application release approval, then push/deploy the focused fix. No new environment variable is required. Preserve the existing verified invitation-expiry setting and email configuration.
6. Recover the earlier Elite project by sending one explicit invitation from its overview. Verify one provider acceptance/history row, the same existing identity, and sign-in status. Perform approved synthetic project/email acceptance and duplicate-request tests. Confirm both existing Elite projects and their data remain unchanged.

### B. Emergency application rollback without a database change

The source-verified previous commit is **`4601e05`**, immediately before `1dff6ff`. Its project sender uses `sendPortalInvitation` and existing `email_deliveries`, with no tracking RPC dependency. The diff from it to `1dff6ff` is the 18-file invitation-status feature, so the previous security dependency fixes are retained.

Verify the corresponding Hostinger deployment artifact and configuration before restoring it; availability of that artifact has not been independently confirmed here. Restore that artifact through Hostinger after approval, without rewriting Git history. If unavailable, prepare an isolated reviewed build from `4601e05` and obtain deployment approval. Do not deploy the current mixed working tree as a rollback.

This is temporary recovery: invitation-specific status tracking disappears until the migration-first release is deployed, and the historical UI still has its partial-success weakness if email fails. Use **Resend invitation on the existing Elite project**, not Create Project. No database rollback is needed because tracking objects are currently absent. Do not downgrade unrelated code or remove existing business data.

## Rollback of the prepared new release

Restore the prior application artifact first. Additive request records can safely remain. If database function rollback is required, `docs/project-creation-idempotency-rollback.sql` removes only the four new idempotency/readiness functions and retains the request table/history. Leave the tracking objects in place if the prior application still needs them. The tracking feature has its own separately reviewed rollback; do not apply it while a deployed sender requires it. Do not delete request rows simply to retry an uncertain operation.

## Release state

Prepared and tested locally. **Not applied to Frankfurt. Not pushed. Not deployed. No emails sent.** Both Elite projects, the shared client, and its Auth identity were inspected read-only and preserved. Wait for explicit migration and deployment approval.
