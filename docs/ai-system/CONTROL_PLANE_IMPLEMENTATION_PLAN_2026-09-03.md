<!-- markdownlint-disable MD004 MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Helm Bridge Control-Plane Implementation Plan

> Scout deliverable. Read-only research against the canonical checkout
> `/Users/ricknini/Downloads/helmv3` at commit `44f4ce183` (`git rev-parse
> --short HEAD`, run 2026-09-02). This document was written into the
> docs-only worktree `~/worktrees/helmv3/sentry-max-controlplane` and is
> **not committed** — the commander commits it.
>
> Scope: an implementation plan for Phases D, E, F, G, J, K of the
> `HELM_AUTONOMY_CONTROL_PLANE.md` / `GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md`
> program, plus a Telemetry Quality dashboard + Sentry trace-meta
> drill-through ask. Repo-state counts (file counts, line counts, entry
> counts) are not stated as bare numbers in prose — each is either dropped
> in favor of the file:line/command that reproduces it, or attached to the
> `find`/`grep` that would re-derive it, so the claim cannot go stale
> silently the way `.claude/rules/shipping.md` §1 documents this repo's
> knowledge base having done before.
>
> **Coordination note, added after a fixed round of self-review:** a
> handoff brief committed to this worktree at `12d3c48d5`
> (`docs/ai-system/HANDOFF_BRIDGE_CONTROL_PLANE_2026-09-03.md`) confirms
> this plan's scope (Phases D-K) against a live ownership split across
> three parallel sessions and supplies telemetry vocabulary and a schema
> this plan did not have when first drafted. See §0.15 below — read it
> before sequencing any Phase D or J work.
>
> **Method note on coverage:** every code citation below was read directly
> from the checkout on 2026-09-02 (`grep -n`, `sed -n`, `wc -l`, `find`,
> `Read`). Existence claims for registries/scripts/directories are `ls`/`find`
> results, not claims taken from any doc's own text about itself — per this
> repo's own source-of-truth hierarchy (`memory/system/golfhelm-engineering-os.md`
> "Source-of-truth hierarchy", live/generated/code outranks prose), a doc
> saying a thing exists is not evidence it does.

---

## 0. The single most important finding — corrections before any planning

The compact operating contract, `memory/system/golfhelm-engineering-os.md`
("Planned extensions" section, end of file), states that neither the
Advanced Reliability Extension nor the Autonomy Control Plane has "no live
command, registry, file, or gate in this repo today." **That is not
uniformly true**, and the plan below is built on the corrected picture, not
the stated one. Per the same document's own rule ("generated/live/code truth
outranks prose... fix the doc, never bend production to match prose"), this
section is itself a fix owed to that file, not just context for this plan.

### 1. The reliability collector is live in production today

`memory/system/golfhelm-engineering-os.md`'s "Planned commands" list names
`reliability:collect` as not existing. The underlying capability exists and
runs every three hours:

- `src/lib/reliability/collect.ts:69` `runReliabilityCollection()` — runs
  three fault-isolated collector arms concurrently (`Promise.allSettled`,
  `src/lib/reliability/collect.ts:82-90`), correlates their output
  (`correlateSignals`, `src/lib/reliability/normalize.ts:177`), and writes
  **one** `background_job_logs` row per run under job type
  `reliability-snapshot` (`RELIABILITY_SNAPSHOT_JOB_TYPE`,
  `src/lib/reliability/normalize.ts:54`; insert at
  `src/lib/reliability/collect.ts:121-135`).
- Collector arms: `collectSentry` (`src/lib/reliability/sources.ts:122`),
  `collectSupabase` (`:190`), `collectVercel` (`:306`).
- Wired at `src/app/api/cron/reliability-triage/route.ts:1-40`, scheduled
  `0 */3 * * *` in `vercel.json:112-115`. Also writes a second, standard
  cron-board row via `recordJobRun(RELIABILITY_JOB_TYPE, ...)` where
  `RELIABILITY_JOB_TYPE = 'reliability-triage'`
  (`src/lib/reliability/normalize.ts:33`) — two rows per run, by design (see
  the file's own comment block, lines 9-19).
- What is genuinely missing is only the **npm script name** —
  `package.json` has no `reliability:collect` entry — and a repo-doctor
  check confirming the cron is live. The capability is real; the CLI
  ergonomics the spec describes are not.

There is no `scripts/operations/daily-health/` directory (`find` — not
found), so the separate "daily observability collector" described in
`docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md` §23 is not
built — but a materially similar thing already runs three-hourly under a
different name and location.

### 2. A three-stage self-healing loop runs daily against production, right now

`docs/ai-system/selfheal/README.md` documents (and
`docs/ai-system/selfheal/STATE-2026-08-28.md` measured, as a point-in-time
snapshot) a live loop, **not a plan**:

```text
Collect (Vercel cron, 3h, reliability-triage)
  → Diagnose (Anthropic-hosted cloud routine trig_017qz7gw31S7b1GCK2abmmPr,
     09:17 UTC daily, reads admin_events + the reliability snapshot,
     runs src/lib/admin/rca.ts:183 runRcaAnalysis, categorizes into
     FIX HERE / ALREADY FIXED / NOT A DEFECT / NEEDS MORE EVIDENCE via
     RCA_CANONICAL_PREFIX / deriveRcaCategory in src/lib/admin/rca-category.ts)
  → Repair (launchd agent on the owner's Mac, com.helm.bridge-rca-repair,
     06:40 ET daily, follows docs/ai-system/selfheal/repair-contract.md,
     STEP 3 already does "worktree, then reproduce, then fix" — opens a PR,
     never merges/deploys)
  → Close (Vercel cron log-retention → src/lib/admin/auto-resolve.ts)
```

Every stage heartbeats into `background_job_logs`; expected-vs-actual is
`src/lib/admin/selfheal-registry.ts:85` `SELFHEAL_STAGES`, rendered on
`/admin/self-heal` (`src/app/admin/self-heal/page.tsx`) and `/admin/jobs`.
Loop-wide capability proof state already exists as a three-valued type —
`src/lib/admin/selfheal-capability.ts:42` `CapabilityState = 'proven' |
'unproven' | 'unknown'` — which is a real, if coarse, precursor to Phase J's
Earned Autonomy trust levels.

**This changes the plan's default for Phases G and J**: do not design a new
reproducer/healer loop. Extend the one that exists. See §5 and §7.

### 3. One of the Advanced Reliability Extension's completion criteria is already met, and dated *before* the extension spec

`config/control-plane-gaps.json`'s `closed` array records
`ERROR_SURFACES_DISAGREE`, opened and closed 2026-08-30, "how": built
`src/lib/admin/incidents/reconciliation.ts` (`reconcileErrorSurfaces`,
`:68`; `OverallHealth = 'healthy' | 'degraded' | 'partial' | 'blind' |
'unknown'`, `:44`) with 15 tests, rendered as `ErrorSurfaceReconciliation` on
`/admin/errors`. This is the exact gap `docs/ai-system/selfheal/STATE-2026-08-28.md`
§5.1 called "the biggest" problem two days earlier. It is fixed. Any plan
item that reads "unify the two disagreeing error surfaces" is **already
done** — verify it still holds, do not rebuild it.

### 4. `feature-registry.ts` already implements a crude SLO + silence-detection system

`src/lib/admin/feature-registry.ts:168-171` `TIER_THRESHOLDS`:

```text
high: { amberFp: 2, redFp: 5,  heartbeatStaleHours: 6      }
med:  { amberFp: 1, redFp: 2,  heartbeatStaleHours: 72     }
low:  { amberFp: 1, redFp: 2,  heartbeatStaleHours: 24*14  }
```

Per `FeatureDef` (`:115-149`), every one of the 86 `FeatureKey` entries
(`:22-114`, spanning `golfhelm`/`coachhelm`/`baseballhelm`) carries an
optional `heartbeatTable`/`heartbeatColumn` and an optional
`heartbeatStaleHoursOverride` — e.g. `qualifiers` widens its window to 7
days (`:237`) because "quiet between events is NORMAL" (`:239`), which is
exactly the "quiet is not failure" case Phase D's absent-data detector must
handle. This is **not** a rolling-window burn-rate SLO/error-budget system —
it is a static per-tier fingerprint-count and staleness threshold — but it
is the load-bearing seam for Phase D. See §3.

### 5. `memory/operations/release-queue.yml` is live and hand-populated; only its automated writer is missing

The file's own header (lines 8-15) says so plainly: "HOW IT IS POPULATED
TODAY: by hand... The automated writer (`npm run reliability:collect` /
`release:*`) is still specified and still absent." Real entries exist
(`qualifier-manual-close-only-2026-08-22`, `confirmed-snapshot-recovery-
prompt-2026-08-22`) with real SHAs, real incident links, real regression
test paths. `config/release-policy.yml` is likewise live and
machine-readable (2/calendar-week ceiling, `daily_reliability.may_*` flags,
`release.human_approval_required: true`) — not merely prose.

### 6. `release:status` exists, but is not the release-candidate builder the base spec describes

`package.json:106` has exactly one `release:*` script:
`"release:status": "node scripts/release-status.mjs"`. Its own header
explains it answers "is the thing users are running the thing we merged?"
by fetching the live page and walking `main`'s history for the first SHA
that appears in a served JS chunk (`scripts/release-status.mjs:1-30`) — a
**deployed-vs-merged drift detector**, not the release-candidate report
generator (`docs/releases/<sha>.md`, commits/PRs/features/risk/R0-R3/
migrations) that `GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md` §21
specifies. `scripts/release/` does not exist (`find` — not found).
`release:prepare`, `release:check`, `release:budget`, `reliability:report`
are all absent from `package.json`. `.claude/skills/golfhelm-daily-
reliability/` does not exist on disk.

### 7. `TELEMETRY_BASELINE.md` and `MISSION_CONTROL_CONTEXT_INDEX.md` describe a pipeline that no longer exists

Both docs (`docs/operations/context/`) are written around **Huly**, **n8n**,
and **"the external review bot"** as live consumers of telemetry. But
`AGENTS.md` ("Automated review" section) states: "There are **no AI
reviewers on PRs.** The external review bots were dropped 2026-07-20 by
founder decision." `TELEMETRY_BASELINE.md`'s own snapshot date is
2026-07-01 — before that decision — and it was never updated after. Its §2
table routes findings to "the external review bot" and its §4 describes an
n8n/Huly reconciliation loop this repo's current authority (`AGENTS.md`,
`memory/system/golfhelm-engineering-os.md`, `docs/ai-system/selfheal/*`)
does not mention anywhere else. **Do not build the Telemetry Quality
dashboard (§9 below) as a feed into Huly/n8n/a review bot.** The live
system today is the Bridge (`src/app/admin/**`) built directly on
`src/lib/admin/incidents/**` and `src/lib/reliability/**`, which is what
this plan extends. Whether Huly/n8n are still operated at all outside this
repo is **UNKNOWN** — nothing in the codebase confirms or denies it, and
this plan does not depend on the answer.

