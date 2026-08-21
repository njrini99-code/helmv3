# Incident INDEX — Historical section (pre-2026-08-17)

This section covers everything **before 2026-08-17** (window boundary per the
historical-mining brief; a sibling worker owns 2026-08-17 onward — no overlap).
Partition axis: an issue/PR's `createdAt` falls strictly before 2026-08-17
(the date columns below show `closedAt`/`mergedAt`, which may occasionally
land on or after 08-17 for an item opened just before the boundary — see the
"date unknown" note below for the general dating rule).

**Repartition note (mid-mining, owner-directed):** four feature-specialist
workers now own depth for `round_tracking`+`stats_analytics`+`shot_tracking`+
`qualifiers`; `calendar_events`+scheduling+tasks/classes; `coachhelm`
(engine+insights+genome+reviews); `admin_bridge`+`platform_observability`.
This worker (historical miner) owns: the complete INDEX below (every closed
issue + merged PR, one line each — the completeness guarantee) and dedicated
incident RECORDS for `baseball_*`, lifting, marketing/landing, infra/CI/build,
and anything unmapped. Where an INDEX line cites an incident in a
specialist's territory, it points at a record this worker already wrote
*before* the repartition landed — real, dated, evidence-based, but **provisional**:
the owning specialist may verify, extend, or supersede it. Where a
specialist-territory item has no such pre-existing record, the line says so
plainly rather than guessing at what the specialist will find.

**Dating rule (owner directive):** every date below is either an explicit
`YYYY-MM-DD` (from `closedAt`/`mergedAt` — the issue/PR's own record) or the
literal string `date unknown` — never blank, never omitted.

Sources mined: `gh issue list --state closed` (351 total, 320 pre-08-17, all
320 listed below), `gh pr list --state merged` (1,035 total, 971 pre-08-17,
all 971 listed below — one had a null `mergedAt`/`closedAt` and is marked
`date unknown`), `docs/audits/*` and `docs/operations/*` (read directly for
the incidents that already had a written postmortem), and the Bridge
`error_logs` all-time signature roster triage (the four DEAD storms named in
the mining brief).

## Incident records this worker wrote (17 total; 8 remain this worker's,
9 now sit in specialist territory as pre-existing/provisional records)

