<!-- markdownlint-disable MD013 -->
# Feature: Helm Judgment Layer

> Added 2026-09-17. One reusable subsystem — evidence compiler → Jev (TypeSafe
> System One) typed judgment → deterministic policy → private audit row —
> that several use cases share. Jev judges; it never executes fixes, closes
> incidents, rolls anything back, or sits in a player-critical request path.

## Status

- active — every use case in **shadow** (`resolveMode` in
  `src/lib/ai/judgment/policy.ts`; `PROMOTED_MODE` is empty). Production
  flags are off, so production makes zero provider calls.

## Current State

- Provider: `src/lib/typesafe/client.ts` (direct `api.typesafe.ai`,
  `TYPESAFE_API_KEY`, model `jev-latest`). `jev-provider.ts` is the only
  module that sees SDK answer shapes; it normalizes them to
  `NormalizedAnswer` (`noul` → `{p}`, `choice` → `{choice, confidence,
  probabilities}`, `score` → `{score, confidence, probabilities}`).
  Not Vercel AI Gateway: the installed `ai` SDK (7.0.79) predates
  `experimental_evaluate` (7.0.105+), and the gateway account has previously
  served silent template fallbacks (`src/lib/ai/model-provider.ts`).
  Swapping the transport is a one-file change.
- Entry point: `runJudgment(request)` (`evaluator.ts`). Flag off ⇒
  `unassessed` + `mode_off`, no call. Redacts the state (`redact.ts`:
  person/secret keys dropped, emails/phones/JWTs/tokens masked, bounded
  depth/length), hashes it (`hashing.ts`), asks, applies the use case's
  `applyPolicy`, persists, records telemetry. Provider or policy failure ⇒
  `unassessed`, never `pass`. Nothing throws into the caller.
- Precedence, everywhere (`resolveDisposition`): P0 `facts.hardInvariantFailed`
  ⇒ `escalate` from code, the judgment only adds reason codes; P1
  `facts.softFindings` (gaps code sees but cannot settle) ⇒ a policy may not
  `pass`; P2 the judgment; P3 reasoning model; P4 owner.
- Persistence: `helm_debug.judgment_evaluations` + `judgment_labels` through
  service-role-only facades (`helm_debug_record_judgment(jsonb)`,
  `_label_judgment`, `_list_judgments`, `_get_judgment`,
  `_prune_judgments()`), migration `20260917090000_helm_judgment_evaluations.sql`
  — **HELD (R3)** in `supabase/migrations/HELD.md`, applied and pgTAP-verified
  on the local stack only (`supabase/tests/rls/helm_judgment.sql`). Until the
  owner applies it, `persistence.ts` logs `helm.judgment.persist_failed` at
  warning and the judgment still returns. After apply: regenerate
  `src/lib/types/database.ts` and call `helm_debug_prune_judgments()` from
  `/api/cron/db-observability-prune`. Stored per row: evaluator + policy
  version, mode, sha256 of the redacted state (never the state), allowlisted
  `evidence_summary`, normalized answers, disposition, reason codes,
  duration, provider error code, salted `entity_key_hash`.
- Telemetry: `logServerEvent` under `helm.judgment.call|error|unassessed`
  with use_case / versions / mode / disposition dimensions — never player or
  team ids.
- Flags (`config/feature-flags.yml`): master `jev_judgment_layer` plus
  `jev_shot_trace`, `jev_bug_triage`, and reserved
  `jev_semantic_regression`, `jev_coachhelm_insight_quality`,
  `jev_self_heal_router`, `jev_release_canary`, `jev_state_integrity`.
  The claim-honesty sweep keeps `typesafe_judgments`.

## Use cases wired

- **Shot-trace judge** (`use-cases/shot-trace.ts`, `evidence/shot-ledger.ts`).
  `compileShotTraceEvidence` recomputes required/observed/missing step facts
  from the detail RPC's step rows (never `trace_runs.observed_step_count` /
  `missing_required_step_count`), reads the `verify.*` expected/actual
  counts, detects fallback/conflict/retry paths, and validates a supplied
  shot ledger (contiguous shot numbers per hole, legal units, non-negative
  distances, holed shot last). Hard invariants: success with a failed
  required step (except the documented `db.direct_submit_fallback` rescue),
  a `verify.shots`/`verify.holes` mismatch, any ledger violation. Soft
  findings: required step missing, warnings, downgrade, recovery path, loud
  failure. `shouldJudgeTrace` picks failures, warnings, missing required
  steps, verification mismatches, recovery paths and a deterministic 1-in-50
  clean sample. Surfaces: the collapsed **Judgment** panel on
  `/admin/traces` (`TraceJudgmentPanel.tsx`, on demand via
  `bridgeJudgeFlightTrace`, evidence first, versions and shadow shown,
  `unassessed` said out loud) and `npm run judgment:shot-traces`
  (`--fixtures` default, `--live --limit N` through the tracer facades,
  `--persist` to record). Never runs from `golf.ts`.