### 8. The entire Bridge/control-plane surface is one `feature_id`

`memory/registry.yml:1161-1232` `admin_platform` maps `src/app/admin/**`,
`src/lib/admin/**`, `src/lib/reliability/**`, and
`src/app/api/cron/reliability-triage/**` — everything this plan touches —
to a **single** feature id. There is no separate `observability` or
`reliability` top-level key in `memory/registry.yml` (`grep -n
"^  observability:\|^  reliability:"` — no matches). This is a real
granularity problem for Phase E's World Model, whose edges are supposed to
carry per-capability evidence: today, "what does X affect" resolves to
"admin_platform" for nearly everything in Phases D/E/F/G/J/K, which is not
a useful blast-radius answer. Flagged as an OWNER DECISION in §12.

### 9. PostHog is wired, but the event footprint is thin — do not add a second platform

Client init: `src/components/providers/PostHogProvider.tsx:11-20`
(`initPostHog`, no-ops without `NEXT_PUBLIC_POSTHOG_KEY`), auto-captures
`$pageview` on every route change (`:49`). Server-side:
`src/lib/analytics/posthog-server.ts:61` `captureServer`, also a silent
no-op without the key (`:20-21`). Real call sites, verified by grep and
read, not assumed: `src/components/demo/DemoEnterTracker.tsx:42`
(`posthog.capture(DEMO_ENTER_EVENT, ...)`, client) and
`src/app/golf/actions/auth.ts:186` (`captureServer(DEMO_ENTER_EVENT, ...)`,
server-side duplicate of the same event). That is the **entire** custom
event footprint — pageviews plus one demo-entry event. Zero golden-path
completion/funnel events exist (round started→submitted, RSVP→persisted,
etc. — none of the strings from `GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md`
§30-32's example list appear anywhere in a `posthog.capture` or
`captureServer` call). Phase D's behavioral-signals work is an
instrumentation-authoring task on the existing platform, not a
platform-selection task.

### 10. Mutation testing exists, is correctly scoped, and cannot fail

`.circleci/config.yml:123-155` `stryker-coachhelm` — weekly, `mutate:
["src/lib/coachhelm/v2/**/*.ts"]` (a defensible pilot scope: critical
CoachHelm logic, matching the Autonomy Control Plane spec §8's own example
domains). But the run line is `npx stryker run || true`
(`.circleci/config.yml:152`) — **the `|| true` masks every non-zero exit**,
so a collapsing mutation score can never fail the weekly job or block
anything. This is the same failure class as this session's own house
memory on gate exit-code masking. Phase K's mutation-testing work is
"remove `|| true` and gate on score," not "stand up Stryker."

### 11. CoachHelm eval coverage is one file, not a suite

`evals/` contains exactly one file: `evals/round-review.yaml` (`find evals
-type f`). `.circleci/config.yml:339-364` `promptfoo-evals` runs `npx
promptfoo eval` against it weekly and stores `evals/results/round-
review.json`. `docs/ai-system/GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md`
§26-29's `evals/coachhelm/{cases,rubrics,regression}` structure does not
exist. The promptfoo+CircleCI plumbing this needs is already proven, at one
file's worth of scale.

### 12. Golden paths already half-exist as Playwright specs

`e2e/*.spec.ts` includes `golf-critical-paths.spec.ts`, `golf-dashboard.spec.ts`,
`golf-qualifier.spec.ts`, `golf-round.spec.ts` (full listing via `find e2e
-iname "*.spec.ts"`) — these already cover most of the journey ids
`GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` §6-7 names as the seed golden-path
list (coach_login_dashboard, player_start_round, player_resume_round,
player_submit_round, etc.). `playwright.config.ts:8` confirms `testDir:
'./e2e'`. Phase D's golden-path registry should **reference** these specs
by name as evidence, not invent parallel journey definitions.

### 13. `/admin/traces` is a different Flight Recorder than Phase J's

`src/app/admin/traces/page.tsx:11-19` documents itself explicitly: it
renders one **golf round mutation's** execution tree (client → server
action → RPC → in-transaction checkpoints → verification → background
work), backed by `bridgeListFlightTraces`
(`src/app/admin/actions/golf-tracer.ts`). This is a **product** flight
recorder, not an **agent** flight recorder. Phase J's Agent Flight Recorder
(append-only `agent_run_id` records of what Claude did) is a genuinely
separate, currently nonexistent capability — do not conflate the two when
scoping Phase J, but do reuse the rendering pattern (containment-tree UI,
checkpoint-vs-never-ran distinction) since it is exactly the shape an agent
run trace needs.

### 14. Root-cause analysis is single-shot, self-scored, and this is the seam Phase J attaches to

`src/lib/admin/rca.ts:183-212` `runRcaAnalysis` makes **one**
`generateObject` call (`ai` SDK) and returns a structured `RcaAnalysis`
(`:24-31`) whose `confidence: 'high' | 'medium' | 'low'` is the model's own
self-report — there is no independent verifier, no adversarial check, no
explainable-components causal score. `docs/ai-system/selfheal/STATE-2026-08-28.md`
§5.2 documents a concrete failure mode of exactly this: three of five
"NEEDS MORE EVIDENCE" analyses had actually found the complete root cause
and named the fixing commit, but the single-pass model filed itself under
"not enough evidence" because the contract only permits "ALREADY FIXED"
after observing the error stop firing post-deploy — a **correct
uncertainty rule that a single non-adversarial pass could not apply
correctly to its own findings**. This is precisely the failure mode Phase
J's Verification Ensemble (§7 of `HELM_AUTONOMY_CONTROL_PLANE.md`) and
causal engine (§17) exist to fix.

### 15. This plan runs alongside two parallel sessions — read the handoff before sequencing Phase D or J work

`docs/ai-system/HANDOFF_BRIDGE_CONTROL_PLANE_2026-09-03.md` (committed to
this worktree at `12d3c48d5`, dated 2026-09-03, written by a concurrent
"Sentry max-out" session) is the authoritative ownership split — read it in
full before starting implementation, not just this summary. Three facts
from it change this plan's sequencing and are **not** independently
re-verified against the canonical checkout at `44f4ce183` in this pass,
because the work it describes is explicitly still landing on other
branches as of that commit — treat every claim below as sourced to that
document, not to a grep of `44f4ce183`:

- **Ownership split.** The handoff assigns this plan's own scope — Phases
  D-K — to "the Bridge session," with file ownership `src/lib/admin/**`
  (except `job-log.ts`, owned by the Sentry session), `src/app/admin/**`,
  and — this is the sequencing constraint — `src/lib/reliability/**`
  **only after PR #1777 merges** (per the handoff, open/auto-merge-armed
  as of 2026-09-03, touching Reliability-tab defects). Any Phase D item
  that edits `src/lib/reliability/**` (D.4.2's `error-budget.ts`, D.4.3's
  invariant collector arm) should confirm #1777 has actually merged before
  branching, not assume it based on this plan's own read of `44f4ce183`
  (which predates it).
- **Telemetry vocabulary to consume, not redefine.** The handoff names a
  structured metrics/spans vocabulary (`helm.workflow.*`, `helm.db.*`,
  `helm.job.*`, `helm.ai.*`, `helm.push.*`, `helm.auth.*`, plus span
  operations) being built in `src/lib/observability/metrics.ts` and
  `spans.ts` on the Sentry session's own branches. **Verified in this
  pass:** `src/lib/observability/metrics.ts` does not exist at the
  canonical `44f4ce183` (`git show 44f4ce183:src/lib/observability/
  metrics.ts` fails); `spans.ts` and `helm-flight-recorder.ts` do. So this
  vocabulary is real but not yet merged as of this plan's ground-truth
  commit — Phase D's SLIs and golden-path signals (D.4.2, D.4.4) should be
  written to consume these metric names once merged, not invent parallel
  ones, but their exact shape should be re-confirmed against whatever
  commit is current when that work actually starts.
- **A precedent this plan already uses, now double-sourced.** The handoff
  independently confirms `helm_debug.trace_runs/steps` as the golf-round
  Flight Recorder's storage — matching what this plan verified directly
  against `44f4ce183` in J.4.1 (`helm-flight-recorder.ts:109-123`,
  RPC-gated `helm_debug` schema). Two independent reads landing on the
  same schema is stronger evidence than either alone.
- **Coordinate column names before any migration.** The handoff states
  plainly: "The Bridge session's SLO/journey/invariant read models consume
  the Sentry metric names and the Supabase session's `db_error_events`/
  `db_health_samples` shapes; agree the column names in the plan doc
  before either writes a migration." Phase D's invariants (D.4.3) and any
  future performance-baseline work should read the Supabase session's
  `db_health_samples`/`db_error_events` for data-integrity and DB-health
  signals rather than building a parallel sampler — verify those tables'
  actual shape with that session before designing against them.
