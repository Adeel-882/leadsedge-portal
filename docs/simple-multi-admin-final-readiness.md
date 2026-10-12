# Multi-admin final compatibility review and conditional Frankfurt execution plan

Date: 2026-10-09. Reviewed repository HEAD: `e8d4b11a81a216153456271b0a672b59e67b41b7`.

## Decision

**Do not execute Frankfurt migration yet.** Application and local PostgreSQL checks pass. Real-provider desktop/email activation remains incomplete. Seoul has been authorized as the test candidate, but restoration requires separate approval and isolation is not yet established.

Frankfurt was queried using BEGIN READ ONLY / ROLLBACK only. No migration, identities, emails or configuration changes were made there. Tokyo was not targeted.

## Current Frankfurt compatibility evidence

- Existing admin accounts remain `adeelahmed@broadigo.com` and `admin.frankfurt@performance.example.com`, both role `admin`.
- All 11 client rows have compatible linked profiles: zero missing profiles and zero non-client linked profiles.
- `public.users` and `public.clients` have RLS enabled and are owned by postgres. No inherited role memberships for anon/authenticated/service_role were returned. No existing users column ACLs were present.
- Existing users UPDATE policy requires `is_admin()`; SELECT allows admin or self. The migration does not change either policy.
- The live Auth trigger runs on INSERT or UPDATE OF email and invokes `handle_new_auth_user`, which creates client-role profiles regardless of role metadata; on conflict it updates name/email, not role.
- Existing users/client update triggers only call `set_updated_at`. The new BEFORE INSERT/UPDATE OF auth_user_id guard does not conflict with these timestamp triggers.
- Existing `is_admin`, `setup_first_admin`, `create_project_bundle`, Auth trigger and business RLS are not replaced by the proposal. Fixed search_path and function EXECUTE grants were reviewed for every new function.
- No invitation table currently exists. No migration name/table/trigger conflict was observed.

## Application write paths and direct compatibility checks

`app/api/admin/settings/route.ts` updates only users.full_name and separately upserts admin_settings. `app/api/admin/people/[clientId]/route.ts` edits client CRM fields and synchronizes only users.full_name. No current client profile editor writes other public.users columns. Trusted Auth/profile functions execute as owner and retain their existing writes.

Therefore granting authenticated UPDATE(full_name), while removing table-wide users UPDATE, preserves the current supported profile operations. It intentionally prevents direct browser changes to role, id, email and avatar_url (no current avatar writer was found). Future profile fields need explicit grants and tests.

`app/api/admin/projects/route.ts` generates a client identity, verifies the initial public profile, then invokes `create_project_bundle`. Its existing-client branch passes the selected linked client identity. The live function inserts/upserts the client before adding project membership, project thread and notification. The new identity guard accepts these client-role profiles and rejects administrator linkage.

Added `tests/security/administrator-compatibility.sql`: exact live `create_project_bundle` and `set_updated_at` function bodies copied into minimal local supporting tables, with terminating SQL semicolons. Applied the proposed migration in disposable local databases and verified:

- Admin Settings name update succeeds with the timestamp trigger active.
- People can update a linked client profile name.
- A client still cannot edit its own profile through existing UPDATE RLS.
- New invited client profile can be linked and its project created.
- Existing-client project creation, including repeated ON CONFLICT upsert, succeeds without duplicate client identities.
- Administrator linkage as a client is denied.

This is direct PostgreSQL evidence, not a complete remote Supabase provider test. The local fixture is not a full Frankfurt clone.

## Equal access and negative cases

All administrator modules use the existing admin role helpers; no Super Admin, hierarchy, new permission matrix or entitlement requirement exists. Local PostgreSQL proves Admin A → B activation, full existing admin project RLS access, and B inviting C. Lifecycle tests reject client/anonymous invitation creation, direct role elevation, forged role metadata, revoked, expired, reused, mismatched/unconfirmed/changed-email identities, and late client association. Concurrent acceptance and duplicate creation each permit exactly one success.

A newly activated admin opening every actual module through a real desktop session remains part of the Seoul test, not a completed claim.

## Latest validation

- Full application suite: 51 files / 430 tests passed.
- Typecheck: passed.
- Lint: passed.
- Frankfurt standalone build: passed.
- Direct local PostgreSQL lifecycle, compatibility and concurrency tests: passed. Disposable databases removed and local test cluster stopped.
- Initial sandbox test launch failed before tests ran due to temporary-file EPERM; rerun outside the sandbox passed.
- No application or migration behavior changed in this final review. Only the database test runner, compatibility test and this report changed.

## Seoul inspection and remaining gate

Read-only Supabase CLI project metadata confirms:

- Name: LeadsedgePortal
- Reference: `llmmtdzlurunphdfrqlg`
- Region: `ap-northeast-2` (Seoul)
- Status: `INACTIVE`
- Frankfurt reference is different: `tfrljxzknnhkynobvetg`.

The dashboard in the in-app browser requires sign-in. Its initial loading placeholder was not treated as health evidence. Management CLI supplied the actual status.

Seoul must be restored before live schema/migration/Auth inspection. Restoration could reactivate old credential holders, database scheduled jobs and integrations. Existing accounts/data are not assumed disposable. No restoration, schema mutation, redirect change, environment switch or email send was performed.

