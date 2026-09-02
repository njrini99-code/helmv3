# GolfHelm Self-Healing Engineering System — Master Design Specification
<!-- markdownlint-disable MD033 -->

> Supplied by the owner 2026-08-21 as the implementation prompt for wiring the
> GolfHelm Engineering OS. This is the long-form architecture/design/reference
> document. The runtime operating contract every Claude session loads is the
> compact `memory/system/golfhelm-engineering-os.md`, which points here.
>
> **Repository:** `njrini99-code/helmv3`
>
> **Primary requirement:** Wire the GolfHelm self-healing engineering system
> into the repo so every Claude session is automatically feature-aware,
> production signals route into that memory, repairs are verified and
> remembered, and **daily monitoring never means daily deployment**.
>
> **Production release policy:** **Maximum two routine production deploys per
> calendar week.** Daily audits may investigate, repair, test, merge/queue
> verified code, and update durable memory, but they may **not deploy
> production**.
>
> **Do not create one GitHub issue, one PR, or one deploy for every
> Sentry/Vercel/Bridge event.** Deduplicate by feature + fingerprint + root
> cause, update existing incidents, batch appropriately, and release on the
> controlled release train.

────────

## 1. Claude: read this first

You are implementing the operating system that will govern future GolfHelm
engineering. Do not merely add documentation. Do not merely add another Claude
prompt. Do not merely create a daily cron. You must wire the system into the
repository's existing instructions, feature routing, hooks, CI, observability,
incident workflow, and release process so future Claude sessions automatically
operate through it.

The intended behavior is:

```text
EVERY CLAUDE SESSION
        ↓
repo instructions automatically point at GolfHelm Engineering OS
        ↓
task/file maps to canonical feature_id
        ↓
feature context loaded before meaningful mutation
        ↓
code change
        ↓
tests + invariants + memory update
        ↓
completion gate verifies all of the above
```

and operationally:

```text
EVERY DAY
Vercel + Sentry + Helm Bridge + CI
        ↓
read-only normalized audit
        ↓
dedupe + correlate + classify
        ↓
investigate
        ↓
repair if appropriate
        ↓
verify
        ↓
QUEUE FOR RELEASE
        ↓
NO PRODUCTION DEPLOY
```

then:

```text
AT MOST TWICE PER WEEK
release candidate
        ↓
all queued verified changes
        ↓
release readiness gate
        ↓
owner approval
        ↓
ONE production deploy
        ↓
post-deploy verification
        ↓
close/continue incidents
        ↓
update production release ledger
```

A production problem on Monday does not automatically cause a Monday
deployment. A new Sentry fingerprint does not automatically create a new
GitHub issue. Ten occurrences of the same root cause do not become ten repair
branches. The daily process builds understanding and a verified repair queue.
The release process ships intentionally.

## 2. Use the system that already exists

