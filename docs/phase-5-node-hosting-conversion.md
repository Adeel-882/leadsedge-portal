# LeadsEdge Portal — Phase 5 Node Hosting Conversion

Date: 2026-09-08

## Executive status

| Gate | Result |
|---|---|
| Cloudflare runtime dependency | **REMOVED** |
| Cloudflare historical Worker | **PENDING MANUAL DELETION — NON-BLOCKING** |
| Node conversion | **PASS** |
| Team demonstration readiness | **PASS**, with the client-mailbox limitation documented below |
| Future Hostinger Germany readiness | **PASS at the application/code level**; hosting has not been configured |

No database schema, RLS policy, role semantics, production DNS, Hostinger configuration, Seoul project, or Tokyo project was changed during this conversion.

## 1. Previous architecture

The Phase 4 benchmark path was:

```text
Browser
  -> isolated Cloudflare Worker
  -> Supabase Frankfurt Free (eu-central-1)
```

That Worker was an infrastructure experiment. It is no longer a deployment or runtime dependency of LeadsEdge.

## 2. New architecture

The active local demonstration path is:

```text
Browser
  -> Vinext standalone production server on Node.js
  -> Supabase Frankfurt Free (eu-central-1)
```

Browser-side Supabase Auth and Realtime clients connect directly to the Frankfurt Supabase project using the public project URL and anonymous/publishable key. Server Components, route handlers, Server Actions, private integrations, and privileged operations execute in the persistent Node process.

The intended later production topology remains:

```text
User
  -> Hostinger Germany Node.js
  -> Supabase Frankfurt
```

No Hostinger or domain work was performed in this phase.

## 3. Cloudflare inventory and disposition

### REMOVE — completed

| Item | Previous purpose | Disposition |
|---|---|---|
| `@cloudflare/vite-plugin` | Worker-targeted Vite build/runtime | Removed from Vite configuration and dependencies |
| `@cloudflare/workers-types` | Worker runtime type declarations | Removed from dependencies and TypeScript types |
| `wrangler` | Worker build/deployment tooling | Removed from dependencies; not needed to build or start Node |
| `wrangler.frankfurt.jsonc` | Isolated Worker name, assets, placement, and deployment configuration | Removed |
| `@openai/sites-vite-plugin` and `.openai/hosting.json` | Sites/Worker preview and hosting integration | Removed |
| Worker environment/binding setup in `vite.config.ts` | Wrangler/Miniflare local binding injection | Removed |
| `tests/performance/frankfurt-auth-gate.mjs` | Worker-specific auth-gate benchmark helper | Removed |
| Cloudflare placement declaration near `aws:eu-central-1` | Worker smart placement | Removed from active configuration |
| Transitive Miniflare/workerd packages | Pulled in by the Cloudflare toolchain | Removed by dependency cleanup |

### REPLACE — completed

| Worker behavior | Node replacement |
|---|---|
| Worker deployment output | Vinext standalone output at `dist/standalone/server.js` |
| Worker runtime bindings | Standard environment variables read through the existing `process.env` abstraction |
| Cloudflare `ASSETS` binding | Static files served by the Vinext standalone Node server |
| Worker process/runtime | Persistent, configurable Node.js process |

### KEEP — historical evidence only

The Phase 4 reports remain in `docs/`. References to Cloudflare or `workers.dev` in those reports describe the completed experiment and are not active configuration.

No application module used `cloudflare:workers`, `caches.default`, KV, Durable Objects, Cloudflare Images, or a Cloudflare Cron Trigger. Therefore no application business logic needed a Worker-API replacement.

The historical `leadsedge-frankfurt-performance` Worker may still exist in the Cloudflare account. Per the current instruction, its retirement is **PENDING MANUAL DELETION — NON-BLOCKING**. No Cloudflare account, dashboard, plugin, API, Wrangler command, deployment tool, DNS zone, or Worker was accessed or changed while finishing this phase.

## 4. Removed dependencies and configuration

The direct development dependencies removed from `package.json` and the lockfile are:

- `@cloudflare/vite-plugin`
- `@cloudflare/workers-types`
- `@openai/sites-vite-plugin`
- `wrangler`

The following active repository configuration was removed:

- `.openai/hosting.json`
- `wrangler.frankfurt.jsonc`
- Wrangler/Miniflare binding setup from `vite.config.ts`
- Cloudflare Worker types from `tsconfig.json`
- the project-local `.wrangler` working directory

Historical benchmark reports were intentionally preserved.

## 5. Node build architecture

