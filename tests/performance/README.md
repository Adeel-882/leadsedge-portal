# Leadsedge performance checks

Run against one fresh production Vinext server at `http://127.0.0.1:3000`:

```powershell
$env:PERF_ITERATIONS='10'
node tests/performance/benchmark.mjs
```

The script uses existing authorized users and data, sends no email, performs no
application data mutation, and never prints credentials. Creating the temporary
benchmark sessions updates Supabase Auth's normal `last_sign_in_at` metadata.

Results are local-machine measurements and must not be presented as production
hosting measurements. Use `PERF_BASE_URL` to target an explicitly authorized
staging environment.

For isolated regional staging, keep credentials in a separate ignored file and
set `PERF_ENV_FILE=.env.us-staging` and
`PERF_ENVIRONMENT_NAME='US EAST STAGING'`. Do not replace `.env.local` merely
to benchmark another Supabase project.