Before changing anything, read: AGENTS.md, CLAUDE.md, memory/registry.yml,
memory/features/*, memory/context/*, memory/projects/golfhelm.md,
memory/glossary.md, docs/REPO_MAP.md,
docs/ai-system/helmv3-ai-codebase-intelligence.md, .claude/settings.json,
.claude/hooks/*, .claude/rules/*, src/lib/admin/feature-registry.ts,
package.json, vercel.json, .github/workflows/*.

The repo already has important infrastructure: `repo:doctor`, `knowledge:map`,
`knowledge:context`, `knowledge:check`, `knowledge:report`, `docs:check`,
`docs:schema-drift`, `docs:path-drift`, `preflight`, the vitest projects and
Playwright suites. Current Claude hooks already include SessionStart,
PreToolUse, PostToolUse, Stop.

The current Stop hook has already discovered an important limitation: when
multiple Claude sessions share a checkout, Git alone cannot reliably attribute
a new dirty file to a specific Claude session. Do not discard the existing
work. Fix the attribution model by recording session ownership at tool-use
time, where the Claude hook JSON contains session_id.

The repository also already acknowledges that there are duplicate generations
of GolfHelm feature documentation. Do not create a third one.

## 3. Install the master spec in the repo

This document lives at
`docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md`. It is not the
document that should be injected in full into every Claude session.

Create a compact operating entrypoint at
`memory/system/golfhelm-engineering-os.md` (approximately 100–250 lines)
containing only the rules future agents need constantly: source-of-truth
hierarchy; canonical feature registry; feature context workflow; memory update
rules; incident workflow; test/invariant requirements; daily audit rule;
release queue rule; ≤2 production deploys/week; risk levels; how to invoke the
relevant skills/scripts; links to the full design spec. The compact file is
the runtime operating contract. The long spec is architecture/reference.

## 4. Point the entire Claude stack at the operating system

**CLAUDE.md** keeps `@AGENTS.md`, then imports
`@memory/system/golfhelm-engineering-os.md`. Do not import the long-form spec
into every session. Near the top of CLAUDE.md add:

```markdown
## GolfHelm Engineering OS

GolfHelm and GolfHelm-facing CoachHelm work is governed by
`memory/system/golfhelm-engineering-os.md`.

For feature work:
1. resolve `memory/registry.yml`;
2. load mapped `memory/features/*` context;
3. operate against verified code/generated truth;
4. update feature memory/tests/history when behavior changes.

Daily reliability work never deploys production. Production releases are
owner-approved and limited by `config/release-policy.yml`.
```

**AGENTS.md** gets a short authoritative section immediately after Feature
Awareness:

```markdown
## GolfHelm Engineering Operating System

All agents working on GolfHelm or GolfHelm-facing CoachHelm code must operate
through `memory/system/golfhelm-engineering-os.md`.

`memory/registry.yml` is the semantic router.
`memory/features/*` is the canonical current-state feature corpus.
Generated/live/code truth outranks prose.

Production monitoring and production deployment are separate workflows.
A daily reliability run MUST NOT deploy production.
```

Pointers, not duplicates. One authority, many pointers.

**Path-scoped Claude rule** `.claude/rules/golfhelm-engineering-os.md` with
paths covering the actual verified GolfHelm/CoachHelm paths (audit first):
src/app/golf/**, src/components/golf/**, src/lib/golf/**,
src/lib/coachhelm/**, src/app/api/coachhelm/**, supabase/migrations/**,
memory/features/**, memory/registry.yml. Keep the rule short: map through the
registry before meaningful mutation, load canonical feature context, verify
against authoritative sources; after meaningful behavioral mutation update
current-state memory, append semantic history, update tests, preserve incident
evidence; daily operations cannot deploy production.

**Repo doctor** must verify mechanically: CLAUDE.md imports AGENTS.md;
CLAUDE.md imports golfhelm-engineering-os.md; AGENTS.md references the OS; the
compact OS exists; the long-form spec exists; memory/registry.yml exists;
required hook wiring exists; config/release-policy.yml exists; vercel
auto-deploy remains disabled; Claude cannot execute production deploy
commands. A future edit that silently disconnects Claude from the OS must
make repo doctor fail or warn loudly.

## 5. One canonical feature router

Audit and reconcile `memory/registry.yml` and
`src/lib/admin/feature-registry.ts`. The long-term invariant: one semantic
feature vocabulary. Prefer memory/registry.yml as the engineering/agent
canonical routing source. If the runtime registry needs runtime-only fields
(tier, heartbeat, primaryTable, healthSignal): preferred — generate the
overlapping portion from a canonical structured feature manifest; acceptable
interim — a deterministic cross-check proving the IDs and overlapping
ownership concepts do not drift. Add `npm run knowledge:registry-check` and
include it in knowledge:check, repo:doctor, CI. Do not allow
`calendar_events` to mean one feature in agent memory and something materially
different in Helm Bridge.

## 6. Feature docs are the canonical current-state memory

Canonical: `memory/features/<feature-id>.md`. Do not create
memory/features-v2, knowledge/features, or docs/canonical-features. Migrate
useful verified information out of memory/context/golfhelm-features.md into
per-feature docs; then make the monolith a generated index, a compatibility
pointer, or archived. No two manually-maintained current-state descriptions
of the same feature.

Per feature include: feature_id, status, criticality, last_verified_sha,
last_verified_at; Purpose; User Contract; Current Behavior; Invariants;
Primary Journeys; Architecture/Data Flow; Permissions/Tenancy; Dependencies;
Failure Modes; Observability Contract; Test Contract; Known Debt/Unknowns;
Incident History; ADR Links; Verification Evidence. Use generated blocks for
inventories; do not manually copy giant file/schema lists.

## 7. Memory layers

Use: memory/ledgers/changes/<feature-id>.md,
memory/ledgers/tests/<feature-id>.md,
memory/ledgers/operations/<feature-id>.md,
memory/incidents/<feature-id>/INC-….md, memory/decisions/ADR-….md,
memory/ledgers/deployments.md.

Do not write a daily repo commit simply to say "everything was healthy."
Healthy daily audit output remains an operational artifact/Bridge record.
Persist durable knowledge only when something meaningful happened: new
incident; new verified failure mode; new decision; repair; deployment; test
contract change; current product behavior change.

## 8. Fix Claude session attribution properly

Replace Git inference with event-time ownership recording. Create
`.claude/session-state/` (gitignored). Each active session gets
`.claude/session-state/<session_id>.json` with session_id, started_at,
loaded_features, context_files_read, touched_files, feature_ids_touched,
verification, memory_updates.

SessionStart initializes the session-state record using the actual hook
session_id and injects a small context message (OS active; canonical router;
canonical current state; daily audit may not deploy; release policy path). Do
not dump the whole OS into SessionStart output.

## 9. Record context loads

`.claude/hooks/record-context-load.mjs` on PostToolUse for relevant Read and
Bash calls. Reading `memory/features/<x>.md` records the feature as loaded;
running `npm run knowledge:context -- --files ...` records the features the
command resolved. Do not let Claude mark context "loaded" by writing a flag —
state comes from actual tool events.

## 10. Block feature code writes until context is loaded

`.claude/hooks/guard-feature-context.mjs` on PreToolUse → Write|Edit. For a
target file under the governed paths: map through memory/registry.yml to
feature_id(s); check session-state; if required feature context has not
actually been loaded, deny with the exact command/file to read. Do not block
harmless non-product docs, generated output written by its authorized
generator, or memory updates that are part of completing a loaded feature
task. If a file maps to multiple features, require all materially impacted
feature contexts or a verified shared-platform context.

## 11. Record touched files at edit time

`.claude/hooks/record-session-touch.mjs` on PostToolUse → Write|Edit, only
after successful writes. Record session_id, path, timestamp, mapped
feature_id(s). Do not later ask Git "who probably changed this" — the write
event already knows. Keep existing post-edit behavior; the PostToolUse stack
is: successful edit → record session-owned path → existing formatting/lint.

## 12. Rebuild the Stop gate around session-owned state

Preserve useful behavior from stop-verify.sh (loop safety, real exit codes,
build requirement for relevant 'use server' changes, RLS reminder, docs
check, no test weakening) but use session-owned touched files as the primary
attribution source. Before stopping verify: mapping (all meaningful touched
GolfHelm files feature-mapped; unmapped code mapped now or recorded as a
gap); context (relevant feature specs loaded before meaningful product
mutation); memory (for substantive behavior changes: canonical spec updated
if truth changed; semantic changelog appended; incident updated/created if
incident-driven; test contract updated if guarantees changed; ADR for
architecture decisions); verification (targeted regression test, neighboring
tests, required feature checks, preflight when appropriate, build when
required, RLS/integration when applicable).

Truly non-behavioral changes may use a structured no_memory_change_reason:
format-only; generated-file-refresh; test-only-no-contract-change;
comment-correction; mechanical-refactor-with-proven-equivalent-behavior. Do
not accept "not needed" without a reason.

## 13. CI backstop

The local hook is not the final gate. For every meaningful GolfHelm diff, CI
independently verifies: changed file → feature_id mapping exists; canonical
feature doc exists; mapped paths resolve; no new fake schema identifiers;
required memory layer exists for high-risk features; registry consistency
holds; feature-required tests resolve; behavioral-change memory contract is
satisfied where detectable. Use ratchets for existing debt; never raise
baselines to silence new violations.

## 14. Release policy: daily audit ≠ daily deploy

Create `config/release-policy.yml`:

```yaml
version: 1

production:
  routine_max_deploys_per_calendar_week: 2
  timezone: America/New_York

daily_reliability:
  may_observe: true
  may_investigate: true
  may_reproduce: true
  may_write_tests: true
  may_prepare_repairs: true
  may_open_or_update_repair_prs: true
  may_merge_verified_low_risk_repairs: true
  may_deploy_production: false

release:
  human_approval_required: true
  automatic_production_deploy: false
  deploy_from_verified_sha_only: true
  require_release_candidate_report: true
  require_production_budget_check: true

emergency:
  automatic_override: false
  owner_decision_required: true
```

Do not invent fixed deployment days unless the owner explicitly chooses them.
Two is a ceiling, not a target. If nothing meaningful is ready, deploy zero
times.

## 15. Enforce the deployment policy

Vercel automatic git deployment stays disabled — a hard repo-doctor/release
invariant. Daily Claude may read Vercel (logs, inspect, deployment metadata,
observability) but not `vercel deploy --prod`, promote, rollback, or
production env mutation. Add explicit production-deploy deny rules to
.claude/settings.json where the permission syntax safely supports them,
without breaking observability reads.

Preferred release mechanism: `.github/workflows/production-release.yml`,
workflow_dispatch only, protected by a GitHub environment named `production`
requiring owner approval. The workflow: accepts/resolves an exact candidate
SHA; runs the release budget check; verifies the SHA is on the release
lineage; runs/verifies required CI; generates the release report; waits for
environment approval; deploys exactly that SHA; records the Vercel deployment
ID; updates the release ledger; runs post-deploy smoke/health verification.
Claude may prepare/request this workflow; Claude cannot approve its own
production gate. If a protected environment is unavailable, the production
CLI invocation stays owner-run outside the daily routine.

## 16. Hard limit: two routine production deploys per week

`scripts/release/check-release-budget.mjs` + `npm run release:budget`. Read
production release history from the deployment ledger and cross-check against
live Vercel where available. Count deploys in the current America/New_York
calendar week; output deploys_this_week and routine_slots_remaining. At ≥2
the routine release workflow refuses to proceed.

Emergency behavior: never silently bypass. If a true P0 appears after two
releases: Claude investigates, prepares rollback/fix/mitigation, explains
risk, does NOT deploy; the owner explicitly decides whether the exceptional
situation warrants override. "P0" never converts into an automatic third
deploy.

## 17. The release queue

Not "open Sentry issues." Machine-readable state at
`memory/operations/release-queue.yml` (or a better existing operations
store). Entries are verified repair units, not raw telemetry: id, feature_id,
root_cause, incident_id, status, risk, sha, pr, regression_tests,
queued_for_release, first_seen. Allowed statuses: observed, triaging,
reproduced, repairing, verification_failed, verified, queued_for_release,
released, verified_in_production, blocked, wont_fix, expected, duplicate. A
raw Sentry event does not enter the release queue; a verified repair does.

## 18. Do not create an issue per event

Deduplicate before work-item creation. Primary identity: feature_id + stable
fingerprint + root cause/invariant class. Repeat occurrence → update count,
last_seen, evidence; no new issue. Multiple fingerprints, one proven root
cause → one incident, one repair unit, one PR when practical. Monitoring
defect → classify TELEMETRY_DEFECT, repair observability, no per-signal
product incidents. Expected/non-actionable → record classification only.
Confirmed unique product defect → only then create/update the durable
incident/work item.

## 19. PR strategy

One PR per verified root cause; or one feature-scoped repair batch only when
same feature, same invariant/failure family, same risk tier, coherently
reviewable. Never batch unrelated auth/RLS/payments/data-migrations/large AI
behavior changes because they share a release window. Merging to main does
not imply deployment; production remains on the last release SHA until the
train moves.

## 20. Main can move; production does not have to

Preserve the existing decoupling of merge-to-main from production deploy.
The daily system may create and merge verified low-risk improvements per
existing owner policy. Production stays pinned to the last deployed SHA; the
release candidate is a specific SHA on main; the release report explains
every commit between production and the candidate; one deployment ships the
verified candidate.

## 21. Release-candidate builder

`scripts/release/build-release-candidate.mjs` + `npm run release:prepare`.
Compare current production SHA to candidate main SHA; produce
`docs/releases/<candidate-sha>.md` (or generated artifact) reporting:
candidate SHA, current prod SHA, commits, PRs, features affected, incidents
fixed, known risks, R0–R3 changes, migrations, RLS changes, auth changes,
test evidence, CI evidence, unresolved incidents, release-queue items
included, rollback considerations, post-deploy checks. An R3 item is
highlighted and approval-gated.

## 22. Release readiness gate

`npm run release:check -- --sha <candidate>`. Fail closed if: budget
exhausted; candidate not fully identified; required CI not green; repo doctor
red; knowledge registry inconsistent; release report missing; unresolved
high-risk migration state; required memory updates missing; known P0
blocker; production deploy identity unestablishable. Warnings may exist for
acknowledged low-risk debt. No fake green.

## 23. Daily observability collector

Deterministic collector at `scripts/operations/daily-health/`. Reads, never
mutates: Vercel, Sentry, Helm Bridge, GitHub/CI. Outputs normalized JSON
(window, production {git_sha, vercel_deployment_id, sentry_release},
signals[] with feature_id, fingerprint, source, classification, first_seen,
last_seen, count, release_sha). Store large/raw telemetry outside Git
(Actions artifacts, Bridge DB, source IDs as evidence references). Do not
commit raw logs.

## 24. Daily Claude routine: observe and heal, never deploy

`.claude/skills/golfhelm-daily-reliability/SKILL.md`. May: read telemetry,
product memory, git history, code; reproduce bugs; write regression tests;
prepare fixes; run tests; update existing incidents; create genuinely-unique
incidents; prepare/update PRs; merge verified R0/R1 if owner policy permits;
update the release queue. May not: deploy production; promote; roll back;
apply production migrations; mutate production data; rotate secrets; change
release policy; bypass the release budget. Final output states: production
unchanged SHA; repairs queued; new actionable incidents; incidents updated;
no-action signals; release slots remaining.

## 25. No-change daily runs create no repo churn

0 new actionable incidents, 0 regressions, 0 changed health state, 0
memory-worthy discoveries → no issue, no PR, no commit, no deploy. The audit
result lives in run history/artifacts. Absence of a Git commit is not
failure; the goal is reliability, not activity generation.

## 26. Release routine: prepare, then require owner approval

`.claude/skills/golfhelm-release-manager/SKILL.md`, separate from the daily
audit: read production SHA; read main SHA; read release queue; calculate
budget; generate candidate; run readiness; identify risky changes; present
summary; request/trigger the owner-approved production workflow; observe
production after deploy; update the ledger; mark queued repairs released;
leave incidents open until post-deploy verification succeeds. If the
candidate is not ready, NO RELEASE is a valid successful outcome.

## 27. Post-deploy verification

One deploy → one structured verification pass: Vercel deployment healthy;
Sentry release active; new 5xx; new regressions; Bridge feature health;
targeted incidents stopped recurring; critical synthetic reads pass;
cron/job state healthy. For every included repair: expected production
invariant → actual post-deploy evidence. Only then released →
verified_in_production and incident → resolved. A merged PR is not
resolution; a successful Vercel deploy is not resolution; production
evidence is resolution.

## 28. Risk policy

R0 maintenance (generated docs, registry index repair, dead doc links,
semantic backfill): may be automated after deterministic verification.
R1 narrow low-risk repair: prepared daily, mergeable if owner policy allows,
waits for the release train; requires reproduction, regression test, small
blast radius, no auth/RLS/migration/destructive behavior, preflight,
verifier.
R2 product behavior (calendar/stats/CoachHelm output/workflow/notification
semantics): PR + owner approval + release train.
R3 privileged/high-blast-radius (migration, RLS, auth, secrets, billing,
destructive data, production fixtures, branch/deploy permissions): never
autonomous production mutation; Claude investigates and prepares; the owner
controls production action.

## 29. Observer / Healer / Verifier

`.claude/agents/golfhelm-observer.md` (read-only; maps evidence, builds
hypotheses), `golfhelm-healer.md` (works a confirmed/reproducible repair;
must load feature memory first), `golfhelm-verifier.md` (independently
checks root cause, regression test, scope, auth/data safety, memory
accuracy, release risk, signal hiding; may reject; does not rubber-stamp).

## 30. Feature context includes operations history

Context pack order: compact OS; registry entry; canonical current-state
spec; invariants; operations contract; test contract; unresolved/recent
incidents; recent semantic ledger entries; ADRs; current generated
schema/route facts; current code. Context first, code second.

## 31. Production signals use the same ID language

Standardize across structured logs, Sentry, Bridge: feature_id, operation,
environment, release_sha, deployment_id, fingerprint, request_id/trace_id,
severity. Sentry issue → feature_id → memory registry; Bridge fingerprint →
feature_id → same registry; Vercel route/function → operation/feature
mapping. The observer should not infer product area from a generic stack
trace when the application knows its operation.

## 32. Release SHA is the causal join key

Prefer Git SHA across GitHub, Vercel, Sentry, Bridge, the release ledger,
and incident timelines. The system must answer: last healthy production
SHA; first affected production SHA; what changed between them; which
features; which incidents began after it.

## 33. package.json commands

knowledge:feature, knowledge:registry-check, knowledge:session-check,
reliability:collect, reliability:report, release:status, release:budget,
release:prepare, release:check — adapted to existing conventions. Do not add
release:prod / deploy:prod to the routine allowlist; production mutation
stays behind the explicit release workflow / owner approval.

## 34. repo:doctor checks

ENGINEERING_OS_PRESENT; ENGINEERING_OS_IMPORTED_BY_CLAUDE;
ENGINEERING_OS_REFERENCED_BY_AGENTS; FEATURE_REGISTRY_CONSISTENT;
FEATURE_DOC_COVERAGE; CONTEXT_HOOK_PRESENT; SESSION_TOUCH_HOOK_PRESENT;
STOP_MEMORY_GATE_PRESENT; RELEASE_POLICY_PRESENT;
VERCEL_AUTO_DEPLOY_DISABLED; CLAUDE_PROD_DEPLOY_DENIED;
PRODUCTION_SHA_RESOLVABLE. Repo doctor makes it obvious if the self-healing
control plane is disconnected.

## 35. Tests for the control plane itself

Context gate: mapped file + not loaded → BLOCK; mapped + loaded → ALLOW;
unmapped GolfHelm file → BLOCK/explicit gap; non-Golf file → unaffected.
Session attribution: Session A touches calendar.ts, Session B touches
rounds.ts → each state contains only its own. Stop gate: behavior change +
no ledger → BLOCK; behavior change + no test evidence → BLOCK; nonbehavioral

+ valid reason → ALLOW. Release: 0/1/2 deployments → 2/1/0 slots; ≥2 →
routine deploy BLOCK; daily routine attempting prod deploy → BLOCK.
Registry: runtime ID missing from canonical vocabulary → FAIL; mapped doc
missing → FAIL.

## 36. Backfill history without blocking future work

After wiring is functional: audit all GolfHelm features; normalize canonical
docs; backfill semantic history; backfill major incidents; add
operations/test contracts. Prioritize round_tracking, calendar_events,
stats_analytics, auth_onboarding, roster_management, notifications, CoachHelm
engine, CoachHelm insights, admin/Helm Bridge. Do not require perfect
backfill before use; mark history_backfill: complete | partial | not_started
per feature. Current truth and future enforcement first.

## 37. How a future daily incident should work

Sentry: 3 new errors in checkScheduleConflicts, feature_id=calendar_events,
release_sha=AAA. Observer: fingerprint known? no → open incident for same
invariant? yes → UPDATE existing incident, not a new GitHub issue. Load the
calendar_events spec, invariants, ops/test contract, recent changes,
historical calendar incidents. Discover the candidate change; reproduce; add
regression test; fix; verifier approves; PR merges; release queue marks the
calendar fix verified. Production stays on AAA until the release window. Two
days later the candidate AAA → AAZ ships the calendar fix, two CoachHelm
fixes, one admin telemetry fix: one deploy, one post-deploy verification.

## 38. How a healthy day should work

03:00 observer runs; 03:03 collector complete; 03:05 correlation; 03:12 no
new actionable defects; 03:13 audit ends. Production unchanged; 0 PRs; 0
issues; 0 commits; 0 deployments. That is good. Do not optimize for visible
activity.

## 39. How a busy day should work

20 Sentry events may collapse to 3 fingerprints, 2 root causes, 1 expected
condition → approximately 2 incidents, 1 existing incident updated, 1–2
repair PRs, 0 production deploys. Not 20 issues, 20 PRs, 20 deploys.

## 40. How release day should work

Release manager: production SHA → main candidate SHA → release queue →
budget → all CI/memory/risk checks → candidate report → owner approval → one
deployment → post-deploy observer → close only proven incidents. Eight
verified repair items can ship in one candidate if compatible and fully
tested; the report makes the combined blast radius legible.

## 41. Do not let memory become another source of confusion

Hierarchy: LIVE/GENERATED/CURRENT CODE → CANONICAL FEATURE MEMORY → SEMANTIC
HISTORY → AGENT CONVENIENCE MEMORY. If a feature doc names a table the
generated schema says does not exist, the doc is wrong. Fix the doc. Never
modify production to match stale documentation.

## 42. Do not let self-healing hide errors

Reject fixes that: change error → []; change unknown → healthy; downgrade
severity to clean dashboards; mark resolved without evidence; raise a
lint/test baseline; disable monitoring; remove a failing test; suppress an
exception; loosen RLS/auth; delete telemetry — unless a specific verified
product decision supports it. The system must produce more accurate truth,
not quieter dashboards.

## 43. Final required repo connections

CLAUDE.md → imports AGENTS.md → points to
memory/system/golfhelm-engineering-os.md → points to this spec → uses
memory/registry.yml → routes to memory/features/<feature>.md → connects
changes/tests/operations/incidents/ADRs.

.claude/settings.json: SessionStart initializes system + session;
PostToolUse(Read/Bash) records context loads; PreToolUse(Edit/Write) runs
the feature-context gate; PostToolUse(Edit/Write) records the session-owned
touched-file ledger; Stop runs the memory + verification gate.

CI: feature mapping, registry consistency, doc/schema/path drift, memory
contract, tests.

Vercel/Sentry/Bridge/GitHub → normalized daily collector → observer →
incident/repair → release queue → release candidate → max-two-per-week
budget → owner approval → production deploy → post-deploy verification →
deployment ledger + incident state.

## 44. Proof before you stop

Test 1 automatic awareness: a fresh session's initial context includes the
OS pointer without manual explanation. Test 2 context gate: editing a mapped
file without its feature context blocks; after reading it, allows. Test 3
session ownership: two session IDs touching two files each own only their
own. Test 4 memory completion: behavioral fixture change with no semantic
history blocks at Stop; with required memory/test evidence, passes. Test 5
deployment isolation: the daily reliability process has no path that
executes production deployment. Test 6 release budget: with 2 recorded
deployments this week, normal release blocks. Test 7 issue dedup: duplicate
fingerprints update one incident, not several issues. Test 8 historical
routing: from a known historical incident's feature/fingerprint, the system
retrieves feature, invariants, history, tests, code without repo-wide random
searching. Test 9 current repo gates: repo:doctor, knowledge:check,
docs:check, preflight, npm test plus new control-plane tests, with exact
exit codes.

## 45. Final report

Return the wiring-complete report: canonical entry point; files added;
files modified; feature registry coverage; hook wiring; parallel session
attribution; daily reliability wiring; Vercel/Sentry/Bridge correlation;
incident deduplication; repair queue; release queue; production release
policy (daily deploy NO; routine max/week 2; owner approval YES; automatic
deploy NO); CI backstops; historical backfill; verification performed; proof
tests; remaining gaps. Do not say "wired" because files exist; prove the
path works end to end.

## 46. Owner intent — do not optimize this away

> GolfHelm should learn every day without shipping every day.
>
> Claude should look at Vercel, Sentry, Helm Bridge and CI every day,
> understand problems through the feature memory, fix what is appropriate,
> update what the product has learned, and build a verified queue.
>
> Production should remain stable and move deliberately, no more than twice
> per week under the routine process.
>
> A thousand error events should become a small number of understood root
> causes, not a thousand tickets.
>
> Claude should not point at random files and random database objects every
> time something breaks. It should know the feature, its invariants, its
> architecture, its tests, its recent changes, and its prior failures before
> it changes code.
>
> The system should continuously improve its own understanding of GolfHelm
> while keeping release control human, legible, and boring.
