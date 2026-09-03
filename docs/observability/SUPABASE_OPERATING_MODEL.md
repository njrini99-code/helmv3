# Supabase observability operating model

How the database observability program is meant to be OPERATED, as opposed
to what it is built from. Brief §67, §71–77, §86.

Scope note: this document describes Phase 3 Track F (state model, absence
detection, layered performance, incident memory, repair completeness,
runbooks, query explainer, repo mapping, Sentry contract) sitting on top of
Phase 1 and Phase 2 Tracks A and B. Sibling tracks C, D and E were building
in parallel and are NOT assessed here — where a §86 criterion depends on
them, this document says so rather than assuming.

## The database state model

`src/lib/observability/supabase/db-state.ts` folds every signal into one of
five states, and returns the evidence that produced it so a surface can
explain itself instead of asserting a colour.

- `GREEN` — every live signal is ok and nothing required is blind.
- `AMBER` — the worst live signal is a warning.
- `RED` — at least one live signal is critical.
- `DEGRADED` — every live signal is ok, but a required source is not live,
  so "ok" describes only the part of the system that can be seen.
- `UNKNOWN` — there is no usable live signal at all. Not healthy, not a
  fire, nothing learned.

Three rules carry the weight.

`DEGRADED` is on the observability axis, not the severity axis. That is why
`RED` beats it: a partly blind board that can still see a fire must report
the fire, with confidence capped at `low`. The constraint the brief states
is only that a blind required source can never yield `GREEN` — not that such
a board should stop reporting what it can still see.

A stale source's last row is not evidence about now. A collector that
stopped three hours ago is still holding a row saying "connections at 12%",
and folding that row in would render a dead collector as a healthy database.
Only `healthy` and `degraded` freshness contribute signals; `stale`, `blind`
and `unknown` contribute a cap and nothing else.

Confidence is a separate axis from state. A required source that is not live
caps it at `low`; an optional one, a behind-but-live source, or an undecided
rule caps it at `medium`. `UNKNOWN` carries confidence `none`.

## Absence detection

`src/lib/observability/supabase/absence.ts` answers the question every other
module cannot: did the signal STOP. Five detectors — health samples ceased,
zero submit attempts in season, Realtime subscriptions at zero, a cron job
absent from the catalog, database spans vanishing after a release.

Silence has two causes that are identical in the data: the producer broke,
or nobody asked it to run. A detector that cannot separate them cries wolf
until it is muted, and a muted detector is worse than no detector because
the operator now believes they are covered.

So `ActivityContext` is a REQUIRED field on every detector, with three
variants rather than two:

- `active` — something should have been produced.
- `quiet` — nothing was expected. Silence here is correct.
- `unknown` — it could not be determined. Silence here teaches nothing.

Omitting it is a compile error rather than a silent "assume active", and an
unknown context yields `unknown`, never `absent`. `absenceFindingsToSignals`
maps an `unknown` verdict to an `unknown` LEVEL, so an undecided detector can
never contribute to a `GREEN`.

No sport calendar is hardcoded. Season windows are an input, and an EMPTY
window list reads `unknown` rather than `quiet` — collapsing those would let
a missing configuration silence every seasonal detector permanently, which is
the quietest possible failure.

The specific false alarms that are guarded, each with a fixture: one missed
tick is scheduler jitter, an observation window too short to mean anything is
unknown, a null counter is never coerced to zero, an unreadable job catalog is
not an empty one, a signal that never started did not stop, zero spans after
zero spans has no baseline, and a future timestamp is a clock problem rather
than an outage.

## Layered performance

`layered-performance.ts` keeps two layers apart because the difference
between them is the finding.

- Request layer — Sentry span percentiles, measured and supplied.
- Database layer — pg_stat_statements deltas, aggregates only.

"Request p95 regressed AND the database regressed" and "the request is slow
while the database is stable" lead to different repairs. One performance
number destroys that distinction.

