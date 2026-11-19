# Approved local recovery checkpoint — November 19, 2026

One application backup was created at 20:04:13 Pakistan time (15:04:13 UTC), using read-only access to Frankfurt project `tfrljxzknnhkynobvetg`. No migration, restore, application deployment, GitHub push, or production record mutation occurred.

## Archive and verification

- Location: `C:\Users\adeel_utu7nye\AppData\Local\LeadsEdge-Recovery\frankfurt-application-2026-11-19T15-03-46-782Z\application.dump`
- Size: 229,614 bytes.
- SHA256: `3598e908ff722be85af308bccb693af667d8d1637143d6fb8a6c3ce69281e1ad`
- Windows EFS encryption verified on the new directory and every file.
- Protected directory ACL contains only `ADEELS\adeel_utu7nye`; inheritance from the parent is disabled. Archive and companion files inherit only that account's access.
- Complete archive decoding succeeded both before writing and by reading the saved archive to the Windows null device. Required application table-data entries are present. The stored-file SHA256 was calculated after writing.
- Schema inspection identified calendar refresh-token storage; calendar connection data was excluded. Archive checks excluded Auth and calendar credential rows, scanned for known environment secrets and common credential patterns without displaying content, and found no matches. Pattern scanning cannot prove the absence of an arbitrary secret manually pasted into free-text business content.
- No actual restore was performed. This is an integrity-verified application recovery archive, not a restore-tested full Supabase project backup.

Includes the public application schema, functions, constraints, indexes, policies, grants, and application data, including public user profiles. It does not include Supabase Auth records, calendar connection rows/tokens, vault, storage objects, global role credentials, environment files, migration ledger, or publication/subscription definitions. Existing backups were not deleted or overwritten. The archive was not uploaded, emailed, committed or copied to another service. Two failed filesystem-check attempts created empty directories only, before any data export; there is exactly one new archive.

## Recovery instructions

The same encrypted directory contains `manifest.json` and `RESTORE.txt` with the checksum, scope, limitations and procedure. Preserve this Windows account's EFS certificate/private key through the user's existing secure Windows recovery process; do not upload the archive or expose/export keys through this task.

Any restore requires separate approval. First verify the checksum and archive inventory. Prepare an isolated compatible Supabase PostgreSQL 17 target with required extensions, roles, `auth.uid()` and matching existing Auth identities. The archive intentionally does not recreate those identities. Disable application workers, email delivery, cron and external integrations. Review dependencies and restore with `pg_restore --single-transaction --exit-on-error` using securely supplied connection credentials. Do not use a destructive `--clean` restore against production.

Verify row counts, foreign keys, RLS, grants and application behavior in the approved target before considering production recovery. Calendar integrations require reconnection; preserve/review external configuration, migration history and Realtime membership separately. This archive alone is insufficient to rebuild a completely lost Supabase project including Auth and Storage.

## Approval boundary

This checkpoint supersedes the stale-backup blocker in `docs/project-creation-option-a-approval.md`. Both migrations remain unapplied and unapproved. No deleted Elite projects or invitations were restored or resent. Stop for separate migration approval.
