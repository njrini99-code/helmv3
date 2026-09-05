<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Feature: Admin Self-Heal

> Carved out of `memory/features/admin-platform.md` 2026-09-02 as part of the
> `admin_platform` registry granularity split (ADR-2026-09-03-control-plane-
> owner-decisions, memory/decisions/ — on the parallel Bridge control-plane
> session's branch, not yet on this branch — closing OWNER DECISION
> `ADMIN_PLATFORM_REGISTRY_GRANULARITY`). `admin_platform` remains the shared
> Bridge shell; this doc owns the Diagnose/Repair/Close stages of the
> self-healing loop and `/admin/self-heal`. See also `memory/features/
> admin-reliability-collector.md` (Collect, upstream of Diagnose) and
> `memory/features/admin-incidents.md` (the incidents this loop acts on and
> whose lifecycle `selfheal-flow.ts` reads).

## Status

- active

## Current State

Admin Self-Heal is three of the four stages of the self-healing loop —
Diagnose, Repair, Close — plus `/admin/self-heal`, the circuit board that
answers "is the loop alive, and has each stage ever actually produced its
output" (distinct from `/admin/jobs`, which answers "did the crons run").

```text
Collect (admin_reliability_collector, Vercel cron, 3h)
  -> Diagnose (Vercel cron, 6h, since 2026-09-02 — moved off an
     Anthropic-hosted cloud routine)
  -> Repair (GitHub Actions, .github/workflows/selfheal-repair.yml,
     06:40 UTC daily — opens a PR, never merges/deploys)
  -> Close (Vercel cron log-retention -> auto-resolve.ts)
```

**Repair runs as a GitHub Actions workflow only, as of 2026-09-05.** It
previously also ran as a launchd agent on the owner's Mac
(`com.helm.bridge-rca-repair`) in parallel with the GHA workflow — a live
duplicate-effort risk (two separately-billed agent sessions per day, each
capable of opening a PR against the same backlog, with no cross-runner
concurrency control). The launchd agent and its supporting scripts were all
removed in the same change that closed that duplication — `scripts/run-selfheal-repair.mjs` no longer exists, `scripts/lib/selfheal-repair-runner.mjs` no longer exists, `scripts/selfheal-repair-install.sh` no longer exists, `scripts/selfheal-repair-doctor.mjs` no longer exists, and `config/launchd/**` no longer exists.
The plist is archived outside the repo, in
`~/.claude/backups/reset-2026-09-05` on the
owner's machine, for anyone who needs to see exactly what ran before.

## Primary Entry Points

### Routes

- `src/app/admin/self-heal/**` — the self-healing circuit board.

### API

- `src/app/api/cron/selfheal-triage/**` — the Diagnose stage, moved here from
  an Anthropic-hosted cloud routine (2026-09-02). Cadence 6 hours, heartbeat
  `job_type = 'selfheal-triage'` written by the route directly (not through
  `recordJobRun`, which keeps only top-level scalars and would silently drop
  `sourceHealth`/`queue`) — a SEPARATE, unregistered `recordJobRun` call
  wraps the handler purely for crash-safety, mirroring `log-retention`'s
  two-job-type split for the same reason.
- `src/app/api/cron/log-retention/**` — the Close stage, via `auto-resolve.ts`.

### Actions

- `src/app/admin/actions/triage.ts` — the triage trigger action.

### Services

- `src/lib/admin/selfheal-registry.ts` (`SELFHEAL_STAGES`),
  `selfheal-capability.ts` (`CapabilityState`), `selfheal-provenance.ts`,
  `selfheal-flow.ts` (STALLED detection).