| id | feature_id | owner | summary | severity | first_seen | resolved |
|---|---|---|---|---|---|---|
| [INC-2026-01-14-01](platform_observability/INC-2026-01-14-01.md) | platform_observability | specialist (provisional) | Dev Supabase DB password committed in plaintext to setup docs | MEDIUM | 2026-01-14 | 2026-05-27 |
| [INC-2026-02-14-01](platform_observability/INC-2026-02-14-01.md) | platform_observability | specialist (provisional) | Live production `service_role` key hardcoded in tracked scripts for ~5 months, closed twice before actually fixed | CRITICAL | 2026-02-14 | 2026-07-03 |
| [INC-2026-03-14-01](platform_observability/INC-2026-03-14-01.md) | platform_observability | specialist (provisional) | Three dead Bridge error storms (GolfRoot 72k, cron.eventReminders, crmSendEmailApi) — mechanism UNKNOWN | LOW | 2026-03-14 | date unknown (dead by attrition, last recurrence 2026-06-25) |
| [INC-2026-05-26-01](coachhelm/INC-2026-05-26-01.md) | coachhelm | specialist (provisional) | v3 CoachHelm generator storm — root-caused to the partial v2→v3 orchestrator cutover (PR #61, 2026-05-25) | MEDIUM | 2026-05-26 | date unknown (no confirmed fix commit; dormant since 2026-05-28) |
| [INC-2026-05-27-01](baseball_core/INC-2026-05-27-01.md) | baseball_core | **this worker** | Baseball cross-tenant leak — roster PII, join codes, private messages readable across orgs | CRITICAL | 2026-05-27 | 2026-07-30 |
| [INC-2026-06-30-01](baseball_core/INC-2026-06-30-01.md) | baseball_core | **this worker** | BaseballHelm shell/route mishaps — oversized unreviewable PRs shipped ~150 catalogued defects | HIGH | 2026-06 (contributing PRs); cataloged 2026-06-30 | 2026-06-30 |
| [INC-2026-07-01-01](baseball_core/INC-2026-07-01-01.md) | baseball_core | **this worker** | Baseball schema drift cluster (#651/#728/#732) | MEDIUM | 2026-07-01 | 2026-07-03 |
| [INC-2026-07-01-01](calendar_events/INC-2026-07-01-01.md) | calendar_events | specialist (provisional) | Partner-reported: GolfHelm calendar wrong-day for Pacific-time users | MEDIUM | 2026-07-01 | date unknown (closed 2026-07-30, no fix confirmed) |
| [INC-2026-07-07-01](admin_bridge/INC-2026-07-07-01.md) | admin_bridge | specialist (provisional) | Two isolated production Postgres errors (CoachHelm-refresh deadlock, crm_coaches permission gap) | LOW | 2026-07-07 | date unknown (no dedicated fix PR identified) |
| [INC-2026-07-27-01](round_tracking/INC-2026-07-27-01.md) | round_tracking | specialist (provisional) | Mission Control sweep 2026-07-30 — Stripe webhook 500s, Inngest round-submit fallback, messaging RLS refusal, AI Gateway plan gap | MEDIUM | 2026-07-26 (earliest of 4) | date unknown (all 4 closed in tracker, no fix commit confirmed) |
| [INC-2026-07-29-01](auth_onboarding_join/INC-2026-07-29-01.md) | auth_onboarding_join | **this worker** | Auth degraded-fallback took the entire site down for 9 hours | CRITICAL | 2026-07-29 04:16 UTC | 2026-07-29 13:51 UTC |
| [INC-2026-08-02-01](platform_observability/INC-2026-08-02-01.md) | platform_observability | specialist (provisional) | deepsec sweep — unauthenticated push-notification endpoint + onboarding auth bypass, already live | CRITICAL | ~5 weeks before 2026-08-02 (onboarding bypass, commit `638a14c64`) | 2026-08-02 |
| [INC-2026-08-03-01](team_access_control/INC-2026-08-03-01.md) | team_access_control | **this worker** | Overnight audit — golf_coaches/golf_teams RLS USING(true), golf-side sibling of the baseball leak | CRITICAL | date unknown (policies shipped before discovery) | 2026-08-03 |
| [INC-2026-08-06-01](admin_bridge/INC-2026-08-06-01.md) | admin_bridge | specialist (provisional) | Bridge incident queue ranked stale over live, replayed 281 closed incidents as current | HIGH | date unknown (3 defects, ages not individually dated) | 2026-08-06 |
| [INC-2026-08-07-01](team_communications/INC-2026-08-07-01.md) | team_communications | **this worker** | Dual-squad DM leak — same-day regression from an earlier tenant-binding fix | HIGH | 2026-08-07 | 2026-08-07 |
| [INC-2026-08-08-01](platform_observability/INC-2026-08-08-01.md) | platform_observability | specialist (provisional) | Stripe billing webhook fail-open — discarded read error let a stale event downgrade a paid invoice | HIGH | date unknown | 2026-08-08 11:14 UTC |
| [INC-2026-08-08-01](baseball_core/INC-2026-08-08-01.md) | baseball_core | **this worker** | Baseball import rollback deletes instead of restoring — same failure shape as round-tracking's destructive-fallback incident | MEDIUM-HIGH | date unknown | 2026-08-08 13:59 UTC |

## Five most significant historical incidents (unchanged from prior pass)

1. **INC-2026-02-14-01** — live production `service_role` key, ~5-month exposure (2026-02-14 → 2026-07-03), closed twice before it was actually fixed.
2. **INC-2026-05-27-01** — baseball cross-tenant leak, 2026-05-27 → 2026-07-30 (~2 months live), roster PII + join codes + private messages.
3. **INC-2026-06-30-01** — BaseballHelm shell/route mishaps postmortem, the clearest root-cause document in this repo's history for "how did ~150 defects reach main."
4. **INC-2026-07-29-01** — the only confirmed full-site outage in this window (2026-07-29, 9 hours, every route including logged-out pages).
5. **INC-2026-08-02-01** — deepsec sweep found a public unauthenticated push-notification endpoint and a client-parameter auth bypass already live on `main` (bypass introduced ~2026-06-27, found 2026-08-02).

Bridge storms: v3 generator storm has a code-verified mechanism
(INC-2026-05-26-01, 2026-05-26); GolfRoot/cron.eventReminders/crmSendEmailApi
mechanism explicitly UNKNOWN (INC-2026-03-14-01, earliest first_seen
2026-03-14).

---

## Complete issue + PR index (every pre-08-17 closed issue and merged PR, one line each)

Format: `#number | type | date (closed/merged, or "date unknown") | title | resolution`.
"non-incident: …" lines give the one-line reasoning required by the mining
brief; grouped process-events (audit batches, QA sweeps) name their number
range and cross-reference the incident record that documents the process,
where one exists, rather than repeating the same reasoning on every line.

### Issues (320)

| # | type | date | title | resolution |
|---|---|---|---|---|
