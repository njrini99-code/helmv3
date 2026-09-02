# Helm Autonomy Control Plane — Deep Research Extension

> Supplied by the owner 2026-08-21. Extension, not replacement: assumes the
> GolfHelm Engineering OS (base) and the Advanced Reliability & Product
> Intelligence Extension are installed. Implement after them.
>
> **Primary principle:** Full autonomy does not come from giving Claude more
> permission. It comes from a better world model, stronger independent
> verification, measurable context quality, scoped authority, and an
> evidence-based mechanism for earning more autonomy over time.

## 1. Executive direction

Evolve `signal → feature → context → history → investigate → repair → verify
→ queue → controlled release → remember` into: understand the whole system →
predict blast radius → retrieve only the right context → simulate/replay the
failure → generate competing hypotheses → challenge its own repair →
independently verify correctness → quantify uncertainty → act only within
scoped authority → learn from the real production outcome → increase or
decrease autonomy by repair class → continuously improve the Engineering OS
itself.

## 2. Helm World Model

A machine-readable model of the current running system — production SHA,
schema version, flags, environment; routes, actions, services, RPCs, tables,
jobs, external APIs; features, journeys, invariants, tests; Sentry, Vercel,
PostHog, Bridge; historical incidents, ADRs, recent changes. Every semantic
edge carries evidence (source path, runtime trace, integration test,
commit/PR history) — "probably affects" is not an edge. The world model is
the central reasoning substrate for impact analysis, context retrieval,
incident correlation, release risk, verifier scope, replay selection, and
autonomous repair permissions.

## 3. Helm Twin

A practical engineering digital twin — not a production replica; a
controlled environment that replays production-like behavior safely:
production evidence → sanitize → reproduction snapshot → isolated worktree →
preview application → isolated/test Supabase state → candidate code → replay
request/journey → observe differences. Answers: would this repair have fixed
the historical incident; what downstream behavior changed; did stats output
change; did CoachHelm conclusions change; did latency/cost move; did
authorization behavior change. Isolated, reproducible, side-effect
controlled, release-SHA aware, fixture-injectable, scenario- and
replay-capable. External side effects (email, push, notifications, calendar
sends, webhooks) go to sinks/stubs, never real delivery.

## 4. Agent Flight Recorder

Observability applied to Claude itself. Every autonomous run produces an
append-only record: agent_run_id, engineering_os_version, goal,
authorization (features, max_risk, production_write), context_selected,
hypotheses with confidences, tools_used, files_written, verification
(targeted tests, replay, mutation score, verifier), outcome (PR, queue),
post_release (recurrence). Must answer: what context did Claude see/miss;
which hypothesis did it choose; what tool data did it trust; which files did
it modify; what tests ran; which verifier approved; what changed in
production afterward.

## 5. Helm Context Retrieval Bench

A frozen historical benchmark asking: can the OS retrieve the right context
before coding starts? Per task: gold context (features, files, contracts,
incident analogues, tests) vs noise. Metrics: Recall@5/@10, gold-file
recall, time to first correct file, wrong-feature rate, irrelevant-token %,
stale-context %, historical-analogue retrieval rate. Every change to memory
layout, feature graph, context-pack algorithm, CLAUDE rules, semantic
search, or retrieval strategy runs this benchmark. The OS never becomes
"smarter" by subjective feeling.

## 6. Active Contract Compiler

`npm run contract:resolve -- --feature <id>` resolves each feature's CURRENT
contract from verified code, generated truth, feature memory, ADRs, tests,
and semantic history — outputting current semantics plus superseded claims
(with what superseded them and when). The agent sees the resolved contract;
history cannot silently override current product truth. Compile important
contract rules into tests, lint rules, type checks, runtime assertions, data
invariants, AI eval cases, and release checks where practical.

## 7. Verification Ensemble

The healer never solely judges its own repair. Roles: REPRODUCER (prove the
defect, minimal reproduction, telemetry-vs-product distinction) → HEALER
(smallest root-cause repair) → in parallel TEST ADVERSARY (break the repair,
attack assumptions), SECURITY VERIFIER (required for auth/RLS/tenancy/
cross-team/data-exposure/privilege), PRODUCT VERIFIER (feature contract,
golden journeys, user semantics, downstream) → JUDGE (synthesizes evidence,
never writes implementation code, ACCEPT/REJECT). For high-risk areas
consider a different model/provider for one verifier to reduce correlated
blind spots.

## 8-10. Stronger test oracles

MUTATION TESTING (selective, critical logic: authorization predicates, stats
calculations, date/time semantics, round persistence, incident filtering,
CoachHelm thresholds): deliberately break code plausibly (> → >=, teamId →
userId, resolved-filter dropped, UTC → local) and require tests to notice;
surviving mutants = weak verification. METAMORPHIC TESTING where no exact
expected value exists (reorder rounds → aggregates equivalent; add unrelated
player → target analysis unchanged; change viewer timezone → team-owned date
semantics hold; reorder CoachHelm evidence → conclusions consistent) —
prime for CoachHelm, statistics, ranking, recommendations, analytics. PROOF
ISLANDS: small high-correctness kernels (date/time conversion, ID
normalization, auth predicates, score/stat aggregation, rate-limit and
incident classification) hardened with property-based/exhaustive/model-based
tests and strong invariants; ~95% normal code, ~5% extremely hard-to-break
primitives that agents REUSE instead of reimplementing.