pg_stat_statements exposes `calls`, `total_exec_time`, `min`, `max`, `mean`
and `stddev`, and no distribution. It cannot produce a p95. The tempting
derivation is `mean + 1.645 * stddev`, valid only for a normal distribution,
and query latency is long-tailed and usually multi-modal — cache hit, cache
miss, lock wait. A p95 derived that way is a fabricated number carrying a
real number's authority.

So the database half of the output has no percentile-shaped field at all,
carries `percentilesAvailable: false` and the statistics that DO exist, and a
test asserts the absence over the output keys rather than trusting the
comment. The measured request p95 is labelled `measured_sentry_spans`.

A missing layer is its own verdict. A blind request layer does not make "the
database is stable" the answer; the conclusion is `request_unknown`.

## Incident memory

A resolved database incident becomes a file in the store this repo already
has: `memory/incidents/<feature_id>/INC-YYYY-MM-DD-<slug>.md`.

There is no `helm_debug.db_incidents` table and there will not be one. A
store that can disagree with committed state is a second authority for
engineering truth, which is the reasoning `.claude/rules/shipping.md` §1b
gives for the whole Git-backed memory architecture, and the brief's own
anti-pattern list names "a second incident DB" outright.

The nine recorded fields are mechanism, code, feature, relation or RPC, root
cause, fix PR, migration, regression test, invariant. An absent PR or
migration must state WHY, matching the ledger checker's existing rule that an
unexplained null is indistinguishable from a forgotten link.

Only the enforced contract is templated — the directory as a registry key,
the filename pattern, the backticked feature line — read from
`scripts/knowledge/check-ledger-integrity.mjs` rather than from the README
prose, which documents four files that shipped with unlinkable feature lines
and passed review. Narrative is caller-supplied and passed through verbatim,
because a fixed prose skeleton produces records nobody reads.

Writing one:

```bash
npx tsx scripts/observability/record-db-incident.ts <record.json> --dry-run
npx tsx scripts/observability/record-db-incident.ts <record.json>
```

It refuses more than it writes: an unmapped feature id, an unreadable
registry (validating against nothing is not validation), and an existing file
at the path — a repeat occurrence updates that file's count, last seen and
evidence by hand, and an automated overwrite would destroy it.

## Repair completeness

`repair-completeness.ts` evaluates the eight §76 criteria one at a time and
returns PASS, FAIL or UNKNOWN for each: root cause proven, regression test
exists, RLS unchanged or deliberately changed, performance not degraded,
invariant restored, no telemetry hidden, neighbours healthy, post-deploy
signal healthy.

There is deliberately no score and no boolean. "7 of 8" and "87%" are the
same mistake: they average an UNKNOWN into a number that reads like
knowledge. "We did not check whether the neighbouring tables are healthy" and
"we checked and they are" must not produce the same digit.

The roll-up is three-valued — COMPLETE, INCOMPLETE, INDETERMINATE. FAIL
outranks UNKNOWN because a proven failure is decisive, and the unknown ids
are listed alongside so a failure never swallows them. A criterion with no
evidence supplied is UNKNOWN, and a PASS with an empty justification is
downgraded to UNKNOWN: an assertion is not evidence.

## Three trace ids, and why they are not the same thing

| Id | Created by | Lives as long as |
| --- | --- | --- |
| `sentryTraceId` | the Sentry SDK, on the active span | the Sentry trace |
| `w3cTraceId` | whoever wrote `traceparent` | the HTTP request chain |
| `helmTraceId` | Helm's flight recorder | past the request, in the database |

Each is joined on somewhere different: the Sentry id in a Sentry trace view,
the W3C id by any non-Sentry participant in the same request, and Helm's id
across `trace_runs`, `error_logs` and `admin_events`.

They frequently coincide, because Sentry's SDK adopts an incoming
`traceparent`. That is exactly why they are stored apart. Assuming equality
works right up until a trace arrives from a runtime where Sentry did not
continue the upstream trace, and then every join built on the assumption
silently returns nothing — a failure that produces no error, only an empty
result.

