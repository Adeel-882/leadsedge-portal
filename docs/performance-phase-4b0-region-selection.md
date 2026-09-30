# Leadsedge Portal — Phase 4B0 Zero-Cost Region Selection

Date: 2026-09-04  
Scope: network-region screening only. No Supabase project, paid resource, deployment, migration, environment variable, DNS record, application code, production configuration, or database object was created or changed.

## Decision

**Recommended first paid staging region: Frankfurt (`eu-central-1`).**  
**Confidence: MEDIUM.**

Virginia is the clear client-heavy winner, but Frankfurt is the better first whole-product test. It gives the Pakistan operations team materially better median and tail latency, remains much better for U.S. users than Seoul in the East, and wins the balanced scenario on tail latency despite Virginia's 21 ms median advantage. This is a staging-test recommendation, not final production authorization.

## 1. Why region selection changed

The original U.S.-first framing emphasized where client accounts are located. Leadsedge has a second operationally important population: administrators in Pakistan. A single administrator may perform hundreds of navigations, messages, CRM edits, project updates, and task operations per day, while an individual client may perform only a handful of portal interactions.

Region selection must therefore consider interaction volume, latency, backend locality, and operational importance—not user count alone. The candidates screened were Frankfurt (`eu-central-1`), North Virginia (`us-east-1`), and the current Seoul control (`ap-northeast-2`). Mumbai was measured only as optional Pakistan-side context.

## 2. Measurement methodology

### Direct Pakistan measurements