- **A naming collision worth flagging to whoever coordinates the three
  sessions, not something this plan can resolve alone:** this plan's own
  phase letters (D, E, F, G, J, K, from `HELM_AUTONOMY_CONTROL_PLANE.md`/
  `GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md`) are a different lettering
  scheme from the Sentry session's and the Supabase session's own internal
  phase letters (the Supabase brief is explicitly "Phases A-J" on a
  different subject). A teammate named e.g. `sentry-phase-d` is not
  necessarily working on this plan's Phase D.

---

## 1. EXISTS / MISSING ledger

Every row below is a direct `ls`/`find`/`grep` result against the checkout
at `44f4ce183`, not a claim taken from a doc.

| Path / capability | State | Evidence |
|---|---|---|
| `src/lib/reliability/{collect,sources,normalize,resolution,types}.ts` | **EXISTS**, live, 3h cron | `src/app/api/cron/reliability-triage/route.ts`; `vercel.json:112-115` |
| `memory/operations/release-queue.yml` | **EXISTS**, hand-populated, carrying real verified repair units | file header lines 8-15 |
| `config/release-policy.yml` | **EXISTS**, machine-readable | full file read |
| `config/control-plane-gaps.json` | **EXISTS**, live, house format for owner decisions | full file read |
| `config/open-pr-dispositions.json` | **EXISTS**, live, enforced by `control-plane:verify` | full file read |
| `config/branch-retention.json`, `mcp-connector-ids.json`, `tool-authority.json`, `control-plane-observations.json` | **EXIST** | `ls config/` |
| `config/change-risk.yml` | **MISSING** | not in `ls config/` |
| `config/feature-flags.yml` | **MISSING** | not in `ls config/` |
| `scripts/control-plane-verify.mjs` | **EXISTS**, live (`npm run control-plane:verify`; `wc -l` it for current size) | header read, lines 1-40 |
| `scripts/diagnostics-health.mjs` | **EXISTS**, live evidence-path probe | header read |
| `scripts/knowledge/*` | **EXISTS**, live (`npm run knowledge:*`; `find scripts/knowledge` for the current list) | `find scripts/knowledge` |
| `scripts/release/` | **MISSING** | `find` — no such directory |
| `scripts/operations/daily-health/` | **MISSING** | `find` — no such directory |
| `.claude/skills/golfhelm-daily-reliability/` | **MISSING** | `find` — no such directory |
| `docs/ai-system/selfheal/{README,triage-contract,repair-contract,STATE-2026-08-28}.md` | **EXIST**, live contracts read fresh each run | full read |
| `memory/features/admin-platform.md` | **EXISTS** | read |
| `memory/registry.yml` → `admin_platform` | **EXISTS**, one feature id for the whole Bridge | `memory/registry.yml:1161` |
| `memory/registry.yml` → `observability` / `reliability` top-level keys | **MISSING** | `grep -n "^  observability:\|^  reliability:"` — no match |
| `src/lib/admin/incidents/{types,correlate,lifecycle,proof,deploy-proof,repair-link,sources,truth-strip,attention,lens,reconciliation}.ts` | **EXIST**, live, exercised by `/admin/errors`, `/admin/self-heal` | grep of exports, all files listed |
| `src/lib/admin/feature-registry.ts` | **EXISTS**, tiered thresholds over the `FeatureKey` union | `:22-114`, `:168-171` |
| `src/lib/admin/sentry-api.ts` | **EXISTS** — issues, hourly stats, feature counts, release health. **No trace/span endpoint anywhere** | grep for `trace`/`span` in file — no match |
| `src/lib/admin/rca.ts` | **EXISTS**, single-shot LLM RCA, self-reported confidence | `:183-212` |
| `src/lib/admin/selfheal-{registry,flow,capability}.ts` | **EXIST**, live loop tracking, incl. a `proven/unproven/unknown` capability state | grep of exports, all files listed |
| `src/app/admin/{traces,deploys,health,utilization,work,reliability,self-heal,errors,errors/[fingerprint],jobs}/page.tsx` | **ALL EXIST** — every named Bridge surface in the brief is already a real route | `find src/app/admin -iname page.tsx` |
| `memory/graph/feature-dependencies.yml` | **MISSING** | `find` — not found |
| `memory/journeys/{golden-paths,outcome-contracts}.yml` | **MISSING** | `find` — not found |
| `memory/invariants/registry.yml` | **MISSING** | `find` — not found |
| `replay/` | **MISSING** | `find` — not found |
| `memory/scenarios/` | **MISSING** | `find` — not found |
| `memory/testing/flakes.yml` | **MISSING** | `find` — not found |
| `memory/baselines/{performance,cost}.yml` | **MISSING** | `find` — not found |
| `memory/analytics/event-contracts.yml` | **MISSING** | `find` — not found |
| Feature-flag module (`isFlagEnabled`/`featureFlag`) in `src/lib` | **MISSING** — zero production code | `grep -rln "featureFlag\|isFlagEnabled\|FEATURE_FLAG"` returns nothing |
| `evals/coachhelm/{cases,rubrics,regression}` | **MISSING** — only `evals/round-review.yaml` exists | `find evals -type f` |
| PostHog wiring | **EXISTS**, thin (pageviews + one demo event) | `src/components/providers/PostHogProvider.tsx`, `src/lib/analytics/posthog-server.ts` |
| `e2e/*.spec.ts` golden-path-shaped specs | **EXIST** (4+ directly relevant) | `find e2e -iname "*.spec.ts"` |
| Stryker mutation testing | **EXISTS**, weekly, scope correct, **exit code masked** | `.circleci/config.yml:123-155` |
| `admin_events`, `background_job_logs` tables | **EXIST**, real, actively written/read across `src/lib/reliability/**`, `src/lib/admin/**` | direct reads of `collect.ts`, `selfheal-registry.ts`, `README.md` |
| `release:status` npm script | **EXISTS** — drift detector, not the release-candidate builder | `package.json:106`, `scripts/release-status.mjs` |
| `release:prepare`/`release:check`/`release:budget`/`reliability:report` npm scripts | **MISSING** | `grep -n "\"release:\|\"reliability:" package.json` |

---

## 2. Phase D — SLO/Error Budget Center, Golden Path Health, Trace Funnels, Invariants, Silence Detection, Behavioral Signals

### D.1 Already designed

`GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` §6-9, §30-32 specify golden
paths (`memory/journeys/golden-paths.yml`), outcome contracts, executable
invariants (`memory/invariants/registry.yml`), and a PostHog-first
behavioral-anomaly approach ("FIRST audit current PostHog... no new
analytics platform"). `HELM_AUTONOMY_CONTROL_PLANE.md` §16 (Tool Chaos Lab)
specifies the "incomplete evidence ≠ zero errors" invariant this phase's
silence detection must honor.

### D.2 Already exists in code

- Per-feature amber/red thresholds + heartbeat staleness with intentional-
  quiet overrides: `src/lib/admin/feature-registry.ts:168-171`,
  `:143-149`, `:237-239`.
- Incident classification distinguishing real defects from expected/quiet
  states: `src/lib/admin/incident-classification.ts:46-59` (`IncidentClass`
  = `defect | degradation | integration | access | empty_state | telemetry
  | integrity_ok`), `:256` `classifyIncident`.
- Reconciled, blindness-aware health verdicts:
  `src/lib/admin/incidents/reconciliation.ts:44,68`;
  `src/lib/admin/incidents/sources.ts:147` `summarizeCoverage`, `:181`
  `canClaimAllClear` (never claims all-clear on a blind source).
- Deploy-freshness as a distinct silent-failure class: `src/lib/admin/
  deploy-freshness.ts:32-137` — the module exists *because* four Sentry
  issues in 2026-07-30 were already-fixed code nobody had deployed
  (`:5-19`), i.e. it already implements one instance of "incomplete
  evidence" reasoning the Tool Chaos Lab asks for.
- **A live, working executable-invariant, for exactly one feature today:**
  `src/lib/admin/qualifier-invariants.ts` turns the prose business rules
  in `memory/features/qualifiers.md` into queries over live rows
  (`QualifierInvariantSeverity = 'critical' | 'warning'`, file header)
  because a documented-but-unchecked rule already shipped as a bug
  (`INC-2026-08-22-end-date-closed-qualifier-early`, cited in the file's
  own header). It deliberately keeps the check pure (`evaluateQualifierInvariants`)
  separate from the I/O (`src/lib/admin/data/qualifier-logic.ts`), rendered
  on `/admin/qualifiers`. This is the template `memory/invariants/registry.yml`
  should generalize — not a new pattern to invent. See D.4.3.
- Golden-path-shaped E2E coverage: `e2e/golf-critical-paths.spec.ts`,
  `golf-dashboard.spec.ts`, `golf-qualifier.spec.ts`, `golf-round.spec.ts`.
- PostHog capture path proven end to end (client + server), just thinly
  used: `src/components/providers/PostHogProvider.tsx`,
  `src/lib/analytics/posthog-server.ts:61`.

### D.3 Gap

- No rolling-window burn-rate/error-budget math — `TIER_THRESHOLDS` is a
  static count-per-window, not an SLO with a consumable budget.
- No golden-path *registry* (id → feature_ids → criticality → environment
  strategy) — only ad hoc Playwright specs with no id/criticality metadata
  and no link back to `feature-registry.ts`.
- No executable data invariants at all (`memory/invariants/` missing).
- No behavioral event contracts (`memory/analytics/event-contracts.yml`
  missing) and near-zero product events to build silence detection on top
  of.
- `sentry-api.ts` cannot answer "what changed in the funnel," only issue
  counts.

### D.4 Smallest coherent implementation

1. **Golden-path registry as a thin index over existing specs, not a new
   source of truth.** Add `memory/journeys/golden-paths.yml`: `id`,
   `feature_ids` (cross-checked against `feature-registry.ts`'s
   `FeatureKey`), `criticality`, `spec_path` (pointing at the existing
   `e2e/*.spec.ts` file), `environment_strategy` per
   `GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` §6. A `scripts/knowledge/`-
   style check (`npm run journeys:check`) fails if a listed `spec_path`
   does not exist or a `feature_id` is not in `FEATURE_REGISTRY`. Seed only
   the journeys with a real spec today; mark the rest `baseline_status:
   collecting` rather than inventing coverage.
2. **Error budget as a derived view over `background_job_logs.reliability-
   snapshot` rows, not a new table.** Add
   `src/lib/reliability/error-budget.ts`: read the last N
   `reliability-snapshot` rows (already written every 3h by
   `runReliabilityCollection`), compute a rolling burn rate per
   `feature_id` against a budget derived from `TIER_THRESHOLDS`
   (`feature-registry.ts:168-171`) rather than inventing a second
   threshold source. Output feeds a new panel on `/admin/reliability`
   (`src/app/admin/reliability/page.tsx` already renders
   `ReliabilityRunRow`/`fetchReliabilitySnapshot` — extend that data layer,
   `src/lib/admin/data/reliability.ts:71`, rather than adding a parallel
   fetch path).
3. **Invariants as bounded, read-only SQL checks reusing the collector's
   own scheduling, in `qualifier-invariants.ts`'s existing shape.** Add
   `memory/invariants/registry.yml` (id, feature_id, severity, `check:
   {type: sql_read_only, script}`) and `scripts/invariants/*.mjs` — each
   script mirrors `qualifier-invariants.ts`'s split (a pure `evaluate*`
   function scoring severity, separate from the row-fetching I/O), not a
   new authoring style. Invoke from a **new arm** inside
   `runReliabilityCollection`'s `Promise.allSettled` fan-out
   (`src/lib/reliability/collect.ts:82-90`) rather than a separate cron —
   this reuses the fault-isolation, the window, and the single
   `background_job_logs` write the collector already guarantees. Seed with
   a small number of invariants tied to real past incidents in
   `memory/incidents/**` (today spanning `golf_round_lifecycle`,
   `admin_platform`, `qualifiers`, `shot_tracking` — size the corpus with
   `find memory/incidents -iname "INC-*.md"` before committing to a count),
   per the base spec's own backfill rule ("could a deterministic invariant
   have caught this?").