The installed Vinext version is `1.0.0-beta.3`. The project uses its supported standalone target:

- `next.config.ts`: `output: 'standalone'`
- build artifact: `dist/standalone/server.js`
- normal start: `node dist/standalone/server.js`
- Frankfurt staging build: `npm run build:frankfurt`
- Frankfurt staging start: `npm run start:frankfurt`

The server defaults to `HOST=0.0.0.0` and `PORT=3000` and honors injected `HOST` and `PORT` values. A separate production-mode smoke start on `127.0.0.1:3107` succeeded, proving that both are configurable.

The final default start produced one TCP listener on port 3000 backed by the Vinext standalone Node server. It did not require Cloudflare login, Wrangler, Worker emulation, Docker, or a global Cloudflare package.

### Cloudflare cutoff proof

1. The clean production bundle builds and starts with ordinary Node while no Cloudflare tooling is running.
2. `wrangler` is absent from direct dependencies and no start/build script invokes it.
3. No Cloudflare Worker URL is read or called by active application code.
4. `.env.frankfurt.local` contains no `workers.dev` or Cloudflare URL. Its public app origin is `http://127.0.0.1:3000`.
5. Frankfurt Supabase Auth accepted both local callbacks: `/auth/callback?next=%2Fadmin` and `/auth/callback?next=%2Fportal` at `http://127.0.0.1:3000`. This check generated links without sending email.
6. The local Node server returned the sign-in document and static `favicon.svg` successfully; no `ASSETS` binding was present or required.
7. Server and browser Supabase clients use the Frankfurt project URL directly.
8. Realtime subscribed and reconnected directly to Frankfurt Supabase.
9. No Cloudflare runtime bindings exist in the Node configuration.
10. A clean dependency install, clean Node production build, and fresh Node start succeeded without Cloudflare authentication.

## 6. Environment variables

Only names and roles are listed here; no values or secrets are recorded.

### Public/browser-safe

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

### Node server only

- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CALENDAR_TOKEN_ENCRYPTION_KEY`

### Process/runtime and optional feature flags

- `HOST`
- `PORT`
- `LEADSEDGE_ENABLE_MINUTE_FEEDBACK_DELAYS`
- `LEADSEDGE_DEMO_MODE`

`.env.frankfurt.local` remains gitignored and is loaded by Node's built-in `--env-file` support. `.env.local` was not overwritten. Private values remain server-only, and privileged code continues to fail closed when its required private configuration is absent.

## 7. Functional validation

The production Node server passed the Frankfurt functional suite for:

- anonymous redirects and invalid access handling
- administrator dashboard, Projects, People CRM, Messages, Meetings, Notifications, project tasks, and task detail
- client Home, Lead Assignment/tasks, task detail, Messages, Meetings, Notifications, and Account
- message pagination at the tested page sizes
- administrator/client route redirection
- manipulated task-ID not-found behavior
- logout

The final sequential suite passed with exit code 0. One earlier run observed a transient task-detail server read failure while tests were being exercised repeatedly against the remote free project. The same route passed before, passed on immediate rerun, and had zero failures in its subsequent 50-request benchmark. No persistent Node-compatibility regression was reproduced.

### Authentication

- The public magic-link route still uses Supabase Auth with `shouldCreateUser: false`.
- It requires only the public Supabase URL, anonymous/publishable key, and application URL.
- It does not read or require the service-role key.
- The real Frankfurt administrator identity `adeelahmed@broadigo.com` exists.
- The existing synthetic client identity `client-1.frankfurt@performance.example.com` exists.
- Frankfurt Auth accepted local callback targets for both identities without sending an email during validation.
- Actual inbox receipt remains a manual test. The administrator address is suitable for that test. The existing synthetic client address is not an inbox the user controls, so client behavior is validated automatically but a manual client magic-link login requires relinking that one synthetic fixture to a real user-provided address in a separately approved step.

## 8. Security validation

The production Node conversion did not modify schema or RLS. Live Frankfurt security validation passed:

- anonymous access denied
- invalid-token access denied
- administrator People CRM and membership access allowed
- client access to administrator RPC denied
- active client can access its own permitted resources
- Client A cannot access Client B resources
- Client B cannot access Client A resources
- disabled-client bootstrap and data access denied
- manipulated/cross-client project, task, message, and meeting identifiers denied

Moving from a Worker to Node did not make the Node server the authorization boundary: verified Supabase identity, bootstrap, database role/status, membership checks, and RLS remain authoritative.

A scan of 68 generated browser/client files found zero exact matches for the Frankfurt service-role key, database password, cron secret, encryption key, Resend key, or Google client secret. Their environment-variable names were also absent from the client bundle.

## 9. Node performance — local development baseline

Method: 50 requests per route against the production Node server at `http://127.0.0.1:3000`, with Frankfurt Supabase as the live backend. Measurements were taken from the Pakistan development machine using Node `v24.18.1`. Every listed route had zero failed samples.