- **Bug-triage judge** (`use-cases/bug-triage.ts`). After `buildTriagePlan`
  in `/api/cron/selfheal-triage`, judges the queue groups (bounded by the
  same analysis cap) in shadow: actionable / user-visible / regression /
  duplicate / immediate RCA / more evidence, a 5-level priority score and a
  failure domain. Critical severity, RLS/permission, data-loss and
  integrity text escalate deterministically before Jev. The plan's queue,
  closeable set and RCA calls are untouched.
- **Claim honesty** (`scripts/typesafe/honesty-sweep.ts`, use case id
  `claim_honesty`) — documented in `memory/features/coachhelm-ai.md`; it is
  the one that has found prose bugs.

## Calibration

- Fixtures: `evals/judgment/{shot-trace,bug-triage}/*.json` (invented from
  schema shapes; never production rows). `npm run judgment:calibrate`
  writes `artifacts/judgment/calibration.{json,md}`: confusion matrix,
  escalation precision/recall, false negatives by name, provider failures,
  latency median/p95; `--strict` exits 1 on a wrong case.
- `evals/judgment/evaluator-versions.json` pins a hash of each question set;
  `__tests__/calibration.test.ts` fails when questions change without a
  version bump or a fixture directory shrinks.
- 2026-09-17 first run (20 cases): the initial shot-trace phrasing put every
  clean trace in `collect_more_evidence` (`more_evidence_required` ≈ 80% on
  traces with nothing unsettled) and code escalated the fallback-rescue
  path as a contradiction. Fixed in `shot-trace:v2` / `shot-trace-policy:v2`
  (questions conditional on a gap, clean gate, loud-failure rule, rescue
  exemption) and `bug-triage-policy:v2` (thin evidence beats "immediate"
  unless priority is critical). Result: 16 exact, 4 acceptable, 0 wrong on
  20 **invented** cases written by the same hand as the policy — this
  measures fit to the fixtures, not calibration. No labelled production
  case exists yet, so no use case is near the enforcement bar. The four
  `acceptable` cases (verify read-back failed, blind downgrade, qualifier
  transition missing, fallback rescue) are where the remaining signal is:
  e.g. for the missing qualifier transition the compiler correctly lists
  `post.qualifier_transition` in `required_missing` and the P1 rule holds
  it at `observe`, while Jev's `requires_replay` sits at 59% against a 60%
  threshold. Median latency ~200 ms.
- Enforcement bar (any use case): labelled cases from the real workflow,
  measured precision at the chosen threshold, false negatives reviewed by a
  person, kill switch and provider-outage behaviour tested. Recommended
  order: bug-triage routing → shot-trace escalation → the rest.

## Business Rules

- Deterministic checks first; if code can prove it, Jev is not asked.
- A judgment never overrides a hard invariant, never suppresses a critical /
  security / data-loss signal, never executes a repair or rollback.
- `unassessed` is not `pass`. Callers in shadow read `result.shadow` and
  change nothing.
- No PII, credentials, raw rows or free-text notes in provider state; ids
  are hashed before persistence.
- One provider adapter. New use cases add a module under `use-cases/` with
  `buildEvidence` / questions / `applyPolicy`, a fixture directory, and a
  pinned evaluator version — not a second client.

## Tests To Prefer

- `npx vitest run --project unit src/lib/ai/judgment` (evaluator, policy
  precedence, redaction, hashing, ledger validator, both policies, version
  guard).
- `supabase/tests/rls/helm_judgment.sql` via `npm run test:rls` (local stack).
- `npm run judgment:calibrate` (network + key) before changing a question
  set or threshold.

## Related Docs

- `memory/features/coachhelm-ai.md` (TypeSafe shadow judgments, claim-honesty sweep)
- `memory/features/admin-selfheal.md` (triage cron)
- `memory/features/shot-tracking.md` (flight recorder)
- `docs/ai-system/FEATURE_FLAGS.md`