- Origin: the current development workstation/network in Pakistan.
- Targets: AWS EC2 regional HTTPS endpoints documented by AWS for Frankfurt, North Virginia, Seoul, and Mumbai. [AWS EC2 regional endpoints](https://docs.aws.amazon.com/ec2/latest/devguide/ec2-endpoints.html).
- Request: unauthenticated HTTPS request to `/`, no redirect following, tiny `301` response, no payload download.
- Samples: 100 independent requests per region.
- Every sample created a fresh client process/connection and captured DNS, TCP-ready, TLS-ready, first-byte, and total time.
- Percentiles use the nearest observed sorted sample; standard deviation is population standard deviation.
- The detailed stage values from the local client are cumulative milestones from request start. Total/TTFB is the comparable screening metric.

### U.S. external synthetic measurements

- Source: Globalping's public, free, unauthenticated measurement network. Its API supports HTTP tests from selected geographic probes and requires no cloud resource. [Globalping API](https://globalping.io/docs/api.globalping.io) and [open-source project documentation](https://github.com/jsdelivr/globalping).
- U.S. East model: 30 probes selected from Virginia, New York, and North Carolina.
- U.S. West model: 30 probes selected from California and Oregon; 29 returned successful results consistently and one failed.
- Request: HTTPS `HEAD /` to the same AWS EC2 regional endpoints.
- The same selected probes were reused across all three targets within each U.S. origin group.
- Each probe produced one HTTP/TLS observation. These figures are **external synthetic data**, not measurements from Leadsedge customers or Supabase.

Measurement IDs:

| Origin | Virginia | Frankfurt | Seoul |
| --- | --- | --- | --- |
| U.S. East | [`2JkIFZEisiWeQjzUb000214el`](https://globalping.io?measurement=2JkIFZEisiWeQjzUb000214el) | [`28cXWdGczfsWvWN7U000214el`](https://globalping.io?measurement=28cXWdGczfsWvWN7U000214el) | [`27q2UZGRoIglnTLyt000214el`](https://globalping.io?measurement=27q2UZGRoIglnTLyt000214el) |
| U.S. West | [`20z5aiAVtrTixlndL000214el`](https://globalping.io?measurement=20z5aiAVtrTixlndL000214el) | [`2aO2dP6qZO0LeiriB000214em`](https://globalping.io?measurement=2aO2dP6qZO0LeiriB000214em) | [`2SQrIx9Ha2e8iMY0S000214em`](https://globalping.io?measurement=2SQrIx9Ha2e8iMY0S000214em) |

### What these numbers do and do not mean

These figures measure regional Internet path quality plus a tiny AWS endpoint's DNS/TCP/TLS/response behavior. They do **not** equal Supabase REST latency, PostgreSQL execution, Vinext rendering, Realtime behavior, or complete portal latency. They are suitable for eliminating clearly poor candidates before spending money; real Supabase/Worker staging remains the required validation.

## 3. Pakistan results

### Tiny HTTPS total duration (100 direct samples)

| Region | p50 | p75 | p90 | p95 | Mean | Std. dev. | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frankfurt | 532.9 ms | 566.5 ms | 692.5 ms | 757.9 ms | 566.6 ms | 125.3 ms | 1365.3 ms |
| Virginia | 730.8 ms | 845.2 ms | 1240.5 ms | 1728.0 ms | 865.6 ms | 312.1 ms | 2130.8 ms |
| Seoul | 631.5 ms | 696.0 ms | 1168.3 ms | 1474.2 ms | 755.2 ms | 291.6 ms | 1824.8 ms |
| Mumbai (context only) | 314.0 ms | 332.9 ms | 440.6 ms | 674.6 ms | 373.9 ms | 223.7 ms | 1900.9 ms |

Frankfurt beat Virginia from Pakistan by approximately **198 ms at p50** and **970 ms at p95**. Frankfurt also beat Seoul by approximately **99 ms at p50** and **716 ms at p95** in this run. Mumbai was fastest from Pakistan but was not promoted to a primary candidate because this phase lacks equivalent evidence that it can provide an acceptable nationally distributed U.S. client experience.

### Pakistan timing milestones

These are cumulative times from request start, not independently additive stages.

| Region | DNS p50/p95 | TCP ready p50/p95 | TLS ready p50/p95 | TTFB p50/p95 |
| --- | ---: | ---: | ---: | ---: |
| Frankfurt | 20.3 / 34.9 ms | 175.0 / 198.5 ms | 372.4 / 589.5 ms | 532.8 / 757.8 ms |
| Virginia | 19.3 / 57.6 ms | 241.6 / 300.5 ms | 501.8 / 1083.9 ms | 730.7 / 1727.9 ms |
| Seoul | 21.4 / 47.0 ms | 207.2 / 254.8 ms | 441.6 / 1239.1 ms | 631.4 / 1474.1 ms |
| Mumbai | 18.9 / 28.9 ms | 106.2 / 124.9 ms | 224.8 / 443.8 ms | 313.9 / 674.5 ms |

The large Virginia and Seoul p95 spread is meaningful as observed path instability, but it should be rechecked on other Pakistan ISPs and time windows before a production decision.

## 4. U.S. East results

External synthetic HTTPS totals from 30 successful probes:

| Region | p50 | p75 | p90 | p95 | Mean | Std. dev. | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Virginia | 72 ms | 109 ms | 193 ms | 218 ms | 86.2 ms | 83.7 ms | 411 ms |
| Frankfurt | 303 ms | 411 ms | 470 ms | 734 ms | 363.9 ms | 145.0 ms | 942 ms |
| Seoul | 631 ms | 753 ms | 848 ms | 1523 ms | 717.0 ms | 248.5 ms | 1597 ms |

Virginia is the decisive U.S. East winner. Frankfurt is materially slower than Virginia, but still cuts the Seoul median by 328 ms and the p95 by 789 ms in this sample.

## 5. U.S. West results

External synthetic HTTPS totals from 29 successful probes (one selected probe failed consistently):

| Region | p50 | p75 | p90 | p95 | Mean | Std. dev. | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Virginia | 214 ms | 237 ms | 291 ms | 304 ms | 220.1 ms | 60.9 ms | 386 ms |
| Frankfurt | 472 ms | 502 ms | 515 ms | 571 ms | 473.6 ms | 53.6 ms | 587 ms |
| Seoul | 436 ms | 483 ms | 559 ms | 767 ms | 471.2 ms | 105.6 ms | 817 ms |

Virginia also wins U.S. West. Seoul has a 36 ms median advantage over Frankfurt for the West probes, but Frankfurt has a 196 ms better p95 and much lower variation.

## 6. Region matrix

Values are tiny HTTPS total p50 / p95.

| User location | Seoul | Frankfurt | Virginia |
| --- | ---: | ---: | ---: |
| Pakistan — **direct measured** | 631 / 1474 ms | **533 / 758 ms** | 731 / 1728 ms |
| U.S. East — **external synthetic** | 631 / 1523 ms | 303 / 734 ms | **72 / 218 ms** |
| U.S. West — **external synthetic** | 436 / 767 ms | 472 / 571 ms | **214 / 304 ms** |

No cell is a Supabase or portal benchmark. No U.S. figure is claimed as directly measured from a Leadsedge user.

## 7. Weighted scenarios

Assumption for U.S. interactions: **65% East / 35% West**. The resulting total weights are:

- Client-heavy: Pakistan 20%, U.S. East 52%, U.S. West 28%.
- Balanced: Pakistan 50%, U.S. East 32.5%, U.S. West 17.5%.
- Admin-intensive: Pakistan 60%, U.S. East 26%, U.S. West 14%.

Weighted score = Pakistan latency × Pakistan share + U.S. East latency × East share + U.S. West latency × West share. p50 and p95 are scored separately. This is a screening model, not a prediction of route duration.

| Scenario | Metric | Seoul | Frankfurt | Virginia | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Client-heavy | p50 | 576.5 ms | 396.3 ms | **243.5 ms** | Virginia |
| Client-heavy | p95 | 1301.6 ms | 693.1 ms | **544.1 ms** | Virginia |
| Balanced | p50 | 597.1 ms | 447.5 ms | **426.3 ms** | Virginia by 21.2 ms |
| Balanced | p95 | 1366.3 ms | **717.4 ms** | 988.1 ms | Frankfurt by 270.7 ms |
| Admin-intensive | p50 | 604.0 ms | **464.6 ms** | 487.2 ms | Frankfurt |
| Admin-intensive | p95 | 1387.9 ms | **725.5 ms** | 1136.0 ms | Frankfurt |

### Scenario conclusions

- **Client-heavy winner: Virginia.** Both median and tail are clearly lower.
- **Balanced winner for the whole-product decision: Frankfurt, narrowly and with qualification.** Virginia's median score is only 21 ms better, while Frankfurt's p95 score is 271 ms better. Given the operational importance of Pakistan administrators and the instability observed on the Pakistan→Virginia path, Frankfurt is the safer balance.
- **Admin-intensive winner: Frankfurt.** Its p50 advantage is modest in the weighted aggregate, but its p95 advantage is substantial.

Changing the real U.S. East/West split or interaction shares may change these scenario winners. Those values must be measured from product telemetry before final production selection.

## 8. Architecture implications

The intended dynamic architecture for each candidate is:

```text
User
  → dynamic Vinext Worker placed near the selected primary
  → primary Supabase in the same AWS region
```

- Frankfurt: Pakistan and U.S. users reach a Frankfurt Worker; Worker→Supabase remains local to `eu-central-1`.
- Virginia: Pakistan and U.S. users reach a Virginia Worker; Worker→Supabase remains local to `us-east-1`.
- Seoul control: users reach Seoul dynamic compute/database.
- Static assets are excluded from the regional score because Cloudflare can continue serving them near users globally.

The optimized portal still performs roughly 2–5 Supabase operations by route, but those operations originate from the dynamic Worker. With Worker and Supabase colocated, the long user→region trip normally occurs once per navigation, while the internal Worker→Supabase calls should use low regional latency. Therefore multiplying user→region RTT by five would materially overstate expected latency.

This does not make the primary region irrelevant. Supabase Auth, Data API calls, mutations, and Realtime connections still terminate against regional Supabase infrastructure. Cloudflare cannot transparently turn a single-region Supabase project into a multi-region system. Storage is not currently used by this application, but it would carry the same regional caveat if added.

## 9. Cloudflare placement recommendation

Cloudflare currently supports explicit cloud-region placement in the form `aws:{region}` and specifically documents `aws:us-east-1`; the same supported AWS identifier format covers `aws:eu-central-1`. Explicit region placement is intended for a known, single-homed backend, while Smart Placement is intended for multiple or unknown backend locations. Static assets remain edge-served near the requester, and placement applies to Worker fetch handlers. [Cloudflare Workers placement](https://developers.cloudflare.com/workers/configuration/placement/).

For a Frankfurt staging experiment, the proposed configuration is:

```json
{
  "placement": {
    "region": "aws:eu-central-1"
  }
}
```

For a Virginia control experiment:

```json
{
  "placement": {
    "region": "aws:us-east-1"
  }
}
```

Recommendation: use **`placement.region`**, not `placement.hostname` and not Smart Placement, for the first staging test. Supabase's primary AWS region is known, so explicit placement is deterministic. Hostname probing can be confounded by HTTP front doors or anycast behavior rather than the database's physical region. Smart Placement needs representative traffic and can change its decision; that is useful later if backend topology becomes distributed, but it adds uncertainty to a controlled region experiment.

No placement configuration was added or enabled in this phase.

## 10. Future read-replica option

Read replicas are a future scale option, not a present recommendation:

- Eligible reads may be served closer to U.S. or Asian users.
- Writes remain primary-oriented.
- Replication is asynchronous and introduces replication lag.
- Supabase currently limits replicas to reads; Auth requests and writes remain on the primary, while Auth, Realtime, and Storage are not geo-routed to replicas in the same way as eligible Data API reads.
- Replicas add operational complexity and cost and do not remove the need to choose a suitable primary.

These constraints are documented by [Supabase Read Replicas](https://supabase.com/docs/guides/platform/read-replicas). Leadsedge should first validate one simple colocated Worker/primary architecture with synthetic staging data.

## 11. Recommended first paid staging region

Choose **Frankfurt (`eu-central-1`) first**.

Why:

1. It reduced Pakistan tiny-HTTPS p50 by about 198 ms versus Virginia and p95 by about 970 ms in the direct run.
2. It materially improves U.S. East compared with Seoul, even though it cannot match Virginia.
3. It is approximately tied with Seoul for U.S. West at the median and is substantially more stable at p95.
4. It wins the admin-intensive scenario and the balanced tail score.
5. In the balanced model, Virginia's p50 advantage is only 21 ms—too small to justify accepting the observed Pakistan tail penalty without a real Supabase/Worker test.

Virginia should remain the mandatory comparison candidate if production telemetry later shows the application is genuinely client-heavy by interactions or if actual colocated staging results show Pakistan remains operationally acceptable.

Seoul is dominated by Frankfurt in all three weighted scenarios in this screen and is not the recommended next paid test.

### Production target if Frankfurt validates

```text
Global Cloudflare static edge
  +
Dynamic Vinext Worker explicitly placed near aws:eu-central-1
  +
Primary Supabase in eu-central-1
```

No client caching redesign and no read replica should be added to the first experiment.

## 12. Confidence and evidence that could change the recommendation

**Confidence: MEDIUM.**

Evidence that could change the result:

- Direct Pakistan HTTPS samples from multiple ISPs, cities, weekdays, and workday time windows showing the current Virginia tail was anomalous.
- Real U.S. client measurements, especially central U.S. coverage and a different East/West mix than 65/35.
- Actual product interaction telemetry showing U.S. interactions are consistently near or above the client-heavy 80% scenario.
- A real `eu-central-1` versus `us-east-1` Supabase test of trivial Auth/Data API calls and `get_portal_bootstrap()`.
- Colocated Vinext Worker route measurements for `/admin`, `/portal`, `/portal/tasks/:id`, and `/portal/messages`.
- Evidence that the eventual hosting path cannot honor or consistently maintain the requested Worker placement.
- Business requirements that mandate U.S. data residency.

The next paid experiment should preserve identical migrations, synthetic fixtures, application build, sample method, and route IDs across candidates. The current Phase 3.2 Seoul application baseline remains unchanged and was not rerun.

## Direct answers

1. **Pakistan → Frankfurt p50/p95:** 532.9 / 757.9 ms, directly measured tiny HTTPS total, 100 samples.
2. **Pakistan → Virginia p50/p95:** 730.8 / 1728.0 ms, directly measured tiny HTTPS total, 100 samples.
3. **Pakistan → Seoul p50/p95:** 631.5 / 1474.2 ms, directly measured tiny HTTPS total, 100 samples.
4. **U.S. East → Frankfurt:** 303 / 734 ms p50/p95, external synthetic HTTPS, 30 probes.
5. **U.S. East → Virginia:** 72 / 218 ms p50/p95, external synthetic HTTPS, 30 probes.
6. **U.S. West → Frankfurt:** 472 / 571 ms p50/p95, external synthetic HTTPS, 29 successful probes.
7. **U.S. West → Virginia:** 214 / 304 ms p50/p95, external synthetic HTTPS, 29 successful probes.
8. **Which region wins the client-heavy scenario?** Virginia.
9. **Which wins the balanced scenario?** Frankfurt for the whole-product decision: Virginia is 21 ms better at weighted p50, but Frankfurt is 271 ms better at weighted p95 and avoids the severe Pakistan tail.
10. **Which wins the admin-intensive scenario?** Frankfurt.
11. **Is Frankfurt the best compromise?** Yes, based on this region screen.
12. **Would Virginia materially hurt the Pakistan admin experience?** Yes in this sample: approximately +198 ms p50 and +970 ms p95 versus Frankfurt.
13. **Is Seoul clearly dominated by one of the alternatives?** Yes. Frankfurt beats Seoul in every weighted scenario and is the stronger balance.
14. **Which one region should be paid to test with real Supabase first?** Frankfurt (`eu-central-1`).
15. **What Cloudflare placement should that staging Worker eventually use?** Explicit `placement.region = "aws:eu-central-1"`.
16. **What evidence could still change the recommendation?** Multi-ISP/time-window Pakistan measurements, real U.S. interaction geography and volume, actual regional Supabase calls, colocated Worker route benchmarks, placement verification, or a U.S. data-residency requirement.