| Route | p50 | p75 | p90 | p95 | Mean | Failures |
|---|---:|---:|---:|---:|---:|---:|
| `/admin` | 838.9 ms | 922.4 ms | 936.7 ms | 1038.7 ms | 854.3 ms | 0/50 |
| `/admin/messages` | 814.4 ms | 830.5 ms | 904.3 ms | 924.8 ms | 811.5 ms | 0/50 |
| `/admin/meetings` | 610.9 ms | 643.8 ms | 718.6 ms | 728.8 ms | 605.7 ms | 0/50 |
| `/portal` | 745.7 ms | 793.4 ms | 828.9 ms | 1142.7 ms | 771.2 ms | 0/50 |
| `/portal/tasks/:id` | 1208.7 ms | 1262.3 ms | 1303.7 ms | 1352.6 ms | 1215.0 ms | 0/50 |
| `/portal/messages` | 808.0 ms | 844.3 ms | 920.8 ms | 941.2 ms | 798.6 ms | 0/50 |
| `/portal/meetings` | 535.4 ms | 609.1 ms | 629.3 ms | 634.9 ms | 559.2 ms | 0/50 |

Direct Frankfurt operations from the same machine measured approximately 406–410 ms p50 for a trivial authenticated read, bootstrap RPC, unread RPC, task query, and messages query. This demonstrates that the local baseline contains the physical Pakistan-to-Frankfurt path. It is not a prediction for Hostinger Germany, where the Node-to-Supabase leg should be geographically local. No additional application optimization should be justified solely by these local figures.

Middleware/proxy timings were normally only a few milliseconds in these runs. There were no Cloudflare `exceededCpu` failures because Cloudflare was not in the request path.

## 10. Realtime, integrations, automation, and assets

### Realtime

An authenticated synthetic client established a direct Frankfurt Realtime subscription and successfully re-established it with a fresh client connection. The test made zero application data mutations.

### Resend and Google Calendar

Both integrations remain in the application and use private Node environment variables. No real customer email was sent and no production Google Calendar event was created during this conversion.

### Automation

The application does not rely on a Cloudflare Cron Trigger. Durable queued work remains processed by the platform-neutral authenticated endpoint `GET /api/cron/automation`, protected by `CRON_SECRET`. A future host must schedule this endpoint once per minute. No Hostinger cron job was configured now.

### Static assets and images

The standalone Node build serves generated JavaScript/CSS and public images/icons itself. The local server returned public assets successfully. LeadsEdge has no active Cloudflare image optimizer and requires no Cloudflare `ASSETS` or `IMAGES` binding.

## 11. Build and quality gates

| Check | Result |
|---|---|
| Clean dependency installation | PASS — 517 packages installed without Wrangler/Cloudflare tooling |
| Vinext compatibility check | PASS for the application; 91% score, with remaining findings confined to ignored tooling/reference directories and the known partial Google-font support |
| Frankfurt production build | PASS |
| Standalone production start | PASS |
| Full Vitest suite | PASS — 16 files, 73 tests |
| TypeScript | PASS |
| ESLint | PASS |
| Frankfurt functional suite | PASS |
| Frankfurt security/isolation suite | PASS |
| Realtime initialization/reconnect | PASS |
| Client-bundle secret scan | PASS — zero matches |

The clean install reported four high-severity dependency advisories. They were not auto-fixed because dependency upgrades were outside this architecture-only phase. They should be reviewed separately without conflating them with the Node conversion.

## 12. Local demonstration instructions

If a production build already exists:

```powershell
npm run start:frankfurt
```

For a fresh checkout or after code changes:

```powershell
npm ci
npm run build:frankfurt
npm run start:frankfurt
```

Open:

```text
http://127.0.0.1:3000
```

Administrator login:

```text
adeelahmed@broadigo.com
```

Existing automated/synthetic client identity:

```text
client-1.frankfurt@performance.example.com
```

The server listens on all interfaces by default. Optional same-LAN access can use the workstation's trusted private IP and port 3000 if the operating-system firewall already permits it. No firewall rule, tunnel, public exposure, or Cloudflare Tunnel was created.

## 13. Hostinger readiness and remaining production work

