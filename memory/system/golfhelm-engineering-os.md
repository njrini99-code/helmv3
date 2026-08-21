# GolfHelm Engineering OS — runtime operating contract

> This is the compact contract every session loads. The full architecture is
> `docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md`; read it when
> designing changes TO this system, not for daily work. If this file and the
> long spec disagree, the long spec wins and this file is the one to fix.

> **Build status (verified 2026-08-21, updated P2):** Live today:
> `knowledge:map` / `knowledge:context` / `knowledge:check` / `knowledge:report`,
> `repo:doctor`, `preflight`, `config/release-policy.yml`, this file, the
> `.claude/rules/golfhelm-engineering-os.md` path-scoped pointer,
> `.claude/session-state/<session_id>.jsonl` event recording, the
> `guard-feature-context` PreToolUse gate, and the session-owned Stop gate
> (mapping/context/memory checks, see "Session mechanics" below). **Not built
> yet** (later phases of the same install): `knowledge:registry-check`,
> `reliability:collect`/`report`, `release:status`/`budget`/`prepare`/`check`,
> the `golfhelm-daily-reliability`/`golfhelm-release-manager` skills, and the
> 12 new `repo:doctor` OS-wiring checks. Where this file still says a rule
> "will" enforce something, that phrasing has not caught up for the items
> just listed as live — read it as already in force for those.

## Source-of-truth hierarchy (highest first)

1. **Live production state** (catalog queries, `pg_get_functiondef`, real env)
2. **Generated artifacts** — `src/lib/types/database.ts`, AUTOGEN blocks,
   `src/lib/golf/surface-registry.ts`
3. **Current code**
4. **Canonical feature memory** — `memory/features/<feature-id>.md`
5. **Semantic history** — `memory/ledgers/*`, `memory/incidents/*`,
   `memory/decisions/*`
6. **Everything else in `memory/` and `docs/`** — hints; verify before acting.

A doc naming a table/path is not evidence it exists. When memory contradicts
generated truth, the memory is wrong — fix the doc, never bend production to
match prose.

## Feature routing

- `memory/registry.yml` is the canonical semantic router for agent work.
- `src/lib/admin/feature-registry.ts` is the runtime observability registry
  (health tiers, heartbeats, action manifests). Its vocabulary will be
  cross-checked against the router by `npm run knowledge:registry-check`
  once that lands; granularity differs by design, file ownership must not
  silently diverge. **Verified 2026-08-21: it already has, for all 4 ids
  that currently share a spelling** (`qualifiers`, `stats_analytics`,
  `calendar_events`, `player_hub`) **— each one's file/action ownership
  disagrees between the two registries today.** Until the cross-check lands,
  treat `memory/registry.yml`'s `code.actions` lists as authoritative for
  routing, not feature-registry.ts's `actions` manifest.
- Resolve any file to its feature: `npm run knowledge:map -- --files <paths>`.
- Build a task context pack: `npm run knowledge:context -- --files <paths>
  --task "<task>"`.
- A governed file that maps to no feature is a **system gap**: map it in
  `memory/registry.yml` in the same change, or record the gap explicitly.

## Before meaningful mutation of governed code

Governed paths: everything `memory/registry.yml` maps, plus
`supabase/migrations/**`.

1. Map the file(s) → feature_id(s).
2. Read the canonical spec: `memory/features/<feature-id>.md` (and for
   multi-feature files, every materially impacted feature).
3. Verify names, columns, and paths against generated/live truth.

The `guard-feature-context` PreToolUse hook enforces this mechanically:
edits to governed files are denied until the session has actually loaded the
mapped feature context (reading the doc or running `knowledge:context`
counts; writing a flag does not).

## After meaningful behavioral mutation

- Update `memory/features/<feature-id>.md` if current truth changed.
- Append to `memory/ledgers/changes/<feature-id>.md` (what/why/sha).
- Update `memory/ledgers/tests/<feature-id>.md` when guarantees change.
- Update/create `memory/incidents/<feature-id>/INC-*.md` when incident-driven.
- Create `memory/decisions/ADR-*.md` for architecture decisions.
- Every entry above carries an explicit `YYYY-MM-DD` date (owner directive,
  2026-08-21) — the Stop gate checks for one in what a session actually wrote
  to a ledger/incident/decision file this turn and rejects an undated entry.

Non-behavioral changes record a structured reason instead:
`node .claude/hooks/lib/record-event.mjs no-memory-change --reason <r>`;
valid reasons: `format-only`, `generated-file-refresh`,
`test-only-no-contract-change`, `comment-correction`,
`mechanical-refactor-with-proven-equivalent-behavior`. The Stop gate rejects
bare "not needed".

## Verification before stopping

Targeted regression test for the change; neighboring tests; `npm run
preflight` for static gates; `npm run build` when a `'use server'` surface
changed; RLS/pgTAP (`npm run test:rls`) when policies or definer functions
changed.

## Incidents: dedupe before you create anything

Identity = `feature_id` + stable fingerprint + root-cause/invariant class.

- Known fingerprint/root-cause with an open incident → **update** it (count,
  last_seen, evidence). Never a second issue.
- Several fingerprints, one proven root cause → one incident, one repair
  unit, one PR when practical.
- Instrumentation at fault → classify TELEMETRY_DEFECT, fix observability.
- Expected/non-actionable → record the classification, nothing else.
- Only a confirmed unique product defect creates a new durable incident.

A thousand events should resolve to a handful of understood root causes,
never a thousand tickets.