## 11. Trace-guided repair

From "Sentry string → grep" to: production trace → request → route → server
action → RPC → database query → unexpected state → source slice → recent
commits touching the slice. Standard telemetry fields: service.name,
service.version = git SHA, deployment.environment.name, feature.id,
operation, trace.id, agent.repair_id. Production SHA is the common release
identity across GitHub, Vercel, Sentry, Bridge, OpenTelemetry, incidents,
agent runs.

## 12. Shadow / counterfactual execution

For safe idempotent/read-only operations: run the real production request
down the production path AND a candidate shadow path with side effects
disabled; compare semantic outcomes (e.g., SG putting -0.37 vs +4.91 →
ALERT unexpected semantic divergence; CoachHelm conclusion flip with dropped
evidence citation). Users only ever see production output; shadow results
are diagnostic and feed release readiness.

## 13. Earned Autonomy Engine

Autonomy is earned by feature × repair_class × action × OS version, from
real outcomes: attempts, verifier passes, human rework, production
regressions, recurrences → trust level → allowed actions (e.g., HIGH trust
telemetry-classification repairs on round_tracking may investigate/
implement/PR/merge/queue but never deploy; LOW trust RLS work on
auth_onboarding may investigate/test/prepare only). AUTOMATIC DEMOTION after
recurrence, rollback, verifier disagreement, human correction, production
regression, hidden-test failure, or scope violation. Promotion across major
thresholds is owner-controlled.

## 14-15. Capability charters + routine sandboxing

Every autonomous run gets a temporary execution charter: goal, allowed
features/files/tools, write scope (repo yes, production db/config no), risk
ceiling, network allowlist, expiry. Expanding beyond the charter (e.g.,
calendar_events → auth_onboarding) BLOCKS and requires explicit replanning
— prevents objective drift. The daily observer runs with read-only
credentials everywhere (GitHub/Vercel/Sentry/Bridge/Supabase/PostHog READ);
no production writes, deploy permission, secret or config mutation,
migration apply. The healer gets separately scoped authority only after an
incident is promoted; the release manager gets release privileges only
inside the owner-approved release process.

## 16. Tool Chaos Lab

Tools fail too. Fault-injection tests for the OS: Sentry timeout, stale
issues, GitHub pagination truncation, Vercel unknown deployment, Supabase
read failure, PostHog incomplete results, malformed MCP JSON, valid-looking
incorrect values, subagent timeout, structured-output omission. The key
question: does Claude say UNKNOWN, or does it confidently repair on
incomplete evidence? Every observation carries source, retrieved_at,
source_as_of, completeness, confidence. Invariant: incomplete evidence ≠
zero errors.

## 17. Causal engine

Temporal correlation is insufficient. Score causal confidence from
explainable components (temporal overlap, changed affected feature, changed
executed path, stack overlap, canary differential, historical mechanism
match, control cohort unaffected, provider outage detected as negative) →
"LIKELY CAUSE, confidence 0.86" — never "CAUSE" until reproduced. Track
false attributions and recalibrate.

## 18. Engineering garbage collector

A weekly Engineering Janitor scans for duplicate helpers, dead flags, stale
docs, orphan actions, stale TODOs, oversized modules, architecture
violations, unused tests, mock inflation, deprecated APIs, duplicate
telemetry, missing feature mappings, abandoned experiments. Small safe
cleanup PRs or release-queue maintenance items — never one enormous cleanup
PR; the janitor obeys risk scoring and verification.

## 19. Engineering OS self-improvement

Version the OS (engineering_os_version). Changes to CLAUDE.md, hooks,
retrieval, verifier prompts, memory layout, agent roles, or context
selection run against the frozen historical benchmark (e.g., 50 historical
incidents: correct root cause %, file recall %, extra bad edits, verifier
misses, median tokens, time/task). Adopt a new OS version only when
non-regressing across critical measures. Claude may improve the OS itself —
under the OS's own regression tests.

## 20. Human Attention Optimizer

The best autonomy metric is not how many PRs Claude made — it is how many
decisions the owner actually needed to make. A Decision Inbox surfaces ONLY:
R3 production/database decisions, ambiguous product semantics, verifier
disagreement, rollback recommendations, release-candidate approval,
security-sensitive decisions, autonomy-policy expansion, major architecture
tradeoffs. Everything else happens quietly. Optimize for low owner
interruption at high decision quality.

## 21-22. Definition of full autonomy + target architecture