4. **Behavioral signals: instrument existing golden paths with
   `captureServer`/`posthog.capture`, do not add a platform.** For the 4
   golden paths seeded in step 1, add one `started`/`completed` event pair
   each at the existing server-action boundaries, following the exact
   pattern already proven at `src/app/golf/actions/auth.ts:186`. Add
   `memory/analytics/event-contracts.yml` documenting allowed/prohibited
   properties per `GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` §30-32
   *before* writing the events, not after.

### D.5 Tests

`error-budget.test.ts` (pure function over synthetic snapshot rows —
follow the existing `src/lib/reliability/__tests__/` pattern), an invariant
runner test per check (assert it is read-only/bounded — grep the SQL for
`SELECT` only, ban `UPDATE|DELETE|INSERT`), `journeys:check` script test
(missing spec_path fails), event-contract lint test (an emitted property
not in the contract fails CI, mirroring how `lint-ratchet` already gates
this repo).

### D.6 Bridge surface

`/admin/reliability` (extend existing page), a new `/admin/reliability`
"Golden Paths" and "Invariants" sub-panel using the existing
`PanelBoundary`/`AutoRefresh` component pattern already used by every
admin page read.

### D.7 Risks

Invariant checks running inside the collector's 8-second-class wall-clock
budget (`src/lib/admin/sentry-api.ts:33` `MAX_WALL_CLOCK_MS` shows this repo
already treats collector latency as a hard constraint) — a slow invariant
query could starve the Sentry/Vercel/Supabase arms. Mitigate with a
per-invariant timeout and treat a timed-out invariant as `unknown`, never
`pass`. New behavioral events risk violating the "no sensitive content in
analytics" rule (§30-32) — every new event needs the allow-list review that
rule specifies before merge.

---

## 3. Phase E — Helm World Model + Blast-Radius/Dependency Graph

### E.1 Already designed