Local `.env.local` still points to Seoul, whereas explicit Frankfurt commands use `.env.frankfurt.local`. This is an existing accidental-use risk: generic build/start are not evidence of isolation. Source references to Seoul also exist in historical documentation and the old backup script. These do not prove active integrations; nor can a repository search prove that no external service uses Seoul. After restoration, inspect Auth configuration, scheduled jobs, hooks, extensions, network/DB connection activity and deployment configuration read-only. If an active integration is identified, stop and obtain a specific containment plan before testing. Do not disable it silently.

Created `.env.seoul-test-inputs.local`, gitignored, with blank B/C inbox fields only. It is not a runnable application configuration and contains no copied credentials. The actual `.env.seoul-test.local` will be created only after the safety audit and will use solely Seoul credentials and test-only Resend configuration. Initial Admin A is unresolved: inspect existing admins first; the safe first-admin flow cannot run if one already exists. Do not demote/delete existing accounts to make it run.

Required before Frankfurt execution: real Resend delivery to controlled B/C inboxes, desktop explicit Continue acceptance, /admin access and every module, B inviting C, negative cases, and preservation of client behavior. Record IDs/status/error codes safely, never tokens or cookies. Obtain further approval for restoration, existing-record changes, destructive/conflicting migrations or costs.

## Exact conditional Frankfurt execution plan — NOT AUTHORIZATION

Migration: `supabase/migrations/202610090001_simple_admin_invitations.sql`.
SHA-256: `098fdcd2f6b2805784dff48b5c0170f881c2b00010f06d778b0209fb964ba7d6`.

1. Finish the Seoul real-provider gate and resolve findings. Recalculate the migration hash if anything changes. Present updated evidence and obtain explicit final Frankfurt approval. No blanket migration push or automatic deployment.
2. Immediately before the approved window, independently verify target reference `tfrljxzknnhkynobvetg`, region eu-central-1 and connection identity. Use only Frankfurt credentials loaded locally, never command-line passwords. Recheck live catalog, admin records, all 11-or-current client links, migration ledger and application write paths for drift. Stop on unexpected migration objects or incompatible client profiles.
3. Save a timestamped, access-restricted, gitignored checkpoint: schema with functions/triggers/RLS/table-and-column ACLs; migration ledger; existing admins and client identity associations; table counts; reviewed code revision/build and migration hash. Take a consistent pg_dump custom-format backup of public schema/data and migration history using a read-only backup connection; protect any PII. Record existing Auth identity metadata required for comparison without extracting token/password fields. If a full managed database/Auth backup or PITR checkpoint is available, record its identifier; do not assume Free plan provides it. Validate archive listing/checksum and restore the public backup into an isolated PostgreSQL environment, never Seoul with business data or Frankfurt. Backup/restore validation is pending, not done by the catalog audit.
4. Preserve the prior deployed artifact and its configuration. Keep invitation creation unavailable until checks finish. Apply exactly the reviewed SQL with psql `-X -v ON_ERROR_STOP=1 -f supabase/migrations/202610090001_simple_admin_invitations.sql` through the guarded Frankfurt connection. The file has its own BEGIN/COMMIT; use session lock_timeout 5s and statement_timeout 60s. A failure must leave no partially committed objects. Do not run all pending migrations.
5. Reconcile migration ledger through the project's approved migration procedure for this exact version only; check for an existing version first. Do not misreport a manually applied file as automatically ledger-recorded. Ledger reconciliation is itself part of the explicitly approved write window.
6. Execute read-only postchecks below before enabling any invitations. Application deployment remains a separate explicit action; no push/Hostinger change is inferred from migration approval.

## Post-migration verification

- Confirm migration hash/version; invitation table starts empty and RLS is enabled.
- Verify all five invitation functions and the trigger function match reviewed definitions; SECURITY DEFINER, fixed search_path, and EXECUTE restrictions are correct.
- Authenticated can SELECT invitations under admin RLS and UPDATE only users.full_name; anon cannot execute invitation functions; bind/delivery remain service-only. Check both table and column effective privileges.
- Compare existing admin and client records byte-for-byte to the checkpoint for relevant columns; no old role, name, identity or membership should change from DDL.
- Compare all existing business policy/function/trigger definitions, Auth signup behavior and Realtime publication; only planned objects/ACL changes may differ.
- Existing admin/client login, profile edit, new/existing client project creation and notification behavior must remain intact. Any write-based Frankfurt smoke test needs its own authorized test identity/data and cleanup plan; do not send live invitations merely to verify DDL.
- When separately authorized, test one controlled Frankfurt invitation and equal access. Do not use production clients as recipients.

## Rollback

Before commit, migration error rolls back transaction. Do not force termination of unrelated sessions to obtain locks.

After commit but before activation: disable invitation entry points/revert to the previous application artifact first. Prefer preserving the additive table and history while investigating. If schema rollback is explicitly approved, drop only the new client trigger, new invitation functions and guard function, then the invitation table with RESTRICT (never CASCADE); verify no invitation has been accepted and no unexpected dependencies exist. Restore privileges only from the exact checkpoint. The observed pre-state had table-wide UPDATE for anon/authenticated, no PUBLIC grant or column grants: reversing precisely would revoke UPDATE(full_name) from authenticated and restore table UPDATE to anon/authenticated, but that deliberately removes the new hardening and requires explicit review. Do not blindly replay this if the checkpoint differs.

After activation: never delete/demote new admins or drop attribution history automatically. Revert application behavior and revoke new invitation RPC access under a reviewed containment plan, retain roles and invitation audit rows, then forward-fix. A whole-database restore would overwrite intervening business writes and is not a routine rollback; it needs a maintenance/recovery decision and separate approval. Auth identities created outside the SQL transaction require explicit account recovery review; database rollback does not automatically remove them.