### Code-level readiness

- Runtime: Node.js `>=22.13.0`; validation used Node `v24.18.1`.
- Build: `npm ci` followed by `npm run build` (or the staging-specific command for Frankfurt validation).
- Start: `npm run start`, which launches `dist/standalone/server.js`.
- Networking: configurable `HOST` and `PORT`; defaults are suitable for a normal long-running Node service.
- Persistent files: no application data must be stored on local disk. The generated build and public assets must be deployed; business data remains in Supabase.
- Memory: no Worker CPU/memory ceiling applies. Final host sizing should be validated under production-like concurrency.
- Cron: an external scheduler must call the authenticated automation endpoint every minute.
- Realtime: outbound HTTPS and WebSocket connectivity to Frankfurt Supabase must be allowed.
- Private environment variables: must be supplied through the host's server-side secret/environment configuration, never the browser bundle.

### Remaining production work — later, not performed

1. Select and provision the Hostinger Germany Node/VPS product.
2. Configure the required public and private environment variables by name.
3. Configure a persistent process manager/restart policy and health monitoring.
4. Configure the one-minute authenticated automation schedule.
5. Confirm outbound HTTPS/WebSocket support for Supabase, Resend, and Google.
6. Configure the production application URL and Supabase Auth redirect allow-list.
7. Perform production-like security, functional, load, and latency validation from the Germany host.
8. Only after approval, configure `portal.leadsedge.us`, DNS, TLS, and rollout/rollback procedures.

## 14. Direct answers

1. **Can LeadsEdge now build and run as a normal Node.js application?** Yes.
2. **What exact command builds it?** `npm run build:frankfurt` for the current Frankfurt staging environment; generic deployment build is `npm run build` with host-provided environment variables.
3. **What exact command starts it?** `npm run start:frankfurt` for local Frankfurt staging; generic production start is `npm run start`.
4. **Does it bind correctly to a configurable HOST/PORT?** Yes. Defaults are `0.0.0.0:3000`, and an explicit `127.0.0.1:3107` test passed.
5. **Are Cloudflare Workers completely absent from the runtime path?** Yes.
6. **What Cloudflare-specific dependencies/configs were removed?** `@cloudflare/vite-plugin`, `@cloudflare/workers-types`, `wrangler`, `@openai/sites-vite-plugin`, `.openai/hosting.json`, `wrangler.frankfurt.jsonc`, Worker binding/placement setup, Cloudflare TypeScript types, and the Worker-only auth-gate helper.
7. **Was the isolated benchmark Worker safely removed?** No. Its status is **PENDING MANUAL DELETION — NON-BLOCKING**, as explicitly requested.
8. **Did all existing tests pass?** Yes: unit/integration tests, typecheck, lint, build, live functional/security suites, Realtime, and bundle secret scan passed.
9. **Does admin magic-link Auth work?** The route, existing admin identity, local callback acceptance, session/route authorization, and automated authenticated flows pass. Final inbox click-through is intentionally left for the user's manual demonstration.
10. **Does client magic-link Auth work?** The route, existing synthetic identity, callback acceptance, session/route authorization, and automated authenticated flows pass. The synthetic address is not a user-controlled mailbox, so manual receipt requires an approved fixture-email relink.
11. **Do disabled-client and cross-client protections still work?** Yes.
12. **Does People CRM still work?** Yes.
13. **Do messages and pagination still work?** Yes.
14. **Do meetings still work?** Yes, without creating real calendar events during this validation.
15. **Does Supabase Realtime still work?** Yes; direct Frankfurt subscription and reconnect both passed.
16. **Were any private secrets found in the client bundle?** No; zero matches were found.
17. **What is `/admin` p50/p95 on the local Node production build?** 838.9/1038.7 ms.
18. **What is `/portal` p50/p95?** 745.7/1142.7 ms.
19. **What is `/portal/tasks/:id` p50/p95?** 1208.7/1352.6 ms.
20. **What is `/portal/messages` p50/p95?** 808.0/941.2 ms.
21. **Is the project ready to demonstrate locally to the team?** Yes for the administrator and all automated client behavior. Manual client email receipt is the one documented limitation.
22. **Is the application structurally ready for a future Hostinger Germany Node deployment?** Yes, at the code/build/runtime level.
23. **What Hostinger-specific work remains for later?** Provisioning, environment/secret configuration, process supervision, cron, WebSocket/egress verification, production Auth URL setup, German-host validation, and finally DNS/TLS after approval.
24. **Did this phase make any Hostinger/domain/DNS changes?** NO.