`HELM_AUTONOMY_CONTROL_PLANE.md` §2; `GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md`
§4-5 (`memory/graph/feature-dependencies.yml`, generate from
`registry.yml`/`feature-registry.ts`/imports/DB calls, "not automatically a
product dependency graph — use explicit verified edges").

### E.2 Already exists in code

- `memory/registry.yml` is a real per-feature ownership map (routes,
  components, api, actions, services, db, tests) for every mapped feature —
  `admin_platform` read in full at `memory/registry.yml:1161-1232` is
  representative of the shape every other entry uses.
- `src/lib/admin/feature-registry.ts` is a second, code-level registry
  (86 `FeatureKey`s, tiers, heartbeat tables) that **already disagrees with
  `registry.yml` for 4 shared-spelling ids**, per
  `memory/system/golfhelm-engineering-os.md`'s "Feature routing" section
  ("Verified 2026-08-21: it already has, for all 4 ids that currently share
  a spelling"). `npm run knowledge:registry-check` is not merely
  specified — `scripts/knowledge/check-feature-registry.ts` is live and
  wired into the `knowledge:check` orchestrator (`scripts/knowledge/
  check.mjs:72`) — but its cross-check completeness against
  `feature-registry.ts` was not independently re-verified in this pass —
  treat as **UNKNOWN** whether it
  currently covers all divergence, not just the 4 named ids.
- `scripts/knowledge/map-changed-files.mjs`, `generate-context-pack.mjs`,
  `gen-feature-map.ts` already do file→feature resolution and
  context-pack assembly — the retrieval half of the world model already
  exists as a live command (`npm run knowledge:map`, `knowledge:context`).
- `src/app/admin/deploys/page.tsx` + `src/lib/admin/deploy-freshness.ts` +
  `src/lib/admin/github-pr-timeline.ts:218` `fetchWorkLog` already give a
  SHA-anchored view of what shipped and what production is running — the
  "common release identity" `HELM_AUTONOMY_CONTROL_PLANE.md` §11 asks for.

### E.3 Gap

No dependency **graph** — only ownership maps. Nothing encodes
`round_tracking → stats_analytics → coachhelm_ai_engine` style downstream
edges, and nothing computes blast radius from a file diff. No evidence
model on edges (source path / runtime trace / test / commit history) at
all, because there are no edges yet. The single-`feature_id`-per-surface
problem (§0.8 above) means even a naive import-graph pass would attribute
almost everything in `src/lib/admin/**` to one node.

### E.4 Smallest coherent implementation

1. **Generate, do not hand-author.** `scripts/knowledge/gen-graph.ts`:
   start from `memory/registry.yml`'s existing `db.tables`/`code.services`
   lists (already present per-feature, e.g. `admin_platform`'s
   `db: [supabase/migrations/*admin*.sql, ...]`,
   `memory/registry.yml:1211-1213`) and cross-reference table names that
   two features both read/write (shared `heartbeatTable` values in
   `feature-registry.ts` are a free signal: two `FeatureDef`s sharing a
   table is a candidate edge) plus explicit RPC/action call graphs via a
   TypeScript import walk scoped to `src/app/*/actions/**` and
   `src/lib/*/**`. Every edge carries `evidence: {kind: shared_table |
   import | rpc_call | test_reference, path}` — never an unattributed edge,
   per the spec's own "not automatically a product dependency graph" rule.
2. **`npm run graph:impact -- --files <paths>`** resolves changed files →
   feature_ids (reuse `map-changed-files.mjs`'s existing resolution) →
   downstream edges → a blast-radius summary, appended to
   `generate-context-pack.mjs`'s output (`/tmp/helmv3-context-pack.md`)
   rather than a new pack format.
3. **Fix the registry-granularity problem before generalizing.** Split
   `admin_platform` in `memory/registry.yml` into sub-capabilities that
   match this program's own phase boundaries (e.g. `admin_incidents`,
   `admin_reliability_collector`, `admin_selfheal`) so blast-radius edges
   into and out of the control plane itself are meaningful. This is
   necessary *before* Phase E's graph is useful for anything touching its
   own subject matter — flagged as an OWNER DECISION in §12 because
   splitting a canonical registry entry is a real judgment call, not a
   mechanical change.

### E.5 Tests

`graph:check` — every edge resolves to two real feature_ids and has
non-empty evidence (fails CI on an orphan or unattributed edge, matching
the doctor-check naming convention `FEATURE_GRAPH_NO_ORPHANS` the extension
spec already names). A fixed historical diff (e.g. the PR that touched
`round_tracking` and is known to have required `stats_analytics`
verification) must produce that edge in `graph:impact` output — a golden
test, not a snapshot test.

### E.6 Bridge surface

New `/admin/health` sub-panel ("Blast Radius") or a `graph:impact` CLI
output embedded in PR context packs — no new top-level admin route needed
(`/admin/health` already exists and already aggregates feature status,
`src/app/admin/health/page.tsx`).

### E.7 Risks

An import-graph pass over-generates edges (the spec's own warning: "an
import graph is NOT automatically a product dependency graph"). Mitigate
by requiring at least one non-import evidence kind (shared table, RPC, or
test reference) before an edge is emitted from the generator by default;
import-only edges land in a separate `unverified_edges` list a human
reviews before promotion.

---

## 4. Phase F — Release Intelligence: Change-Risk Scoring, Flags, Canary, Rollback

### F.1 Already designed

`GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` §12-18 (risk scoring, feature
flags, canary, rollback recommendation with KEEP/WATCH/PAUSE_ROLLOUT/
ROLLBACK_RECOMMENDED/UNKNOWN verdicts, never auto-executing).

### F.2 Already exists in code

- `config/release-policy.yml` — real, machine-readable 2/week ceiling and
  daily-reliability permission flags, already the kind of policy file this
  phase's flag/canary governance should sit beside.
- `memory/operations/release-queue.yml` — real schema (`status`, `risk:
  R0-R3`, `sha`, `regression_tests`) already carrying two verified repair
  units.
- `release:status` (`scripts/release-status.mjs`) — proven SHA-in-bytes
  drift detection, the mechanical building block a canary comparator needs
  to know "what is actually being served."
- `src/lib/reliability/types.ts:46` `RiskTier = 'R0' | 'R1' | 'R2' | 'R3'`
  already exists as a type in the reliability module, reusable as-is for a
  risk-scoring output field instead of inventing a parallel enum.
- `src/lib/admin/deploy-freshness.ts` already computes "commits behind" and
  "hours since deploy" — half of what a canary comparator needs to decide
  candidate vs. baseline.

### F.3 Gap

Zero feature-flag infrastructure anywhere in `src/lib` (confirmed by grep —
not "underused," genuinely absent). No `config/change-risk.yml` or
risk-scoring script. No canary/rollback-recommendation script. Nothing
computes a deterministic risk score from a diff today.

### F.4 Smallest coherent implementation

1. **Change-risk scoring as a pure function over already-available
   inputs.** `scripts/risk/score-change.mjs` (`npm run risk:score --
   --files|--diff`): feature criticality (`memory/registry.yml`'s
   `criticality` field, already present per-feature — see `admin_platform`,
   `memory/registry.yml:1165`), impacted-feature count (from Phase E's
   `graph:impact`, once it exists — sequence this after E), auth/RLS/
   migration/destructive-write involvement (grep the diff for
   `supabase/migrations/**`, `.auth.getUser()` removal, `DELETE FROM`),
   historical incident density (`memory/incidents/<feature>/` file count —
   real today across `golf_round_lifecycle`/`admin_platform`/`qualifiers`/
   `shot_tracking` — `find memory/incidents -iname "INC-*.md"` for the
   current count), test-coverage confidence (diff
   coverage against `src/**/__tests__/**`). Output an itemized-reasons
   object, reusing `RiskTier` from `src/lib/reliability/types.ts:46`, not
   a new enum.
2. **Feature flags as a config file + a thin reader, matching this repo's
   existing "config file is the source of truth, code reads it" pattern**
   (`config/release-policy.yml` is the precedent). New
   `config/feature-flags.yml` (feature_id, owner, type, status,
   `expires_at`) + `src/lib/flags/read-flag.ts` (server-only, fails closed
   to `default`). `npm run flags:check` (CI) fails on an expired flag —
   same shape as `knowledge:globs`/`preflight`'s existing fail-closed
   static checks (`package.json:64`). This is genuinely new code — nothing
   to extend — but small and low-risk by construction (a config reader with
   no write path).
3. **Rollback recommendation as read-only, non-executing, reusing
   `release:status`'s SHA-detection.** `scripts/release/evaluate-
   rollback.mjs`: compare the last N `reliability-snapshot` rows for the
   candidate SHA window against the prior baseline window, output
   `KEEP|WATCH|PAUSE_ROLLOUT|ROLLBACK_RECOMMENDED|UNKNOWN` with itemized
   evidence. It never calls a deploy/rollback API — matches this repo's
   `release-policy.yml` (`emergency.automatic_override: false`).
4. **Canary is explicitly out of scope for a first cut.** This app has no
   existing percentage-based rollout mechanism (Vercel deploys are
   all-or-nothing per `git.deploymentEnabled` behavior noted in the user's
   own memory), so §16-18's "5%→25%→100%" staged rollout requires either a
   Vercel-native canary feature or an in-app cohort flag — genuinely new
   infrastructure. Recommend deferring canary until flags (step 2) exist
   and can gate a cohort; do not build a bespoke traffic-splitting layer.

### F.5 Tests

`score-change.test.ts` — fixed synthetic diffs produce expected tier +
reasons (a migration-touching diff must always score at least R2). `flags:
check` test — an `expires_at` in the past fails; a flag disabling
`auth_onboarding` or any RLS-adjacent feature fails a static "never gate
auth" rule mirroring `GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` §14's
"never auth, data-corruption concealment... RLS" list. `evaluate-
rollback.test.ts` — synthetic before/after snapshot rows produce each of
the five verdicts.

### F.6 Bridge surface

`/admin/deploys` (already renders `ReleaseLedger`,
`src/app/admin/deploys/_components/ReleaseLedger.tsx` referenced from
`src/app/admin/deploys/page.tsx:16`) gains a risk-score column per pending
release-queue item and a rollback-recommendation banner.

### F.7 Risks

A risk score that is wrong in the *low* direction is dangerous (under-
verifies a real R3 change); wrong in the *high* direction is merely
annoying. Bias the scorer's unknown-input handling toward the higher tier,
matching this repo's own `canClaimAllClear` philosophy
(`src/lib/admin/incidents/sources.ts:181` — a blind input never yields the
optimistic verdict). Feature flags with no kill-switch discipline become a
second config surface that drifts from code — mandate the `flags:check`
expiry gate from day one, not as a follow-up.

---

## 5. Phase G — Incident Replay Lab + Helm Twin + Shadow Execution

### G.1 Already designed

`HELM_AUTONOMY_CONTROL_PLANE.md` §3, §12;
`GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` §10-11 (`replay/` directory,
sanitized fixtures, manifests, runners, fail-pre-fix/pass-post-fix proof).

### G.2 Already exists — and this is the strongest continuity finding in the whole plan

`docs/ai-system/selfheal/STATE-2026-08-28.md` §5.2, written by a prior
session measuring the live Diagnose stage, contains this sentence verbatim:
"A **reproduction** step — a stage that triggers the failing path. This is
the real answer to 'reproduce the error, then write the analysis.'" That is
not this plan's idea; it is the existing system's own recommended next
step, dated 2026-08-28. Separately, `docs/ai-system/selfheal/repair-
contract.md` already has a "STEP 3 — worktree, then reproduce, then fix"
section — the Repair stage already does **ad hoc**, per-run reproduction in
a disposable worktree, just with no fixture library, no manifest format,
and no reusable proof artifact.

### G.3 Gap

No `replay/` directory, no fixture format, no manifest linking a fixture to
an incident. The Repair contract's reproduction is real but throwaway —
nothing is captured for reuse or regression. Zero shadow/counterfactual
execution exists anywhere (no dual-path comparator).

Adjacent prior art worth checking before writing a new manifest format:
`tests/golf/qualifier-hell/*.test.yaml` (`find tests/golf/qualifier-hell
-iname "*.test.yaml"` for the current list; `fileType: momentic/test/v2`
per e.g. `05-round-four-chaos.test.yaml:1`) are natural-language scripts for
a third-party AI-driven QA tool (Momentic — evidenced by the `.momentic-mcp/`
artifact directory alongside them, holding screenshots/video/page-state per
run), not a fixture-based replay format — no `incident_id`, no bad-version/
fixed-version pairing, no sanitized data snapshot. But they already exercise
exactly the failure classes §10-11 prioritizes (offline/online toggling,
dual-tab race conditions, checkpoint durability under connectivity loss —
`05-round-four-chaos.test.yaml` alone scripts three of these). Treat as
existing **scenario coverage** to reference from `memory/scenarios/`, not
infrastructure to build the replay lab on — it runs against a real QA
environment via a paid third-party tool, not an isolated worktree/fixture,
so it cannot satisfy the replay lab's "isolated, reproducible" requirement
directly.

### G.4 Smallest coherent implementation

1. **Formalize what Repair already does, do not build a parallel
   mechanism.** Add `replay/README.md`, `replay/fixtures/<feature>/`,
   `replay/manifests/`. Change `docs/ai-system/selfheal/repair-
   contract.md` STEP 3 to write its reproduction as a fixture + manifest
   (`replay_id`, `incident_id`, `feature_id`, `expected: {bad_version:
   fail, fixed_version: pass}`) as a **required output** of a successful
   repair run, not a separate build. This turns every future Repair run
   into replay-lab growth for free.
2. **Backfill a small number of replays from `memory/incidents/**`** (today
   spanning `golf_round_lifecycle`, `admin_platform`, `qualifiers`,
   `shot_tracking` — size the corpus with `find memory/incidents -iname
   "INC-*.md"` before committing to a number) as the "3 historical replays"
   completion criterion in
   `GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` §47 Phase C names, sized to
   what actually exists rather than an invented count.
3. **A runner script**, `replay/runners/run.mjs`, that checks out the
   `bad_version` SHA in an isolated worktree (this repo already has a
   sanctioned worktree tool, `scripts/new-worktree.sh`, per `AGENTS.md`'s
   "Helm agent canonicality" section — reuse it, do not invent a second
   worktree mechanism), applies the fixture, runs the linked test, and
   asserts fail→pass across bad/fixed SHAs.
4. **Shadow execution is a Phase-2 item, not part of this cut.** It
   requires side-effect sinks (email/push/webhook stubs) that do not exist
   anywhere in this codebase today — a genuinely large build (equivalent
   in scope to a test-double layer for every external integration listed
   in `memory/registry.yml`'s `integrations` field). Recommend explicitly
   deferring until the replay lab has real fixture coverage to shadow
   against.

### G.5 Tests

The replay runner's own fail-then-pass assertion *is* the test for each
fixture. A meta-test (`replay-manifest-schema.test.ts`) validates every
manifest against the schema so a malformed fixture fails CI rather than
silently not running.

### G.6 Bridge surface

`/admin/self-heal` gains a "Replay coverage" chip per incident row (reusing
`SelfHealCircuit`'s existing per-stage rendering pattern,
`src/app/admin/self-heal/_components/SelfHealCircuit.tsx`).

### G.7 Risks

Fixtures containing sanitized-but-still-identifying production data — the
spec's own warning (§10-11: "never raw profiles, emails, tokens... private
messages, raw logs") is the binding constraint; every fixture needs an
explicit sanitization review step before it lands, not an assumed-safe
default.

---

## 6. Phase J — Agent Flight Recorder, Verification Ensemble, Causal Engine, Earned Autonomy, Decision Inbox, Incident Similarity

### J.1 Already designed

`HELM_AUTONOMY_CONTROL_PLANE.md` §4 (Flight Recorder), §7 (Verification
Ensemble: REPRODUCER→HEALER→{TEST ADVERSARY, SECURITY, PRODUCT}→JUDGE),
§13 (Earned Autonomy), §17 (causal engine), §20 (Decision Inbox).

### J.2 Already exists in code

- The three-stage self-healing loop (§0.2 above) **is** a live,
  single-role Reproducer→Healer pipeline today: Diagnose reproduces/
  classifies, Repair heals. There is no adversarial, security, or product
  verifier role — Diagnose's own single LLM call is judge and jury.
- `src/lib/admin/selfheal-capability.ts:42-69` already has a `proven |
  unproven | unknown` capability state per stage and a `summarizeLoopVerdict`
  function (`:211`) — a real, if binary, precursor to Earned Autonomy's
  trust levels.
- `src/lib/admin/rca.ts` is the exact seam a verification ensemble attaches
  to: today it is one `generateObject` call; the Verification Ensemble
  turns it into a pipeline of calls with distinct system prompts and a
  final synthesizing JUDGE call that (per spec) never writes code.
- `/admin/traces` (`src/app/admin/traces/page.tsx`) already renders an
  append-only, checkpoint-aware execution record — for golf rounds, not
  agent runs, but the exact UI shape (containment tree, "never ran" shown
  explicitly rather than omitted) is the reusable pattern for the Agent
  Flight Recorder's own render surface.
- `memory/incidents/**` (`find memory/incidents -iname "INC-*.md"` for the
  current count) is real historical-incident memory — the seed corpus for
  "historical incident similarity," at real but small scale.
- **A live, working proto-Decision-Inbox already exists and already
  learned the "don't build a second one" lesson.** `src/lib/admin/
  incidents/attention.ts` — `AttentionReason` (`:72-83`), `AttentionRow`
  (`:85-96`), `ATTENTION_PRIORITY` (`:156-167`, an explicit rank order:
  regression → critical → stage-dead → repair-ci-failed → stage-stalled →
  repairable-untouched → needs-evidence → platform-attention →
  proof-overdue → platform-watch → source-blind), `selectAttention` (`:618`)
  — renders today as `AttentionQueue` on the Bridge **home page**
  (`src/app/admin/page.tsx`, not `/admin/self-heal`). Its own header states
  it replaced two competing "needs your eyes" lists an operator had to
  reconcile by eye — i.e. this file's own history is a direct precedent
  against building a second Decision Inbox. See the rewritten J.4.5.
- `src/lib/admin/incidents/proof.ts` `deriveProof`/`deriveProofGaps`
  (`:309`, `:340`) plus `PROOF_MILESTONES` (`src/lib/admin/incidents/
  types.ts:350-358`, a 6-stage checklist: observed → analyzed → reproduced
  → ci-proven → deployed → production-verified) is the closest existing
  analog to Phase J's per-agent-run "verification" record — reuse this
  vocabulary for the Flight Recorder's `verification` field rather than
  inventing a new stage list.
- `docs/ai-system/selfheal/STATE-2026-08-28.md` §5.2's mislabeled "NEEDS
  MORE EVIDENCE" cases are a documented, dated case study of exactly the
  causal-confidence miscalibration §17 exists to fix — worth citing
  directly in any pilot write-up as ground truth for "does the causal
  engine do better than the single-shot RCA did."

### J.3 Gap

No append-only Agent Flight Recorder for Claude runs (distinct from the
golf-round one). No verification-ensemble roles beyond the single Diagnose
call. No explainable-components causal-confidence score — `rca.ts`'s
`confidence` field is model self-report, not computed. No Decision Inbox —
today, everything Diagnose/Repair produce surfaces on `/admin/self-heal`
and `/admin/errors` at equal visual weight; nothing filters to "only what
the owner actually needs to decide."

### J.4 Smallest coherent implementation

1. **Agent Flight Recorder as a new, narrow table-backed record — this is
   the one place in this plan where a new table is likely unavoidable, and
   this repo already has the right shape of precedent for it.**
   `background_job_logs` (`src/lib/reliability/collect.ts:1-23`) is one
   no-new-table precedent, but it is scoped to cron-style job runs with a
   `metadata jsonb` column — bloating it with `hypotheses[]`/
   `context_selected[]`/`verification{}` misfits its design. The closer
   precedent is the golf-round Flight Recorder's own storage: a private
   `helm_debug` schema, reachable only through service-role RPCs
   (`src/lib/observability/helm-flight-recorder.ts:109-123` —
   `helm_debug_start_trace`/`helm_debug_record_trace_step`/
   `helm_debug_finalize_trace`), which already proves this repo will build
   a dedicated, structured, append-only run-record schema when a job-log
   blob genuinely doesn't fit. **Marked OWNER DECISION in §12** — the real
   choice is not "jsonb blob vs. new table," it is which of the two
   existing append-only-record patterns to extend: a parallel table in the
   `helm_debug` schema (reusing its RPC-gated write path) is the
   architecturally closer fit; the `background_job_logs` metadata-jsonb
   route stays available as the lower-effort fallback if the owner prefers
   to defer a schema addition.
2. **Verification Ensemble as sequential model calls around the existing
   `runRcaAnalysis`, not a new orchestration framework.** Extend
   `src/lib/admin/rca.ts`: after the existing single call, add a second
   `generateObject` call with an adversarial system prompt ("find what is
   wrong with this analysis"), and for any finding touching
   auth/RLS/tenancy (detectable via the same grep patterns Phase F's risk
   scorer uses), a security-focused third call. A final JUDGE call
   synthesizes ACCEPT/REJECT with reasons and — per spec — never emits a
   `suggestedFix` itself, only a verdict on the HEALER's. This reuses
   `resolveModelProvider` (`src/lib/admin/rca.ts:19`) as-is; for the
   adversary role, consider a different model per
   `HELM_AUTONOMY_CONTROL_PLANE.md` §7's "different model/provider... to
   reduce correlated blind spots" — an OWNER DECISION (cost + provider
   choice).
3. **Causal confidence as explainable components, computed, not self-
   reported.** New `src/lib/admin/causal-score.ts`: temporal overlap
   (incident first-seen vs. commit timestamp — data already present in
   `IncidentAnalysis`/`github-pr-timeline.ts`), stack-overlap
   (fingerprint text match), changed-feature overlap (Phase E's graph, once
   it exists), historical-mechanism match (grep `memory/incidents/**` for
   the same root-cause class). Score components independently; only the
   sum crosses into "LIKELY CAUSE, confidence 0.86" language — never
   "CAUSE" until a replay (Phase G) actually reproduces it.
4. **Earned Autonomy as an extension of `selfheal-capability.ts`'s existing
   three-state model**, not a new trust system: add `feature_id ×
   repair_class` granularity to `CapabilityState`
   (`src/lib/admin/selfheal-capability.ts:42`), computed from the
   real recurrence/rollback signal already available in
   `memory/operations/release-queue.yml` (a `status: verification_failed`
   or a re-opened incident against the same `feature_id`+root-cause is a
   real demotion signal today, just not wired to anything).
5. **Decision Inbox: extend `attention.ts`, do not build a second list.**
   This is the one item in this plan where the "smallest coherent
   implementation" is almost entirely inside a single existing file. Add
   new `AttentionReason` variants to `src/lib/admin/incidents/attention.ts`
   (`:72-83`) — e.g. `r3-decision`, `verifier-disagreement`,
   `rollback-recommended`, `security-sensitive`, `autonomy-policy-
   expansion` — each with a `deriveXRow` function following the existing
   `deriveIncidentRow`/`deriveStageRow` pattern (`:364`, `:539`), insert
   them into `ATTENTION_PRIORITY` (`:156-167`) at the rank the owner wants,
   and feed `selectAttention` (`:618`) new source data (R3 items from
   `memory/registry.yml`/`release-policy.yml`'s risk vocabulary, verifier
   ACCEPT/REJECT disagreements once J.4.2 exists, rollback verdicts from
   Phase F). It renders automatically on the existing `AttentionQueue`
   component on the Bridge home page (`src/app/admin/page.tsx`) — no new
   panel, no new page. This is a direct application of this file's own
   documented lesson (two competing attention lists was a measured bug).

### J.5 Tests

Verification-ensemble golden cases: replay the 2026-08-27 vocabulary-drift
incident (`docs/ai-system/selfheal/README.md`'s own "10 of 15 analyses
opened with free prose" measurement) as a fixture — the ensemble must
catch a `suggestedFix` that doesn't match `RCA_CANONICAL_PREFIX` before it
reaches Repair. Causal-score component tests (each component pure,
independently testable). Autonomy-demotion test: a simulated recurrence
must lower the stored trust level and never require a human to notice.

### J.6 Bridge surface

`/admin/self-heal` (extend `SelfHealCircuit` with verifier-role chips and a
confidence breakdown) for the ensemble/causal-score work; the Decision
Inbox itself needs no new surface — it renders through the existing
`AttentionQueue` on the Bridge home page (`/admin`, `src/app/admin/page.tsx`),
per the rewritten J.4.5.

### J.7 Risks

Multiple sequential model calls multiply cost and latency on every
Diagnose run (currently one call, 09:17 UTC daily) — needs an explicit
budget decision (OWNER DECISION, §12). A JUDGE role that can be prompted
into rubber-stamping defeats the entire point; the adversary/security roles
must be structurally incapable of being skipped for any R2+ finding, not
merely instructed not to be skipped.

---

## 7. Phase K — Engineering OS Intelligence

### K.1 Already designed

`HELM_AUTONOMY_CONTROL_PLANE.md` §5 (Context Retrieval Bench), §6 (Active
Contract Compiler), §8-10 (mutation/metamorphic/proof islands), §16 (Tool
Chaos Lab), §18 (Janitor), §19 (OS self-improvement/learning metrics).

### K.2 Already exists in code

- `npm run knowledge:map` / `knowledge:context` / `knowledge:check` are
  live retrieval commands — the substrate a Context Retrieval Bench
  measures, not something the bench needs to build first.
- Mutation testing exists, correctly scoped
  (`src/lib/coachhelm/v2/**/*.ts`), weekly, in CircleCI
  (`.circleci/config.yml:123-155`) — **but gated by nothing**
  (`|| true` at line 152).
- `evals/round-review.yaml` + `promptfoo-evals` CircleCI job prove the
  eval-authoring and CI-wiring pattern at one-file scale.
- `scripts/diagnostics-health.mjs` **is** a Tool Chaos Lab primitive
  already: it probes "which evidence path actually works, right now"
  across Vercel/Sentry/GitHub connectors and treats a non-working path as
  a hard fact, not an assumption — exactly the "does Claude say UNKNOWN"
  test §16 asks for, just scoped to connector health rather than
  fault-injected tool responses.
- `config/control-plane-gaps.json`'s ACKNOWLEDGED_GAP mechanism
  (`id`/`owner`/`opened`/`scope`/`reason`/`closes_when`, printed on every
  `control-plane:verify` run) is a working, live implementation of "make
  gaps visible and unfadeable" — directly reusable as the janitor's
  finding format.
- `scripts/control-plane-verify.mjs` already implements the
  UNKNOWN-never-becomes-PASS discipline §16 and §19 both ask for at the
  meta level (verifying the control plane's own controls).

### K.3 Gap

No Context Retrieval Bench (frozen historical task set + gold-file recall
metrics) — `knowledge:map`/`knowledge:context` exist but are never scored
against ground truth. No Active Contract Compiler
(`contract:resolve -- --feature <id>`) — `memory/features/*.md` exist as
prose, not as a compiled-from-verified-truth output. No metamorphic tests,
no proof islands. No engineering janitor automation (the gaps file is
hand-written, not generated by a scan). No OS-version regression benchmark.
The mutation gate's exit code is masked (§0.10).

### K.4 Smallest coherent implementation

1. **Fix the mutation gate before building anything new in this phase.**
   Remove `|| true` from `.circleci/config.yml:152`; read Stryker's own
   mutation-score threshold config (`stryker.conf.json`'s inline heredoc,
   `.circleci/config.yml:139-150`) and fail the job below a floor. This is
   a one-line-scope, immediately load-bearing fix that every other Phase K
   item benefits from — sequence it first.
2. **Context Retrieval Bench as a harness around the existing commands.**
   `scripts/knowledge/bench.mjs`: a frozen set of historical tasks (start
   from the real `memory/incidents/**` entries (`find memory/incidents
   -iname "INC-*.md"` for the current count) — each incident already names
   its `feature_id` and touched files, which *is* the gold set),
   run `knowledge:map`/`knowledge:context` against each, score
   Recall@5/gold-file recall. Do not invent synthetic tasks when real
   incident history already provides a small, honest gold set.
3. **Active Contract Compiler as a formatter over existing sources, not a
   new truth store.** `npm run contract:resolve -- --feature <id>`:
   read `memory/features/<id>.md` + `memory/ledgers/changes/<id>.md`
   (already real and populated, e.g. `memory/ledgers/changes/admin_platform.md`)
   + `memory/decisions/ADR-*.md` (real ADRs already exist —
   `find memory/decisions -iname "ADR-*.md"` for the current count) and emit
   "current semantics" vs. "superseded claims, with what superseded them
   and when" by diffing ledger entries chronologically. This is
   read-only synthesis over data that already exists in the exact shape
   needed.
4. **Metamorphic tests and proof islands are pilot-scoped to CoachHelm**,
   matching the mutation-testing pilot already in place
   (`src/lib/coachhelm/v2/**`) — add metamorphic properties (reorder
   evidence → conclusions consistent) as additional Stryker/Vitest cases
   in the same directory, reusing the CI job rather than a new one.
5. **Janitor as a generator for `config/control-plane-gaps.json`'s existing
   format, not a new report shape.** A weekly script scanning for
   duplicate helpers/dead flags/stale docs, emitting entries in the
   already-live `id`/`owner`/`opened`/`scope`/`reason`/`closes_when` shape
   — this repo already has the exact review workflow (owner reviews,
   entries print on every verify run) this needs; it just needs a
   generator instead of hand-writing.

### K.5 Tests

Bench-regression test: a known-good `knowledge:context` run for a fixed
task must not regress recall below a floor. Contract-compiler golden test:
a feature with one known superseded claim in its ledger must surface it.
Mutation-gate test: CI fails when Stryker's own summary reports mutation
score under threshold (verify by injecting a synthetic Stryker JSON output
with a low score into the fixed job logic).

### K.6 Bridge surface

None required for K.1-K.3 (developer-facing CLI tooling); the janitor's
output surfaces on `/admin/health` or wherever
`control-plane-gaps.json`-shaped findings already render (check whether
`/admin/health` or a doctor-report page renders this file today — not
confirmed in this pass, **UNKNOWN**, verify before building a new panel).

### K.7 Risks

A Context Retrieval Bench built on today's small `memory/incidents/**`
corpus is a noisy sample — treat early scores as directional, not a hard gate, until the
corpus grows. Mutation-score gating without a grace period could block
merges on pre-existing weak tests the moment `|| true` is removed — run it
in report-only mode for one cycle before making it blocking.

---

## 8. Telemetry Quality Dashboard + Sentry Trace-Meta Drill-Through

### 8.1 What `sentry-api.ts` can read today

`src/lib/admin/sentry-api.ts` exposes: `fetchSentryIssues` (`:137`, issue
list), `fetchSentryHourlyStats` (`:201`), `fetchSentryFeatureCounts`
(`:276`), `updateSentryIssueStatus` (`:383`), `fetchSentryReleaseHealth`
(`:460`). Org/project come from `usableCredential('sentry_slug',
process.env.SENTRY_ORG/SENTRY_PROJECT)` (`:71-72`) — not hardcoded; the
`helm-xs` org name appears only in code comments documenting a specific
measurement date (`:286`, `:459`), not as a literal. **There is no
trace/span/event-detail read anywhere in this file** (`grep -n
"trace\.\|span\|traceId"` over the file returns nothing) — this module is
issue-and-release-level only.

### 8.2 Gap

No trace-meta (span breakdowns, source-mapped stack detail, breadcrumbs)
capability exists. `docs/ai-system/selfheal/STATE-2026-08-28.md` §5.2
independently documents the cost of this exact gap: the Diagnose stage's
"genuinely-thin" NEEDS MORE EVIDENCE cases happened because "the agent
never pulled the **full Sentry issue** (source-mapped stack, breadcrumbs,
request context)" — it only had the signal *summary*. This dashboard and
that fix are the same fix.

### 8.3 Smallest coherent implementation

Add `fetchSentryIssueDetail(issueId)` to `sentry-api.ts`, calling Sentry's
per-issue detail/events endpoint (same `API`/`REVALIDATE_SECONDS`/fail-soft
pattern already established at `:21-49`) — this is an additive function in
an existing, already-tested, already-credentialed module, not a new
integration. Wire it into `src/lib/admin/rca.ts`'s `RcaSourceContext` so
Diagnose gets full-fidelity evidence before analysis, directly closing the
STATE doc's §5.2 recommendation #2 ("NEEDS MORE EVIDENCE only allowed
*after* pulling the full Sentry issue"). Surface the same data as a
drill-through panel on `/admin/errors/[fingerprint]/page.tsx` (already the
per-incident detail route).

### 8.4 Tests

`sentry-api.test.ts` already exists (`src/lib/admin/__tests__/sentry-
api.test.ts`) — extend it with the new function's fail-soft contract
(unconfigured/error/ok states), matching every other function in the file.

### 8.5 Bridge surface

`/admin/errors/[fingerprint]` (extend); RCA context (`rca.ts`) gets richer
input, no new surface required there.

### 8.6 Risks

Per-issue detail calls are one more Sentry API round trip per analysis —
respect the existing `MAX_WALL_CLOCK_MS`/cooldown discipline (`:33-40`) so
one slow Sentry response doesn't stall the daily Diagnose run the way the
OAuth-gated MCP stall stalled Repair (`STATE-2026-08-28.md` §5.3).

---

## 9. Dependency-ordered execution sequence

**Cross-session gate, applies before item 6 and item 10 below:** per §0.15,
`src/lib/reliability/**` is off-limits to this plan's work until PR #1777
(Reliability-tab defect fixes, owned by the parallel Sentry session) has
actually merged — confirm merge state before branching, do not infer it
from this plan's own `44f4ce183` read.

```text
1. Fix the Stryker || true gate (K.4.1)              — trivial, no dependencies
2. Sentry issue-detail read (§8.3)                    — extends sentry-api.ts, no dependencies
3. Golden-path registry over existing e2e specs (D.4.1) — no dependencies
4. Registry granularity split for admin_platform (E.4.3) — OWNER DECISION gate; blocks E.4.1/E.4.2
5. World-model graph generator (E.4.1-2)              — needs (4)
6. Invariants as a collector arm (D.4.3)              — needs nothing new, but land after (3) so seeded invariants can reference golden paths
7. Change-risk scorer (F.4.1)                         — stronger once (5) exists (impacted-feature count), usable in a weaker form before it
8. Feature flags + expiry gate (F.4.2)                — no dependencies, can run parallel to (7)
9. Replay-lab formalization of repair-contract STEP 3 (G.4.1)  — no dependencies
10. Rollback-recommendation script (F.4.3)            — needs the reliability-snapshot history (already exists) + (7) for context
11. Sentry-detail-fed RCA + Verification Ensemble skeleton (J.4.2) — needs (2); ensemble's security role benefits from (7)
12. Causal-confidence scoring (J.4.3)                 — needs (5) for changed-feature-overlap component
13. Agent Flight Recorder (J.4.1)                     — OWNER DECISION gate on storage; can start once (11) exists to have something to record
14. Earned Autonomy extension (J.4.4)                 — needs (11), (12)
15. Decision Inbox (J.4.5)                            — needs (7), (10), (11)
16. Context Retrieval Bench (K.4.2)                   — no hard dependency, but more useful after (9) grows the incident-derived gold set
17. Contract Compiler (K.4.3)                         — no dependency
18. Janitor generator (K.4.5)                         — no dependency
19. Metamorphic/proof-island pilot (K.4.4)            — sequence after (1) so the CI job it extends is trustworthy
```

## 10. Parallel-worktree table

Items that touch disjoint files and can run as separate worktrees without
merge conflicts:

| Group | Items | Files touched |
|---|---|---|
| A | (1) Stryker gate fix, (18) Janitor generator | `.circleci/config.yml`, new `scripts/janitor/*` — no overlap with anything else |
| B | (2) Sentry issue-detail | `src/lib/admin/sentry-api.ts`, its test file — do NOT run alongside any other item touching `sentry-api.ts` |
| C | (3) Golden-path registry, (16) Context Retrieval Bench | `memory/journeys/*`, `scripts/knowledge/bench.mjs` — read `e2e/**` and `memory/incidents/**`, write nothing there |
| D | (8) Feature flags | `config/feature-flags.yml`, new `src/lib/flags/*` — isolated new module |
| E | (17) Contract Compiler | new `scripts/contracts/*` — read-only over `memory/**`, writes nothing existing code depends on |
| F | (9) Replay-lab formalization | `docs/ai-system/selfheal/repair-contract.md`, new `replay/**` — **must not run alongside any other change to `repair-contract.md`** |

Everything in the dependency chain (4)→(5)→(7)/(12)→(11)→(13)→(14)→(15)
should be one sequential lineage or one worktree per stage merged in order
— these items all read/write `src/lib/admin/rca.ts`,
`memory/registry.yml`, `src/lib/reliability/**`, and (from (15) onward)
`src/lib/admin/incidents/attention.ts`, which is real overlap risk if
parallelized carelessly.

## 11. OWNER DECISIONS

Using this repo's own acknowledged-gap format
(`config/control-plane-gaps.json`) so these land the same way, not as
prose:

```json
{
  "id": "ADMIN_PLATFORM_REGISTRY_GRANULARITY",
  "owner": "founder",
  "scope": "memory/registry.yml admin_platform entry",
  "reason": "Every capability this control-plane program builds (incidents, reliability collector, self-heal loop, Bridge UI) resolves to one feature_id today (memory/registry.yml:1161). Phase E's blast-radius graph needs sub-capability edges to be useful for its own subject matter. Splitting a canonical registry entry changes routing for every session that maps a file through it — a real behavior change to the knowledge system, not a mechanical edit.",
  "closes_when": "the owner approves a sub-capability split (e.g. admin_incidents / admin_reliability_collector / admin_selfheal) and knowledge:registry-check is re-run clean against it."
}
```

```json
{
  "id": "AGENT_FLIGHT_RECORDER_STORAGE",
  "owner": "founder",
  "scope": "Phase J agent-run record storage",
  "reason": "background_job_logs' metadata jsonb column is one no-new-table precedent this repo already uses (src/lib/reliability/collect.ts:1-23). But it is not the only precedent, and not obviously the right one: a private helm_debug schema, RPC-gated (service-role only, never direct table access), already exists and already backs a different structured append-only run record -- the golf-round Flight Recorder (src/lib/observability/helm-flight-recorder.ts:109-123, RPCs helm_debug_start_trace/helm_debug_record_trace_step/helm_debug_finalize_trace). An agent run record's hypotheses[]/context_selected[]/verification{} fields need the same kind of real, queryable structure that pattern was built for -- closer to it than to a job-log jsonb blob. Either way a new table/schema addition is R3 (owner-applied migration) per this repo's own risk tiers.",
  "closes_when": "the owner picks a storage shape -- extend the existing helm_debug schema with a parallel agent_runs table (reusing its RPC-gated access pattern) or the background_job_logs metadata-jsonb approach -- once real query needs are observed against a small pilot volume."
}
```

```json
{
  "id": "VERIFICATION_ENSEMBLE_MODEL_COST",
  "owner": "founder",
  "scope": "Phase J verification ensemble, src/lib/admin/rca.ts",
  "reason": "Today Diagnose is one model call/day. A REPRODUCER->HEALER->{ADVERSARY,SECURITY,PRODUCT}->JUDGE pipeline multiplies that by up to 5x per finding, and HELM_AUTONOMY_CONTROL_PLANE.md §7 recommends a different model/provider for at least one verifier role to reduce correlated blind spots -- a real recurring cost and a new provider-account decision.",
  "closes_when": "the owner sets a per-run budget ceiling and approves (or declines) a second model provider for the adversary/security roles."
}
```

```json
{
  "id": "FEATURE_FLAG_INFRASTRUCTURE_NET_NEW",
  "owner": "founder",
  "scope": "Phase F, config/feature-flags.yml + src/lib/flags/*",
  "reason": "Zero feature-flag code exists in src/lib today (grep confirmed). This is the one genuinely new piece of production infrastructure in Phases D-K rather than an extension of something live, and it needs a governance decision on who may create/expire a flag and what 'operations_kill_switch' may touch, per the extension spec's own 'never auth, RLS, required persistence' boundary.",
  "closes_when": "the owner approves the config/feature-flags.yml schema and the never-gate list before the first flag is created."
}
```

```json
{
  "id": "CANARY_ROLLOUT_MECHANISM",
  "owner": "founder",
  "scope": "Phase F canary/staged release",
  "reason": "This app has no existing percentage-based traffic-splitting mechanism. Building one (Vercel-native or an in-app cohort flag) is materially larger than the risk-scoring and rollback-recommendation pieces of Phase F and was deliberately deferred in this plan (F.4.4) rather than estimated as part of the first cut.",
  "closes_when": "the owner chooses a canary mechanism (or explicitly defers canary indefinitely and keeps releases all-or-nothing with the rollback-recommendation script as the safety net)."
}
```

## 12. UNKNOWNS

- **A verification-process caveat, disclosed rather than hidden.** A shell
  cwd persistence issue during self-review caused several citation
  spot-checks to run against `~/worktrees/helmv3/sentry-max-controlplane`
  (branch `agent/sentry-max-controlplane`) rather than the canonical
  `44f4ce183` this plan cites throughout. Every file touched by that issue
  was directly diffed between the two commits before being trusted: 5 of 6
  originally spot-checked citations, plus `qualifier-invariants.ts`,
  `attention.ts`, `proof.ts`, `types.ts`, `check.mjs`, and the
  `qualifier-hell` fixture count, were confirmed byte-identical at both
  commits, so those citations stand. `memory/registry.yml` genuinely
  differed (the worktree has newer content), which is why §0.8's,
  E.2's, and F.4.1's `admin_platform` line citations were first wrongly
  "corrected" and then reverted to values re-verified with `git show
  44f4ce183:memory/registry.yml` directly — the numbers now in this
  document (`:1161`, `:1165`, `:1211-1213`, `:1161-1232`) are confirmed
  against that exact commit, not the worktree. The commander should still
  spot-check a handful of citations independently before treating this as
  fully clean; the failure mode (a `cd` in one Bash call silently
  persisting into an unrelated later call) is disclosed in full so it can
  be checked for, not asserted away.
- **Correction, not just an unknown:** `scripts/knowledge/check-feature-
  registry.ts` is not merely present on disk — it is already invoked by
  the live orchestrator (`scripts/knowledge/check.mjs:72`, called via
  `execFileSync(tsx, ['scripts/knowledge/check-feature-registry.ts', ...])`),
  which itself runs as `npm run knowledge:check`. So `memory/system/
  golfhelm-engineering-os.md`'s "Feature routing" section, which frames
  `knowledge:registry-check` as something that will exist "once that
  lands," is stale in the same direction as the "Planned extensions"
  claim corrected in §0 — this should be fixed in the same pass as that
  file. What remains genuinely **UNKNOWN**: whether this check's
  reconciliation logic currently catches **all** `memory/registry.yml` ↔
  `feature-registry.ts` divergence, or only the 4 ids the OS doc names as
  "Verified 2026-08-21" — its coverage completeness was not independently
  re-run in this pass.
- Whether Huly/n8n/the former external-review-bot pipeline described in
  `TELEMETRY_BASELINE.md`/`MISSION_CONTROL_CONTEXT_INDEX.md` is still
  operated at all outside this repository, now that the review bot itself
  is confirmed dropped (`AGENTS.md`). Nothing in the codebase confirms or
  denies continued external use. **UNKNOWN** — this plan does not depend
  on the answer either way.
- Whether `/admin/health` or any existing page already renders
  `config/control-plane-gaps.json`'s contents today (relevant to Phase K's
  janitor surface, §6.6). Not confirmed in this pass. **UNKNOWN.**
- The actual production event volume/cost implication of adding golden-
  path completion events (D.4.4) — no current baseline exists to compare
  against, since almost no custom events are emitted today. **UNKNOWN**
  until a baseline is measured post-instrumentation.
- Whether the Diagnose cloud routine (`trig_017qz7gw31S7b1GCK2abmmPr`) and
  Repair launchd agent (`com.helm.bridge-rca-repair`) are still running on
  the same schedule as of `44f4ce183` — `STATE-2026-08-28.md` is an
  explicitly-dated snapshot, not current authority, and this pass did not
  re-verify live heartbeat rows in `background_job_logs`. **UNKNOWN** —
  verify via `/admin/self-heal` or a direct query before relying on the
  loop's current health in any Phase G/J rollout.
