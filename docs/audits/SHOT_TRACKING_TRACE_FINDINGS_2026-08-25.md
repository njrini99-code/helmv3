# Shot Tracking Flight Recorder Findings — 2026-08-25

## Scope and safety

This audit was run on the local Docker/Supabase stack from the current task
branch. It did not read or mutate production data, deploy, commit, or push.
Tracing is intentionally fail-open: an unavailable trace store cannot affect a
round save or submit.

## Architecture implemented

| Channel | Purpose | Rollback behavior |
| --- | --- | --- |
| Sentry business span and Helm trace ID | Cross-layer correlation and existing incident linkage | Independent of the database transaction |
| `helm_debug.trace_runs` / `trace_steps` | Private Trace Explorer data | Written through service-role-only facade calls outside the business RPC |
| `HELM_TRACE` Postgres logs | Checkpoints inside atomic functions | Survives rollback |
| RPC exception checkpoint | Preserves original SQLSTATE/message plus last logical database step in the log stream | Re-raises the original database error |
| Read-only verifier | Compares expected and persisted round/hole/shot state after success | Detects a success response that did not produce expected state |

The private schema is not exposed through PostgREST. Public wrappers have
execution revoked from `anon` and `authenticated` and granted only to
`service_role`; the admin Explorer also requires the existing super-admin gate.

## Execution graph discovered

```text
Round entry / Continue Round
  -> savePartialRound or submitGolfRoundComprehensive
  -> Zod validation -> Supabase auth -> golf_players resolution
  -> save_partial_round_atomic or submit_round_atomic
  -> golf_rounds lifecycle guard
  -> golf_holes / golf_shots completed-round guards and totals trigger
  -> read-only round + holes + shots verifier
  -> qualifier entry/state transition (conditional)
  -> after(): stats invalidation -> durable Inngest scheduling or CoachHelm fallback
```

The executable workflow definitions are in
`src/lib/observability/golf-round-flight-workflow.ts`. They label each node as
required, conditional, best-effort, or async, so a node that legitimately does
not apply is shown as skipped while a required node that never ran is shown as
missing.

## Database functions and trigger boundaries observed

The active local function graph includes:

- `public.save_partial_round_atomic`
- `public.submit_round_atomic`
- `helm_private.guard_golf_round_lifecycle`
- `helm_private.reject_completed_round_child_mutation`
- golf-hole total recomputation and round stats-cache triggers

The recorder overlays only the two active atomic functions. It emits workflow
level checkpoints by default; row-level logging is not enabled for production.

## Controlled failure proof

Local trace ID: `f3333333-3333-4333-8333-333333333333`

Input deliberately supplied a non-integer hole par to
`save_partial_round_atomic`. PostgreSQL returned the original `22P02` invalid
integer error. The transaction rolled back; the existing round remained
`in_progress` with zero new holes and zero new shots. Docker logs retained:

```text
db.save_partial_round_atomic                 started
db.save_partial_round_atomic.update_round    started
db.save_partial_round_atomic.replace_snapshot started
db.save_partial_round_atomic.insert_holes    started
db.save_partial_round_atomic.exception       failure (SQLSTATE 22P02)
```

`npm run trace:db` discovered the Docker Supabase Postgres container without a
hard-coded name and persisted all five events to `helm_debug.trace_steps` in a
separate database connection. This proves the trace remains available after the
business transaction fails.

## Findings

### Confirmed: transaction-local tracing context is reverted by PL/pgSQL exception blocks

- Evidence: an exception handler runs behind an implicit subtransaction, so
  transaction-local GUC values established by the original function body can be
  rolled back before the handler reads them.
- Fix: the exception checkpoint receives `p_round_data` directly and extracts
  only the validated opaque trace UUID before logging. It then re-raises the
  original SQLSTATE/message.
- Confidence: high; verified by the controlled `22P02` failure above.

### Confirmed: success needs a persisted-state check

- Evidence: an RPC response alone cannot prove that all expected holes/shots
  exist after competing writers, RLS visibility, or an incomplete code path.
- Fix: autosave and submit now count and compare the persisted round, holes,
  and shot keys after an apparent success. Mismatches are observation failures;
  this initial recorder does not rewrite player data.
- Confidence: high for the verifier behavior; production sampling is not yet
  enabled.

### Confirmed: post-round work must not make a committed round look failed

- Evidence: stats invalidation and CoachHelm execute after response. They can
  fail independently of an already committed score.
- Fix: the trace represents stats and CoachHelm as async nodes. A failed
  post-round trigger logs a linked critical error while the committed round
  remains successful.
- Confidence: high for control flow; durable Inngest execution still needs a
  real preview/production event test before being called end-to-end proven.

## Files changed

- `supabase/migrations/20260825200811_helm_flight_recorder.sql` — private trace
  schema/facades, safe metadata, rollback-proof Postgres checkpoints, active
  atomic RPC instrumentation.
- `src/lib/observability/golf-round-flight-workflow.ts` — shared workflow
  expectation map.
- `src/lib/observability/helm-flight-recorder.ts` — fail-open server API and
  Sentry span integration.
- `src/app/golf/actions/golf.ts` — autosave/submit checkpoints, verifier,
  linked error context, async post-round state.
- `src/lib/supabase/{client,server,admin}.ts` and Sentry init files — current
  Supabase/Sentry trace propagation while retaining timeout fetch behavior.
- `src/app/admin/golf/tracer/*` — protected Trace Explorer list/detail tree.
- `scripts/trace-db.ts` — optional local Docker log collector.
- matching workflow/unit/pgTAP tests and feature ledger updates.

## Verification performed

```text
supabase db reset --local                                  PASS
supabase db lint --local --schema helm_debug --fail-on warning  PASS
pgTAP golf_flight_recorder through CI-style helper harness PASS (12 tests)
vitest recorder/workflow tests                              PASS (4 tests)
vitest selected save/submit/Inngest tests                  PASS (21 tests)
TypeScript typecheck                                       PASS
```

The selected lint check has no errors in the new recorder files. The broader
Golf action file retains four pre-existing TypeScript `any` / unused-disable
warnings at lines 1890/1895 and 2049/2054; they are not introduced by the
recorder and still need separate cleanup before a zero-warning full lint gate.

## Remaining verification and rollout controls

P0 before enabling broad production sampling:

1. Run an authenticated browser scenario through start, autosave, Continue
   Round, submit, and qualifier submit against local Docker; verify the admin
   tree and Sentry span linkage for a real Server Action request.
2. Add deterministic local fault injection coverage for failure before round
   write, during shots, and after commit/background work.
3. Exercise the protected Explorer route with a super-admin test session.

P1:

1. Add list filters for workflow, trace ID, round ID, environment, and time;
   the initial Explorer lists the latest 50 traces and inspects an individual
   trace.
2. Add a bounded retention policy after deciding production trace retention.
3. Instrument the separate add/edit/delete-shot actions and the Continue Round
   load/recovery action using the same workflow map.

No production rollout recommendation is made by this document. The migration
and code shipped on 2026-08-26 (`641adf741`, #1618; six never-recorded stages
completed in `dc3b2fec2`, #1712) and the migration is applied in production.
P1 item 3 — instrumenting the separate add/edit/delete-shot actions and the
Continue Round load/recovery action with the recorder — remains OPEN as of
2026-09-01. (This closing line read "local, uncommitted work" until then.)