## Daily reliability vs. release — separate workflows, hard wall

**Daily** (skill: `golfhelm-daily-reliability`, planned): read Vercel/Sentry/
Bridge/CI via the collector (`npm run reliability:collect`, planned),
correlate, investigate, reproduce, write regression tests, prepare and merge
verified R0/R1 repairs per owner policy, update incidents and the release
queue.

**Daily may never:** deploy or promote or roll back production, apply
production migrations, mutate production data, rotate secrets, change release
policy, or spend the release budget. A healthy day ends with zero commits and
zero artifacts of activity — that is success, not failure.

**Release** (skill: `golfhelm-release-manager`, planned): production ships
**at most twice per calendar week** (`config/release-policy.yml`,
America/New_York) — a ceiling, not a target. Every release, once the release
scripts land: exact candidate SHA on main → `release:budget` →
`release:prepare` → `release:check -- --sha <sha>` → **owner approval** → one
deploy → post-deploy verification → `memory/ledgers/deployments.md` +
release-queue state updates. Until then, any production promote is a manual,
owner-run CLI action outside this workflow — see `memory/ledgers/deployments.md`
for the current backfilled history. Merging to main never implies
deployment; production pins to the last released SHA. If the budget is spent
and a P0 lands, prepare everything and present it — the owner decides on any
override, never the system.

## Release queue

`memory/operations/release-queue.yml` holds **verified repair units**, not
telemetry. Statuses: observed → triaging → reproduced → repairing →
(verification_failed) → verified → queued_for_release → released →
verified_in_production; terminal: blocked / wont_fix / expected / duplicate.
A merged PR is not resolution; a Vercel deploy is not resolution; production
evidence is resolution.

## Risk tiers

- **R0** maintenance (generated docs, registry index, dead links): automate
  after deterministic verification.
- **R1** narrow low-risk repair (repro + regression test + small blast
  radius, no auth/RLS/migration/destructive writes): prepare daily, merge per
  owner policy, ship on the train.
- **R2** product behavior (calendar/stats/CoachHelm output/workflow
  semantics): PR + owner approval + train.
- **R3** privileged (migrations, RLS, auth, secrets, billing, destructive
  data, deploy permissions): investigate and prepare only — the owner
  executes production action. The `db-migration-reviewer` agent review is
  mandatory for schema changes.

## Self-healing must not hide errors

Never: error→[], unknown→healthy, severity downgrades to clean a dashboard,
resolve without evidence, raise a baseline, remove a failing test, suppress
an exception, loosen RLS/auth, delete telemetry — without a specific verified
product decision. More accurate truth, not quieter dashboards.

## Commands

```text
npm run knowledge:map / knowledge:context / knowledge:check   # live
npm run knowledge:registry-check    # router vs runtime registry — planned
npm run reliability:collect         # daily telemetry, read-only — planned
npm run release:status | release:budget | release:prepare | release:check  # planned
npm run repo:doctor                 # live; OS-wiring checks arrive with the checks above
npm run preflight                   # live — the blocking static gate set
```

## Session mechanics (live)

SessionStart initializes `.claude/session-state/<session_id>.jsonl` and
announces this OS. PostToolUse records the feature contexts you actually
load and every file you touch (event-time ownership — git is never asked to
guess whose change is whose). PreToolUse denies governed edits without
loaded context (`guard-feature-context.mjs`), and denies production deploy
shapes outright (`.claude/settings.json` permission denies plus a
`guard-bash.sh` belt-and-braces rule). Stop verifies mapping, context, and
memory evidence against your session's own state before allowing the turn to
end (`stop-verify.sh` + `lib/stop-check.mjs`); git is a fallback cross-check
only, used solely when a session's own ledger recorded zero touches.

## Advanced Reliability Layer

Extends this OS — same `feature_id` vocabulary, no new sources of truth, no
second memory system, no second release process, no duplicate registry.
Detail: `docs/ai-system/GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md`.

Sixteen additions, all keyed by the existing `feature_id`: a live
dependency/blast-radius graph
(`memory/graph/feature-dependencies.yml` — not present yet); golden-path
product health and outcome contracts; executable production data
invariants; an incident replay lab (recorded failure fixtures a repair
must pass against); automated change-risk scoring; feature flags + kill
switches + lifecycle governance; staged/canary release inside existing
release windows; a rollback recommendation engine; a known-good scenario
library; flaky-test intelligence; per-feature performance and cost
baselines; CoachHelm AI evaluation memory; product-analytics/behavioral
anomaly signals; repair-quality scoring; reliability-learning metrics.

Same hard wall as the base OS: daily reliability may analyze, replay,
score, and prepare — never deploy, promote, or roll back production. Canary
and flag-gated rollouts happen only inside an owner-approved release
window, never as a standalone daily action.

**Implementation status: phased rollout pending — see the extension doc.**
None of this is wired yet — no graph file, no invariant registry, no replay
fixtures, no risk model, no flag registry, no baselines, no eval registry
exist in the repo today. Nothing above is a live command, registry, or gate
until its phase lands; treat every noun in this section as planned, not
present.

### Autonomy Control Plane (arc 3, pending)

Deep-research extension beyond the layer above: world model, agent flight
recorder, verification ensemble, earned autonomy, and more — detail at
`docs/ai-system/HELM_AUTONOMY_CONTROL_PLANE.md`. Sequenced after this base OS
and the Advanced Reliability Layer; nothing in it is wired yet.