Autonomous: observe (all sources), understand (world model, contracts,
graph, history, traces), diagnose (competing hypotheses + causal evidence),
reproduce (twin/replay/sandbox), repair (capability-scoped), attack
(independent adversarial verification), validate (tests, mutation, golden
paths, security, perf, cost, AI evals), merge (only where the repair class
earned it), queue, learn (memory/trust/replay/contract/benchmark), maintain
(janitor), improve itself (benchmarked OS upgrades). Intentionally human:
production deploy, irreversible production data operations,
credential/security changes, major architecture, ambiguous product
decisions, R3 migration/RLS, emergency rollback, autonomy-policy expansion.
**Humans own judgment; the system owns execution.** Flow: LIVE REALITY →
WORLD MODEL → OBSERVER (read-only) → REPRODUCER (twin/replay/hypotheses) →
HEALER (capability-scoped) → {TEST ADVERSARY, SECURITY, PRODUCT} → JUDGE →
RELEASE QUEUE → owner-approved window → PRODUCTION → LEARNING LOOP → OS
improves.

## 23-24. Priority order

Top five: (1) World Model + Helm Twin; (2) Agent Flight Recorder; (3)
Context Retrieval Bench; (4) Independent Verification Ensemble; (5) Earned
Autonomy Engine. Then: Active Contract Compiler, mutation + metamorphic
testing, trace-guided repair, shadow execution, Tool Chaos Lab, Engineering
Janitor, OS self-benchmarking, Human Attention Optimizer.

## 25. Integration

No second autonomous system. Everything plugs into memory/registry.yml,
memory/features/*, memory/incidents/*, memory/ledgers/*, the release queue,
the daily observer, existing healer/verifier, and the two-release-per-week
policy. The compact OS gains pointers to the World Model, Flight Recorder,
Autonomy Trust Engine, Verification Ensemble, and Contract Compiler. This
document lives at docs/ai-system/HELM_AUTONOMY_CONTROL_PLANE.md.

## 26. Implementation phases (after prior layers are installed)

Phase 1 World Model (canonical feature ids; every relationship with
evidence/provenance; blast-radius into context packs + verifier scope).
Phase 2 Helm Twin (sanitized fixtures, release-aware reproduction,
side-effect sinks, preview/test DB, production-vs-candidate comparison; no
candidate output to real users). Phase 3 Flight Recorder (append-only,
queryable). Phase 4 Retrieval Bench (frozen historical tasks, gold sets,
metrics, pre-adoption comparisons). Phase 5 Contract Compiler (current
semantics + superseded claims; compiled enforcement where practical).
Phase 6 Verification Ensemble (six roles; judge writes no implementation;
stronger verification for auth/RLS/persistence/stats/CoachHelm). Phase 7
stronger oracles (selective mutation, metamorphic, proof islands — never
repo-wide mutation by default). Phase 8 trace-guided repair (feature id +
operation + trace id + SHA alignment). Phase 9 shadow execution (safe ops
only; divergences into release readiness). Phase 10 Earned Autonomy (trust
by feature × class × action × OS version; automatic demotion; owner-gated
promotion). Phase 11 capability charters (block scope expansion; require
replanning). Phase 12 Tool Chaos Lab (incomplete evidence → UNKNOWN, never
fake green). Phase 13 causal engine (explainable confidence; reproduction
before "cause"; calibration from false attributions). Phase 14 janitor
(small PRs, principle-bound). Phase 15 OS self-improvement (versioned,
benchmark-gated). Phase 16 Human Attention Optimizer (Decision Inbox;
measure owner-decision burden).

Release policy unchanged throughout: daily observer never deploys; routine
production ≤2/calendar week; production deploy owner-controlled; R3/
irreversible actions owner-controlled.

## Completion criteria

Demonstrate: (1) World Model impact routing; (2) Twin reproduction; (3)
agent run traceability; (4) context benchmark improvement; (5) contract
resolution; (6) independent verifier disagreement handling; (7)
mutation-test detection of weak tests; (8) shadow divergence detection; (9)
automatic autonomy demotion after a simulated bad repair; (10)
scope-expansion blocking; (11) incomplete tool evidence producing UNKNOWN;
(12) OS version benchmark comparison. Final report: architecture, files,
commands, pilot features, benchmark results, verifier behavior, autonomy
trust model, security controls, remaining gaps.

## 27. Final principles

1. Autonomy is earned, not granted globally. 2. Every agent action must be
attributable. 3. Context quality must be measured. 4. Current contracts
must be compiled from verified truth. 5. A healer does not verify itself
alone. 6. Passing tests do not prove the tests are strong. 7. Runtime
traces beat random repo search. 8. Candidate behavior should be tested
before users see it. 9. Incomplete evidence means UNKNOWN. 10. Tool
failures are part of the threat model. 11. Autonomous agents create
entropy; janitors remove it. 12. The Engineering OS itself requires
regression testing. 13. Human attention is the scarce resource. 14. Humans
own judgment; the system owns execution.

The end state is not "Claude writes more code automatically." It is: Helm
continuously observes itself, understands itself, tests its own
assumptions, repairs itself, challenges those repairs, measures what
happened, learns whether that type of autonomy was deserved, and improves
its engineering system without losing human control over irreversible
decisions.
