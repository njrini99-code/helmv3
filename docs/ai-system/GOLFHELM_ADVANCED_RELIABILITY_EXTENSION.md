# GolfHelm Engineering OS — Advanced Reliability & Product Intelligence Extension
<!-- markdownlint-disable MD033 -->

> Supplied by the owner 2026-08-21. Extends — does not replace —
> `docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md` and the base
> wiring. Implement ONLY after the base OS is installed and verified.
> Core release policy unchanged: ≤2 routine production deploys/calendar week;
> daily reliability never deploys; production release stays owner-controlled.

## 0. What this is

Do not rebuild the OS, add a second memory system, a second release process,
or a duplicate feature registry. The base provides feature routing, canonical
feature docs, ledgers, contracts, incident memory, release/deployment ledger,
session-aware hooks, context-before-edit + memory/test-before-stop gates,
daily collection, observer/healer/verifier, repair+release queues, the 2/week
cap, and owner-controlled release. This layer moves from "Claude knows the
feature and fixes errors" to "Claude understands impact, detects silent
failures, replays historical failures, measures behavioral health, estimates
change risk, rolls out safely, and proves repairs made the PRODUCT healthier
— not merely the logs quieter."

Sixteen additions: (1) live feature dependency/blast-radius graph; (2)
golden-path product health; (3) executable production data invariants; (4)
incident replay lab; (5) automated change-risk scoring; (6) feature flags +
kill switches + lifecycle governance; (7) staged/canary release inside
existing release windows; (8) rollback recommendation engine; (9) known-good
scenario library; (10) flaky-test intelligence; (11) per-feature performance
baselines; (12) per-feature cost baselines; (13) CoachHelm AI evaluation
memory; (14) product analytics/behavioral anomaly signals; (15)
repair-quality scoring; (16) reliability learning metrics. All keyed by the
existing feature_id vocabulary and integrated into the existing context
packs, observer, healer, verifier, release candidate, post-deploy
verification, repo doctor, and CI. Daily learning is continuous; production
deployment is deliberate.

## 2. Compact OS extension

Add to `memory/system/golfhelm-engineering-os.md` a concise "Advanced
Reliability Layer" section listing the graph, golden paths, invariants,
replay fixtures, risk scoring, flag governance, perf/cost baselines,
CoachHelm evals, and behavioral signals — same feature_id vocabulary, no new
sources of truth, daily may analyze/prepare but not deploy, canary/flag
rollouts only inside owner-approved releases. Point to this document at
`docs/ai-system/GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md` for detail.

## 3. Repo doctor additions

FEATURE_GRAPH_PRESENT, FEATURE_GRAPH_GENERATOR_PRESENT,
FEATURE_GRAPH_NO_ORPHANS, GOLDEN_PATH_REGISTRY_PRESENT,
DATA_INVARIANT_REGISTRY_PRESENT, REPLAY_FIXTURE_GUARDS_PRESENT,
RISK_MODEL_PRESENT, FEATURE_FLAG_REGISTRY_PRESENT,
FEATURE_FLAG_EXPIRY_CHECK_PRESENT, PERFORMANCE_BASELINE_PRESENT,
COST_BASELINE_PRESENT, COACHHELM_EVAL_REGISTRY_PRESENT,
PRODUCT_ANALYTICS_SIGNAL_MAP_PRESENT.

## 4-5. Dependency/blast-radius graph (first addition)

`memory/graph/feature-dependencies.yml` — per feature: upstream, downstream,
data {tables, rpcs}, jobs, journeys, tests, signals. Generate as much as
possible from registry.yml, feature-registry.ts, imports, route/action
ownership, DB/RPC calls, producers/consumers, jobs, test mappings, feature
docs. An import graph is NOT automatically a product dependency graph — use
explicit verified edges where meaning matters. Commands: `graph:regen`,
`graph:check`, `graph:impact -- --feature <id>` / `--files <paths>`. Context
packs include the dependency/blast-radius summary before code. The verifier
becomes blast-radius-aware: a change to round_tracking that feeds
stats/CoachHelm/review/hub runs the smallest meaningful downstream
verification set — never "all tests blindly," never "own tests only."

## 6-7. Golden-path product health + outcome contracts

