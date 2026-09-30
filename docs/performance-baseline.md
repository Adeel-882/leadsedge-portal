# Leadsedge Portal performance baseline

Captured 2026-09-03 from the local production Vinext server at `http://127.0.0.1:3000`, using ten measured requests after one warm-up per route. The application ran on the developer workstation in Pakistan and used the linked remote Supabase project. Sessions used existing administrator/client test identities; the harness did not create application records or send email.

| Route | p50 | p95 | Mean |
| --- | ---: | ---: | ---: |
| `/admin` | 1,012 ms | 1,725 ms | 1,188 ms |
| `/admin/projects/:id` | 1,127 ms | 1,586 ms | 1,118 ms |
| `/admin/messages` | 903 ms | 1,650 ms | 1,022 ms |
| `/admin/meetings` | 867 ms | 1,111 ms | 914 ms |
| `/portal` | 1,088 ms | 1,462 ms | 1,099 ms |
| `/portal/tasks/:id` | 1,232 ms | 1,895 ms | 1,356 ms |
| `/portal/messages` | 1,207 ms | 1,391 ms | 1,230 ms |
| `/portal/meetings` | 870 ms | 1,749 ms | 1,078 ms |
| `/api/unread-counts` | 600 ms | 817 ms | 623 ms |

Direct remote-operation medians were 277 ms for `auth.getUser()`, 244 ms for the application profile, and 307 ms for the unread-count RPC. Warm `getClaims()` verification was approximately 1–5 ms; its first call paid the JWKS fetch.

Run the same method with `node tests/performance/benchmark.mjs`. See `tests/performance/README.md` for controls and caveats.