- `src/lib/admin/rca.ts`, `rca-category.ts`, `rca-run.ts` — the analyzer core.
  `rca-run.ts` is shared with the super-admin `analyzeErrorFingerprint`
  server action (`admin_incidents`'s `analyze-error.ts`), factored out from
  behind that action's `requireSuperAdmin()` gate.
- `src/lib/admin/triage-collect.ts`, `triage-apply.ts` — collection/apply core
  shared with the `npm run triage` CLI (`scripts/run-triage.ts`, now a thin
  wrapper over both).
- `src/lib/admin/auto-resolve.ts` — the Close stage's nightly auto-resolution.
- `.github/workflows/selfheal-repair.yml` — the Repair stage's ONLY runner as
  of 2026-09-05. Invokes the Claude Code CLI directly (not
  `anthropics/claude-code-action`, which is trigger-driven and skips
  everything on a `schedule`/`workflow_dispatch` event) following
  `docs/ai-system/selfheal/repair-contract.md`. The launchd agent and its
  supporting scripts this replaced are gone — see the Current State section
  above.
- `src/lib/admin/ensemble/verification-ensemble.ts` (2026-09-03,
  control-plane plan §6 J remainder) — `runVerificationEnsemble`, a
  REPRODUCER→HEALER→{ADVERSARY, conditional SECURITY, PRODUCT}→JUDGE
  multi-pass review over an already-produced `RcaAnalysis`, default OFF via
  the `verification_ensemble` flag (`config/feature-flags.yml`) and
  provably inert when off (zero `generateObject` calls). Never called
  automatically by the Diagnose cron — invoked explicitly, on demand.
- `src/lib/admin/causal/causal-score.ts` — `computeCausalScore`, evidence-
  weighted causal confidence (wraps `release-context.ts`'s
  `classifyReleaseRelationship` as one of four components, capped at 0.95,
  `'unknown'` when no component has evidence).
- `src/lib/admin/causal/incident-similarity.ts` — `findSimilarIncidents`,
  reuses `src/lib/admin/incidents/aliases.ts`'s `classifyMergeConfidence`
  pairwise against a corpus of structurally-fingerprinted incident facts.
- `src/lib/admin/autonomy/policy.ts` — `computeFeatureAutonomy`, per
  `feature_id × repair_class` autonomy tier, extending
  `selfheal-capability.ts`'s `CapabilityState`; capped by a hardcoded
  `AUTONOMY_CEILING` constant it can never exceed, force-demoted to
  `observe_only` on any recorded recurrence or verification failure.

## Core Data

- `background_job_logs` — `selfheal-triage` and `log-retention` heartbeat rows
  drive `SELFHEAL_STAGES`' runtime/capability read.
- GitHub PRs and branches (`fix/rca-<fingerprint>`) — Repair's output, joined
  live rather than stored (see Business Rules below).

## Business Rules

- **Auto-resolution requires a production DEPLOY after the last occurrence, not
  merely silence.** A nightly cron is silent 23 hours a day and a seasonal
  feature for months. When the deploy timestamp is unreadable, nothing is
  auto-resolved and the plan states why. The cron's inference never overwrites
  an operator's `manual` resolution.
- **Repair state is joined from GitHub, never stored.** A repair PR names its
  incident through the two markers `docs/ai-system/selfheal/repair-contract.md`
  already mandates: the `/admin/errors/<fp>` body link (STEP 5, into
  `admin_incidents`) and the `fix/rca-<fp>` branch (STEP 4). Both are scanned,
  because the Bridge reads PRs through GitHub's SEARCH endpoint, which returns
  the body but not `head.ref`, while the list-pulls fallback returns the ref.
  A failed GitHub read makes repair state `unknown`, never `none` — reporting
  an unreachable API as an empty queue re-queues work that is already sitting
  in a branch.
- **Diagnose is a Vercel cron, not a cloud routine, as of 2026-09-02.**
  `SELFHEAL_STAGES.triage.runner` is `'vercel-cron'`
  (`src/lib/admin/selfheal-registry.ts`), cadence 6 hours. The route reuses
  `triage-collect.ts`/`triage-apply.ts` (the same modules `npm run triage`
  wraps) and `rca-run.ts` (the same analyzer `analyzeErrorFingerprint` calls).
  It auto-resolves only what `triage-contract.md` STEP 4 allows, and —
  because a Vercel function has no git checkout — never resolves a
  SHA-bearing "ALREADY FIXED" claim itself; that case is left analysed-but-open
  for `auto-resolve.ts`'s nightly Rule A or a human/`npm run triage` run. A
  fingerprint carrying a provider-fault (an Inngest/AI-account credential
  fault, say) is never auto-resolved even when a model mis-categorises it,
  because the guard re-classifies the member's own message text
  (`classifyProviderFault`) in addition to reading a stored `errorCode` —
  three of the four production "Inngest signature" fingerprints carry no
  persisted `errorCode` at all, so the stored-code check alone would miss
  them.
- **Runtime health and capability proof are separate facts for every
  self-healing stage.** A stage can heartbeat healthily for a week while never
  once producing its output; on 2026-08-28 Repair's heartbeats were green and
  it had never completed a PR-opening run. `selfheal-capability.ts` derives
  capability from mechanical evidence (signals collected, analyses written,
  repair PRs opened, auto-resolutions recorded) and a `null` count means the
  read failed, so capability is `unknown` — never `unproven`. A loop whose
  runtime is `ok` and whose capability is `unproven` must never render as
  healthy.
- **A heartbeat's free text is not necessarily an error, and a heartbeat row is
  not necessarily a stage run.** `background_job_logs.error_message` is the only
  free-text column a stage has, so a run that SUCCEEDS and wants to explain
  itself writes there; `data/selfheal.ts` and `data/jobs.ts` therefore split it
  into `lastError` (only when the run classified `failed` or `degraded`) and
  `lastNote`. The table is also open — a human at a psql prompt produces
  `status = 'completed'` exactly like a stage does — so
  `selfheal-provenance.ts` classifies each run as `autonomous`,
  `operator-assisted` or `instrument-probe` from the strings the runs recorded,
  and carries the basis with the verdict. An unrecognised shape degrades to
  `autonomous` with a null basis and renders NO chip: the classifier detects a
  run that ANNOUNCED human involvement and cannot detect one that stayed quiet.
- **Late is not overdue.** `classifyCronStatus` only calls a stage overdue at
  `cadenceMinutes * 1.5`, measured from `started_at`. `SelfHealStageDetail`
  carries `overdueAt` so the view stops re-deriving that multiplier, and
  `deriveSchedulePosition` draws the window the classifier actually measures —
  a stage past its expected time but short of the threshold reads "late by 4h,
  not yet overdue" rather than as a bare past timestamp under "Next expected".
- **The self-healing loop has THREE axes, and throughput is the one a
  heartbeat cannot show.** Runtime (`selfheal-registry.ts`: is each stage on
  schedule) and capability (`selfheal-capability.ts`: has it ever produced its
  output) were both green on a loop that skipped the same incident every
  night. `src/lib/admin/selfheal-flow.ts` (2026-09-01) places every incident
  on the board at the stage whose turn it is, from the lifecycle
  `admin_incidents`'s `lifecycle.ts` already derived, and calls it STALLED
  once that stage has had `STALL_CYCLES` (2) of its own registry cadence to
  act and has not. Three rules: a failed read (`repair.status === 'unknown'`,
  an unreadable deploy, a blind source) places the incident at `unknown` and
  can never stall a stage; the threshold is the stage's cadence from
  `SELFHEAL_STAGES`, never a literal; an active stage (`repairing`) is never
  stalled. Close's wait starts when silence became proof — deploy time plus
  `PRODUCTION_PROOF_WINDOW_MS` — not at the deploy. The model reaches four
  surfaces from one function: the `stalled` lens on the Errors tab (owned by
  `admin_incidents`, judged against `computedAt`, never `Date.now()`), the
  `stage-stalled` attention reason (ranked after `repair-ci-failed`, before
  `repairable-untouched`, because "Repair had its chances" is the stronger
  fact about the same incident), the Truth Strip's self-heal cell (a stall
  escalates `ok`/`warning` to `N STALLED`; it never softens `danger`/
  `unknown`), and the per-stage backlog strip on the Overview and the
  Self-heal page. Counts only on the Overview: a stalled incident already
  earns its attention row, and a third list is the split this read model
  exists to remove.