`buildTraceCorrelation` therefore keeps three named fields and never one
`traceId`, REPORTS `sentryMatchesW3c` rather than deciding it, and rejects a
malformed or all-zero id instead of propagating it.

## The no-money operating model

Normal operation of this system needs exactly four things, and all four are
already paid for:

1. Native Postgres statistics — `pg_stat_database`, `pg_stat_statements`,
   `pg_stat_user_tables`, `pg_locks`, `pg_stat_activity`. Included in the
   database.
2. Small scheduled collectors and small private aggregate tables in the
   `helm_debug` schema, pruned on fixed windows.
3. The existing Sentry project, the existing Bridge, the existing Flight
   Recorder.
4. On-demand tooling — the runbooks in
   `docs/observability/SUPABASE_RUNBOOKS.md`, the query explainer, a manual
   Supabase log read when one is actually needed.

Nothing in Track F adds a recurring cost. There is no log drain, no
continuous log-API polling, no second incident store, no second trace system,
no vendor, no new table, and no migration.

The rule for anyone extending this: any step that could create a charge
STOPS with `OWNER ACTION REQUIRED — COST` and does not proceed. That includes
a Grafana Cloud account, a Sentry plan change, a log drain destination, and
any managed service that bills per event or per gigabyte — even where a free
tier exists, because a free tier that silently converts to a paid one on
volume is a recurring cost with a delay.

## Definition of maxed out, scored honestly

Brief §86 lists twelve criteria. This is where each one actually stands on
this branch, which carries Phase 1, Phase 2 Tracks A and B, and Phase 3 Track
F. Tracks C, D and E were building in parallel and their work is not counted
here — a criterion they may have closed is recorded as unknown on this
branch, not as met.

The most important line first: **every migration in this program is recorded
HOLD**, so every criterion below whose evidence is a `helm_debug` observability
table is `MECHANISM ONLY` — the code is written and tested, and the store it
writes to is not expected to exist in production yet.

Sourced, not asserted: that comes from the two Phase 1 and Phase 2 rows in
`supabase/migrations/HELD.md`, both reading `HOLD — R3, prepared, not
reviewed`, verified identical on this branch and on `origin/main`. It is a
reading of the REGISTER, not of the live catalog, and
`.claude/rules/shipping.md` §4 is explicit that "recorded" and "applied" have
disagreed before. Note the distinction that makes this easy to get wrong: the
`helm_debug` SCHEMA itself IS applied in production — the flight-recorder and
trace migrations discharged their holds between 2026-08-26 and 2026-09-03, and
their rows say so. What remains held is the six OBSERVABILITY tables this
program adds inside that existing schema. A commit message elsewhere in the
repo saying "after the helm_debug schema apply" refers to the former, not the
latter. Before anyone converts a `MECHANISM ONLY` here into `MET`, read the
live catalog rather than this table.

| # | Criterion | Verdict on this branch |
| --- | --- | --- |
| 1 | Every meaningful failure has a code with context | NOT MET |
| 2 | Every critical operation an outcome tied to a release | NOT MET |
| 3 | Every critical DB workflow traceable | NOT VERIFIED |
| 4 | Rollback leaves durable out-of-band evidence | MECHANISM ONLY |
| 5 | Every silent data failure an invariant | PARTIAL |
| 6 | Every important query a baseline | MECHANISM ONLY |
| 7 | Every source a freshness | MET (code level) |
| 8 | Every blind source UNKNOWN | MET (code level) |
| 9 | Repetitive signals dedupe | MET (code level) |
| 10 | Every observability write fail-open | MET, with a number |
| 11 | No secret needed for routine diagnosis | PARTIAL |
| 12 | No paid drain | MET |

The detail behind the four that are not met or not verified:

**1. Codes with context — NOT MET.** The envelope, the classifier and six
service-specific classifiers exist and are tested. But `npm run
audit:supabase-errors` reports a baseline of **1039 unchecked Supabase
reads**: PostgREST returns failures as VALUES, so a call site that never
inspects `error` produces no code, no context and no telemetry at all. That
number is a locked ratchet, not a fixed defect. Auth additionally has zero
wired production call sites, and two `.subscribe()` sites remain unobserved.

**2. Outcome tied to a release — NOT MET.** The envelope carries
`releaseSha`, and `commit-outcome.ts` models TRANSPORT_TIMEOUT /
DURABLE_FAILURE / DURABLE_SUCCESS_AFTER_TIMEOUT / UNKNOWN_COMMIT correctly.
It is wired into nothing: its intended call sites in `golf.ts` are owned by
another session. A model nothing calls produces no outcomes.

**3. Traceable — NOT VERIFIED.** Track F models the three trace ids and
their correlation, and refuses to collapse them. What is NOT done on this
branch is §14's W3C propagation CERTIFICATION — proving a `traceparent`
actually survives the supabase-js boundary in each runtime. Until that is
measured, "traceable" is a design property, not an observed one.

**5. Invariants — PARTIAL.** `integrity.ts` exists and the brief's
`INVARIANT_REGISTRY_PRESENT` doctor check is named for a sibling track. On
this branch there is no registry enumerating which silent failures have an
invariant, so coverage cannot be stated.

**10. Fail-open — MET, with a number.** `npm run audit:fail-open` reports a
baseline of **51** empty-collection-on-error sites and no regression, and
every collector route degrades to a `200` no-op while its migration is HELD
rather than failing the run. The 51 are a real, tracked debt, not a clean
sheet.

**11. No secret for routine diagnosis — PARTIAL.** The Bridge surfaces need
only admin authorization. The runbook steps that read `pg_proc`, `pg_policy`
and `pg_locks` need database access. And the Sentry credentials in
`.env.local` are 11-character placeholders that still pass the local
`usableSecret()` check, so every local Sentry read fails soft and silently
(see `.claude/rules/shipping.md` §4) — the MCP read path works, a local
credential-based one does not.

## Registry gaps found while building Track F

`repo-mapping.ts` resolves an envelope to its repo definition through
`memory/registry.yml`. Running its logic against the real committed registry
surfaced these, none of which Track F changed:

- **Two features claim the identical glob `src/lib/observability/**`** —
  `observability_sentry` and `shot_tracking`. `admin_platform`'s own comment
  states the glob is "owned by shot_tracking", which is only half true.
  Most-specific-glob-wins cannot break a tie between two identical globs.
- **No runtime feature key covers the database observability surfaces.**
  `admin_platform` owns `src/lib/observability/supabase/**` and
  `src/app/admin/database/**`, but its only `observability.feature_keys`
  entry is `admin_dashboard`. An envelope emitted by a database collector has
  no feature key that resolves.
- **Five features declare no `code.db` patterns** —
  `feature_awareness_system`, `observability_sentry`,
  `admin_reliability_collector`, `admin_selfheal`, `ios_native_shell`. Some
  legitimately touch no schema; the registry does not distinguish "no
  database" from "not mapped".
- **Four features declare no `code.tests` patterns** —
  `feature_awareness_system`, `crm_outreach`, `recruiting`,
  `admin_reliability_collector`. For those, no regression coverage can be
  pointed at from an incident.

There is no `observability_supabase` registry key, and Track F did not add
one. A database-observability telemetry defect is filed under
`admin_platform` (as INC-2026-08-27 already is) and a database fault under the
product feature it hit.

## Related documents

- `docs/observability/SUPABASE_RUNBOOKS.md` — 42501 and 57014.
- `docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md` — the
  production facts this program is measured against.
- `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md` — Auth, Storage,
  Realtime and Edge Function coverage.
- `memory/features/observability-supabase.md` — the current-state feature
  doc.