`memory/journeys/golden-paths.yml`: stable journey ids with feature_ids,
criticality, environment strategy (production: read_only_observation;
preview: executable), expected outcomes. Seed: coach_login_dashboard,
player_login_hub, coach_create_event, coach_view_calendar,
coach_check_player_availability, player_rsvp_event, player_start_round,
player_resume_round, player_submit_round, coach_view_player_stats,
coach_view_coachhelm_insight, player_view_development_plan. Production
checks are read-only or based on naturally occurring outcomes — no synthetic
production writes by default; executable write journeys live in
preview/test or an isolated synthetic tenant with hard teardown. The daily
observer reports error health AND golden-path health — a completion-rate
collapse is an incident even with zero exceptions.
`memory/journeys/outcome-contracts.yml`: real product outcomes (round
started→submitted, event created→visible, RSVP→persisted, class
imported→on calendar, round→stats refreshed, eligible→CoachHelm completes,
insight delivered→renderable). Thresholds come from historical healthy
windows; mark `baseline_status: collecting` until evidence exists.

## 8-9. Executable invariants

`memory/invariants/registry.yml`: stable ids (INV-ROUND-001…), feature_id,
severity, title, check {type: sql_read_only, script:
scripts/invariants/*.mjs}. Classes: referential, lifecycle,
ownership/tenancy, cache freshness, job freshness, impossible combinations,
duplicates, orphans, cross-feature propagation. Checks are read-only,
bounded, indexed, production-safe — recent windows/sampling/checkpoints, no
daily full-table scans. A violated critical invariant outranks low-volume
generic warnings. During incident backfill ask: could a deterministic
invariant have caught this? If yes: write it, test it, link it to the
incident, add it to the ops contract. A bug should upgrade the control
plane, not just disappear.

## 10-11. Incident replay lab

`replay/` (README, fixtures/<feature>/, manifests/, runners/). Fixtures are
the smallest sanitized state necessary — never raw profiles, emails, tokens,
full production rows, private messages, raw logs. Manifest: replay_id,
incident_id, feature_id, expected {bad_version: fail, fixed_version: pass},
fixture file, invariants, tests. Ideal proof: replay fails pre-fix, passes
post-fix, neighbors still pass. Where a bad-SHA checkout is too expensive,
reintroduce the fault deliberately in test isolation. Never mutate
production. Incident docs gain a `## Replay` section (id, fixture,
reproduction confidence, regression test, limitations). Prioritize:
data-loss, auth/tenancy, silent statistical corruption, concurrency, offline
reliability, critical workflows, major CoachHelm reasoning failures.

## 12-13. Change-risk scoring

`config/change-risk.yml` + `scripts/risk/score-change.mjs`; `npm run
risk:score -- --files|--diff`. Objective inputs: feature criticality,
impacted-feature count, downstream-critical count, auth/RLS/migration/
destructive-write/user-data-write/background-job/AI-behavior involvement,
historical incident density, recent regression density, test-coverage
confidence, replay coverage, golden-path coverage, diff size, new
dependency, new external integration. Output score AND itemized reasons —
the number is a deterministic prioritization heuristic, reasons matter more.
Risk maps to required verification: low = targeted units + typecheck +
lint; medium adds neighboring tests + preflight; high adds
integration/RLS + replay + golden path + verifier + preview deploy;
critical adds owner approval, explicit release note, migration/auth/data
review, canary/flag strategy, manual rollback plan. Augments R0-R3, never
overrides it.

## 14-15. Feature flags + kill switches

`config/feature-flags.yml`: per flag — feature_id, owner, purpose, type
(release | experiment | operations_kill_switch | temporary_migration),
status, created_at, expires_at, default, environment rollout, kill-switch
behavior, cleanup plan. `npm run flags:check` fails on expired flags (CI).
Kill switches may pause optional generation, experimental surfaces,
nonessential providers, new workers — never auth, data-corruption
concealment, critical observability, RLS, required persistence. Ops
contract states what the switch disables, what remains, who can change it,
how audited.

## 16-18. Canary, release health, rollback recommendation

Canary lives INSIDE one approved release operation (5%→25%→100% or
owner/synthetic tenant→selected teams→all), still ONE release event for the
budget unless the platform genuinely creates distinct promotions — define
counting semantics; never game the two-deploy limit. Compare candidate vs
baseline on new fingerprints, 5xx, critical golden paths, invariants,
p95/p99, cost, CoachHelm signals — never promote merely because deploy
succeeded. `scripts/release/evaluate-rollback.mjs` outputs KEEP | WATCH |
PAUSE_ROLLOUT | ROLLBACK_RECOMMENDED | UNKNOWN with itemized evidence and
confidence; it never executes rollback — owner-controlled. On canary
failure the safest automated action is stop-promotion, not another
production mutation.

## 19-20. Known-good scenario library

`memory/scenarios/<feature>.yml`: small product contracts (id, feature_ids,
preconditions, steps, assertions). Backing can be unit, integration,
preview E2E, or read-only production observation. The graph maps
feature→scenarios; a release candidate runs only affected scenarios + core
global smoke.

## 21. Flaky-test intelligence

`memory/testing/flakes.yml`: per test — status (suspected | confirmed_flaky
| quarantined | fixed | false_flake), first_seen, occurrences, pass/fail
runs, suspected mechanism, feature_id, owner. Requires repeated
nondeterministic evidence; never retry-until-green-and-call-fixed, never
skip/remove from gate without a documented decision. Track flake-rate
changes daily/CI.

## 22-25. Performance + cost baselines

`memory/baselines/performance.yml`: per feature+operation (route, action,
RPC, cron, CoachHelm generation) — p50/p95/p99, timeout rate, DB duration,
payload size where measurable; baseline window, sample count, release
range; learned from known-healthy periods; a 3-request baseline is never
high-confidence. Daily observer detects "successful but much slower" →
PERFORMANCE_REGRESSION even with normal errors.
`memory/baselines/cost.yml`: function runtime, DB workload proxy, AI
requests/tokens/cost, job frequency, external API cost — mark measurement
source, no invented dollar precision. Correlate perf/cost with release SHAs;
an intentional cost increase is a recorded decision, not a bug.

## 26-29. CoachHelm AI evaluation memory

`evals/coachhelm/{cases,rubrics,regression}` extending the existing
Promptfoo infra. Cases carry feature area, input/stat context, required
factual statements, required evidence, prohibited claims, expected
uncertainty, acceptable actions, user role. Dimensions tracked separately —
factuality, evidence faithfulness, sample-size honesty, causal restraint,
actionability, role appropriateness, tool correctness, hallucination rate,
latency, cost — no single composite that can hide an 8% hallucination
rate. Meaningful prompt/model/reasoning/tool changes run affected eval sets
and surface tradeoffs (e.g., actionability +11%, latency +22%) for owner
decision. Production feedback loop where safe and privacy-preserving:
compare recommendations with later outcomes (focus areas created,
acknowledgments, plans acted on) without pretending correlation is
causality.

## 30-32. Product analytics as reliability signal

FIRST audit current PostHog: initialization, actual events, privacy
controls, session replay, name↔concept mapping. No new analytics platform
before understanding what exists. `memory/analytics/event-contracts.yml`:
per important event — feature_id, journey_id, meaning, allowed properties,
prohibited properties. Behavioral anomalies (completion drops, abandonment
spikes, zero-usage of active features, funnel collapses) are daily
reliability signals — a create→viewed rate falling 87%→31% with normal
telemetry is a silent-delivery defect. Never surveillance: collect event
type, feature, operation, safe ids, counts, durations, transitions;
prohibited properties are explicit; no sensitive content in
analytics/Sentry/Bridge/memory.

## 33-35. Repair quality, recurrence, learning metrics

`scripts/reliability/score-repair.mjs`: root cause verified, regression
test, replay coverage, blast radius checked, golden path checked, signal
hidden?, memory updated, post-deploy verified, recurrence → letter grade +
itemized facts; identifies weak repairs, not gamification. Recurrence (same
invariant/root-cause/fingerprint family) marks RECURRENCE, lowers prior
repair confidence, and asks: wrong root cause? incomplete fix? another
path? fix never deployed? grouping hid distinct mechanisms? Learning
metrics report: MTT-feature-identification, MTT-verified-root-cause,
MTT-repair, repeat-incident rate, % incidents with regression tests, % with
replays, % features with contracts/golden paths/baselines, unmapped code,
stale doc references, false-positive alert rate, telemetry-defect rate,
emergency vs routine deploy counts, rollback-recommendation accuracy. Never
optimize speed at correctness's expense.

## 36-43. Integration into specs, contracts, collector, audit, incidents

Also covers: healer, verifier, release report.

Feature specs gain (only where relevant): Dependency/Blast Radius
(generated), Golden Paths, Production Invariants, Performance Baseline,
Cost Baseline, Known-Good Scenarios, Feature Flags, Eval Contract. Ops
contracts cover errors, golden paths, invariants, performance, cost, job
freshness, behavioral outcomes, expected quiet states, flag state; health
states GREEN/AMBER/RED/UNKNOWN/DEGRADED/PAUSED_BY_FLAG (intentional pause ≠
failure). Daily collector schema gains golden_paths, invariants,
performance, cost, behavior, jobs, flags, release per feature — missing
metrics are UNKNOWN/NOT_MEASURED, never zero. Daily audit inspects all
signal classes + rollout state before opening an incident, asking: real
user impact? telemetry defect? perf regression? intentional rollout?
data-integrity? seasonality? Incident classes add: FUNCTIONAL_FAILURE,
DATA_INTEGRITY, SECURITY, PERFORMANCE_REGRESSION, COST_REGRESSION,
AI_QUALITY_REGRESSION, BEHAVIORAL_REGRESSION, TELEMETRY_DEFECT,
EXPECTED_STATE, DEPENDENCY_OUTAGE, ROLL_OUT_REGRESSION, UNKNOWN (one
primary, multiple secondary). Healer receives a compact packet (feature,
classification, violated invariant, risk score, blast radius, scenarios,
replay, golden-path status, perf/cost deltas, release diff, analogous
incidents). Verifier explicitly checks: invariant restored, replay passes,
neighbors unregressed, perf/cost not worsened, flags unchanged
unexpectedly, original signal not hidden, downstream unaffected, memory
accurate. Release report adds: blast radius, golden paths affected,
invariants affected, per-repair risk, replay coverage, flags changed,
canary strategy, expected perf/cost impact, eval deltas, behavioral watch
metrics, rollback trigger, kill-switch option.

## 44-46. Decision tree + unchanged guardrails

Risk low → normal release. Medium/high → flag if safely gateable → ship
dark/limited; else canary if possible → staged; else stronger
preview/replay/manual verification. Never force flags into ungateable code.
Release budget unchanged (2/week ceiling; zero acceptable). Emergency stays
human-controlled: canary failure → pause rollout + recommend; stop-promotion
over more production mutation.

## 47-48. Implementation phases + pilots

Phase A dependency graph (graph, impact command, verifier integration,
tests) → B golden paths + invariants (registries, outcome contracts, daily
snapshot integration) → C replay lab (format, runner, incident links, 3
historical replays) → D risk scoring (deterministic model, explainable
output, verification-policy integration) → E flags + rollout (registry,
expiry checks, kill-switch contract, release-report integration) → F
performance + cost (schemas, healthy-baseline learning, daily regression
detection, release comparison) → G CoachHelm evals (case registry, critical
rubrics, CI/release delta reporting) → H product analytics (PostHog audit
FIRST, then event contracts, feature mapping, anomaly signals) → I
reliability-learning dashboard (only after underlying data is trustworthy).

Pilots before generalization: (1) round_tracking — graph, golden paths,
invariants, replays, risk scoring, perf baseline; (2) calendar_events —
golden paths, ownership invariants, behavioral analytics, replays; (3)
coachhelm_ai_engine — eval + cost baselines, quality regression, known-good
cases, flag where appropriate; (4) admin/Helm Bridge — monitoring
invariants, golden-path admin health, telemetry-defect tests.

## 49. Do not overengineer

Every mechanism must answer: what failure class does it prevent/detect; can
it be generated; can it be tested; will an agent use it; does it reduce
uncertainty. No overlapping YAML registries, duplicated inventories, unread
charts, decision-less scores, expiration-less flags, incident-less replays,
sample-size-less baselines. One reliable control beats five decorative ones.

## 50. Completion proof (before declaring the extension done)

1. A round_tracking change produces a downstream blast-radius report.
2. A silent golden-path failure is detected with zero Sentry exceptions.
3. A historical replay fails under the broken condition, passes after the fix.
4. Risk scoring raises required verification for a high-risk change.
5. An expired flag fails the lifecycle check.
6. A canary health regression pauses promotion without auto-rollback.
7. A performance regression is detected despite normal error rate.
8. A CoachHelm change reports eval quality + latency + cost deltas.
9. Duplicate analytics/telemetry events do not create duplicate incidents.
10. None of these systems can cause a daily production deployment.

Final report lists additions, wiring, pilot features, commands, tests, CI
gates, daily-audit changes, release-manager changes, proof results,
remaining gaps.

## 51. Final operating principle

The base OS answers: what feature is this, how does it work, how has it
failed, how do we repair it safely. This extension answers: what else can
this change break, is the product actually working, can we replay the
failure, how risky is the change, did performance/cost/AI quality regress,
and how do we release gradually without increasing deployment frequency.
Every meaningful incident leaves behind a regression test, a replay
fixture, a new invariant, a stronger golden path, a better dependency edge,
a better health signal, a better eval case, or a better release guard. The
goal is not fewer errors; it is less uncertainty, faster verified
diagnosis, safer repairs, fewer repeated failure classes, and a product
model that gets smarter every time GolfHelm teaches us something.