- **Historical: the Repair stage used to run as a launchd agent on the
  owner's Mac, retired 2026-09-05.** `config/launchd/com.helm.bridge-rca-repair.plist`,
  its outer bounded-runner (`scripts/run-selfheal-repair.mjs`,
  `scripts/lib/selfheal-repair-runner.mjs`), and its install/doctor tooling
  (`npm run selfheal:repair:install`/`:doctor`) are gone from the repo — the
  plist is archived outside it, in `~/.claude/backups/reset-2026-09-05` on
  the owner's machine. They existed to solve problems specific to running an
  unattended agent on a laptop (a frontmatter argument trap that made `claude
  -p` exit in 0.6s having written nothing, secret redaction on a fallback
  heartbeat, byte-for-byte plist verification) that do not apply to the GHA
  runner replacing it — GitHub Actions' own scheduler, secrets, and
  `if: always()` step semantics cover the same ground natively.

## Known Behaviour

- **The loop is three stages in three different places, and each stage's
  contract lives in the repo (`docs/ai-system/selfheal/`), not in routine
  configuration.** Diagnose is a daily cloud routine that reads unresolved
  fingerprints, groups by root cause, and resolves what it proves already
  fixed or not a defect; Repair is a scheduled local agent that opens
  verified PRs and never merges or deploys; Close is the `log-retention`
  cron calling `autoResolveFixedIncidents()`. Each stage writes a heartbeat
  into `background_job_logs` (`selfheal-triage`/`selfheal-repair`/
  `log-retention`), rendered on `/admin/self-heal` via
  `src/lib/admin/selfheal-registry.ts` — a stage that stops goes overdue
  there. Two of the three runners are outside the Vercel deployment, so the
  heartbeat is the only evidence they actually ran; a runner can be
  installed-but-never-started with nothing anywhere saying so. Before
  believing the loop ran, check the heartbeat, not the absence of errors.
  Two agent contracts handing off through a free-text field (rather than a
  shared function in code) is exactly the failure class this architecture
  exists to avoid — see the vocabulary note below. (STU, source:
  `selfheal-loop-architecture.md`, no date field; verified 2026-09-05 that
  `docs/ai-system/selfheal/`, `src/lib/admin/selfheal-registry.ts` and
  `src/lib/admin/rca.ts` all exist.)
