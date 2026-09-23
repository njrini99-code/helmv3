
# GolfHelm Engineering OS — reliability contract

> Operating policy (authority, Git, verification, database, production) is
> `AGENTS.md`. This file adds the golf reliability model: how truth is ranked,
> how incidents are deduplicated, and how daily reliability stays separate from
> releases. If this file disagrees with AGENTS.md, AGENTS.md wins and this file
> is the one to fix. The long-form design is
> `docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md`; read it only
> when changing this system. Actual hook and permission wiring is generated in
> `docs/CONTROL_PLANE_ENFORCEMENT.md` — take enforcement claims from there,
> not from prose.

## Source-of-truth hierarchy (highest first)

1. **Live production state** (catalog queries, `pg_get_functiondef`, real env)
2. **Generated artifacts** — `src/lib/types/database.ts`, AUTOGEN blocks,
   `src/lib/golf/surface-registry.ts`
3. **Current code**
4. **Canonical feature memory** — the doc `memory/registry.yml` names
5. **Semantic history** — `memory/ledgers/*`, `memory/incidents/*`,
   `memory/decisions/*`
6. **Everything else in `memory/` and `docs/`** — hints; verify before acting.

A doc naming a table or path is not evidence it exists. When memory
contradicts generated truth, the memory is wrong: fix the doc, never bend
production to match prose.

## Feature routing

- `memory/registry.yml` is the semantic router for agent work
  (`npm run knowledge:map -- --files <paths>`; context packs with
  `npm run knowledge:context`).
- `src/lib/admin/feature-registry.ts` is the runtime observability registry
  (health tiers, heartbeats, action manifests). Where its file or action
  ownership disagrees with `memory/registry.yml`, the router is authoritative
  for agent routing.
- A governed file that maps to no feature is a gap: map it in the same change,
  or report it.

## Memory after a change

Update the mapped feature doc when its contract changes (AGENTS.md
"Context"). Record an incident (`memory/incidents/<feature_id>/INC-*.md`) or a
decision (`memory/decisions/ADR-*.md`) when the change is incident- or
architecture-driven. Per-feature ledgers under `memory/ledgers/` are optional
history; git carries the what/why/sha of ordinary changes.

## Incidents: dedupe before you create anything

Identity = `feature_id` + stable fingerprint + root-cause/invariant class.

- Known fingerprint/root cause with an open incident → **update** it (count,
  last_seen, evidence). Never a second issue.
- Several fingerprints, one proven root cause → one incident, one repair unit,
  one PR when practical.
- Instrumentation at fault → classify TELEMETRY_DEFECT, fix observability.
- Expected/non-actionable → record the classification, nothing else.
- Only a confirmed unique product defect creates a new durable incident.

A thousand events should resolve to a handful of understood root causes, never
a thousand tickets.

## Scheduled reliability vs. release

A **scheduled reliability routine** (unattended) may observe, investigate,
reproduce, write regression tests, and prepare or merge verified low-risk
repairs as `config/release-policy.yml` allows. It never deploys, promotes, or
rolls back production, applies production migrations, mutates production
data, rotates secrets, or spends the release budget. For such a routine, a
quiet day with no commits is success.

A **release** happens only when the user asks, through the path in AGENTS.md
"Production", within the weekly ceiling in `config/release-policy.yml`
(a ceiling, not a target). If the budget is spent and a P0 lands, prepare
everything and present it; the owner decides on any override. History:
`memory/ledgers/deployments.md`.

## Release queue

`memory/operations/release-queue.yml` holds **verified repair units**, not
telemetry. Statuses: observed → triaging → reproduced → repairing →
(verification_failed) → verified → queued_for_release → released →
verified_in_production; terminal: blocked / wont_fix / expected / duplicate.
A merged PR is not resolution; a deploy is not resolution; production evidence
is resolution.

## Self-healing must not hide errors

Never: error→[], unknown→healthy, severity downgrades to clean a dashboard,
resolve without evidence, raise a baseline, remove a failing test, suppress an
exception, loosen RLS/auth, delete telemetry — without a specific verified
product decision. More accurate truth, not quieter dashboards.

## Planned extensions (specs only, nothing wired)

- Advanced Reliability Layer → `docs/ai-system/GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md`
- Autonomy Control Plane → `docs/ai-system/HELM_AUTONOMY_CONTROL_PLANE.md`
