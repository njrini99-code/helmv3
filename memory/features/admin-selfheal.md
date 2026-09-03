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
  -> Repair (launchd agent on the owner's Mac, com.helm.bridge-rca-repair,
     06:40 ET daily — opens a PR, never merges/deploys)
  -> Close (Vercel cron log-retention -> auto-resolve.ts)
```

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
- `scripts/run-selfheal-repair.mjs`, `scripts/lib/selfheal-repair-runner.mjs`,
  `scripts/selfheal-repair-install.sh`, `scripts/selfheal-repair-doctor.mjs`,
  `config/launchd/**` — the Repair stage's outer runner and launchd install.
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
- **The Repair stage's launchd config is tracked in the repo, not only on the
  owner's Mac.** `config/launchd/com.helm.bridge-rca-repair.plist` is the
  source of truth for `~/Library/LaunchAgents/com.helm.bridge-rca-repair.plist`;
  `npm run selfheal:repair:install` installs/reloads it and
  `npm run selfheal:repair:doctor` checks it end to end — installed and
  byte-identical to the repo copy, loaded (`launchctl print`), the env file's
  variable names present, the `claude` binary and prompt file resolve, the
  `-p` argument does not start with `-` or `$(`, and the newest production
  `selfheal-repair` heartbeat is fresh (<26h) and not a runner failure. This
  closes the 2026-09-02 fire that failed in 0.6s: the plist passed SKILL.md's
  raw YAML-frontmatter text as `claude -p`'s argument and the CLI parsed the
  leading `---` as an unknown option, exiting before writing anything. The
  outer runner (`scripts/run-selfheal-repair.mjs`) now pipes the child's
  stdout/stderr (forwarding every byte to its own stdout/stderr in real time,
  so the plist's `>> log 2>&1` still sees the same output) and, on a
  runner-level failure, redacts and truncates (`redactSecrets`/`truncateTail`
  in `scripts/lib/selfheal-repair-runner.mjs`) the child's last ~4KB into the
  fallback heartbeat's `metadata.child_output_tail`, so a future failure like
  this one explains itself on `/admin/self-heal` instead of reading only
  "child exited 1". A static vitest
  (`src/test/scripts/selfheal-repair-launchd.test.ts`) parses every plist
  under `config/launchd/**` and fails if the `-p` argument trap, a missing
  `--strict-mcp-config`, or a wrong `--mcp-config` target ever regresses.
  `redactSecrets`'s per-pattern replacement is keyed on an explicit
  `keyGroup` flag stored on each `SECRET_PATTERNS` entry, not inferred from
  whether the replace callback's second argument is truthy — a zero-capture
  pattern's second callback argument is `String.replace`'s numeric match
  OFFSET, not a capture group, and treating it as one produced a mangled
  `"<offset>=[REDACTED]"` for any secret not located at index 0 of the
  matched text.

## UI Contract

- `/admin/self-heal` renders `SELFHEAL_STAGES`' runtime AND capability
  distinctly per stage — never collapsed into one healthy/unhealthy value —
  plus the STALLED backlog strip. Admin surfaces stay dense and operational
  rather than marketing-style, per the shared shell's UI contract.

## Tests To Prefer

- `src/test/scripts/run-selfheal-repair.test.ts`
- `src/test/scripts/selfheal-repair-launchd.test.ts`
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