- **A category derived by matching free text a model wrote is a lookup
  table calibrated against imagined values.** Two agent routines once handed
  off on the prefix a `suggestedFix` string opened with (`'FIX HERE'` etc.);
  measured against production, most analyses opened with free prose instead
  of the expected prefixes, and a `LIKE` filter matching almost nothing
  looked identical to a clean, fully-repaired queue — neither side errored.
  The fix that held: the shared vocabulary is a function in code
  (`deriveRcaCategory` in `src/lib/admin/rca.ts`) that both sides import,
  with an explicit `uncategorized` bucket that is rendered, never dropped.
  Whenever two systems hand off through a string one side writes freely,
  ask what happens when the writer paraphrases — if the answer is "the
  reader sees nothing", that is a silent-loss bug. (STU, source:
  `agent-handoff-vocabulary-must-be-code.md`, no date field; verified
  2026-09-05 that `deriveRcaCategory` exists in `src/lib/admin/rca.ts`.)
- **Resolving an incident is two writes, and only the second one remembers
  it happened.** `UPDATE admin_events SET resolved = true` is per-row and
  only hides what exists now; the fingerprint-level memory is
  `admin_error_resolutions` (written by `admin_resolve_error_fingerprint`/
  `admin_auto_resolve_error_fingerprint`, both present in
  `src/lib/types/database.ts`'s RPC list, and read back by
  `admin_unresolve_error_fingerprint`). A bare row-level resolve with no
  ledger write means the next occurrence of the same fingerprint arrives as
  a brand-new unresolved row with no memory anything was ever fixed —
  indistinguishable from a bug nobody has seen, which erases the most
  valuable signal this system produces (a genuine regression). Never resolve
  an incident with the bare UPDATE alone. (STU, source:
  `resolution-ledger-is-the-regression-memory.md`, no date field.)

## UI Contract

- `/admin/self-heal` renders `SELFHEAL_STAGES`' runtime AND capability
  distinctly per stage — never collapsed into one healthy/unhealthy value —
  plus the STALLED backlog strip. Admin surfaces stay dense and operational
  rather than marketing-style, per the shared shell's UI contract.

## Tests To Prefer

- `src/app/api/cron/selfheal-triage/__tests__/route.test.ts`
- `src/app/api/cron/log-retention/__tests__/route.test.ts`
- `src/lib/admin/ensemble/__tests__/verification-ensemble.test.ts`,
  `src/lib/admin/causal/__tests__/causal-score.test.ts`,
  `src/lib/admin/causal/__tests__/incident-similarity.test.ts`,
  `src/lib/admin/autonomy/__tests__/policy.test.ts`.
- Typecheck/build for admin UI changes.

## Related Docs

- `docs/ai-system/selfheal/README.md`
- `docs/ai-system/selfheal/repair-contract.md`
- `docs/ai-system/selfheal/triage-contract.md`
- `docs/ai-system/selfheal/STATE-2026-08-28.md`
- `memory/features/admin-platform.md` — the shared shell this entry was
  carved from.
- `memory/features/admin-reliability-collector.md` — Collect, upstream of
  Diagnose.
- `memory/features/admin-incidents.md` — the incidents this loop acts on.
