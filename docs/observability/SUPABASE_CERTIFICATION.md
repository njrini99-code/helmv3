<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Supabase observability — certification, replay and fault injection

Phase 3 Track E of the zero-cost Supabase observability program
(`docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`,
sections 56–61, 79 and 80).

This document describes what was built to CHECK the observability system, and
what those checks actually established. It deliberately reports the gaps at
the same volume as the passes, because a certification that only lists passes
is a marketing document.

## 0. The one thing to read first

**Every migration in this program is HELD and unapplied.** See
`supabase/migrations/HELD.md`. `record_db_error_event` does not exist in
production, and neither does any table it writes to.

That single fact determines most of the verdicts below. It splits every claim
about durable evidence into two halves that must never be reported as one:

| Half | Status | Why |
| --- | --- | --- |
| The recorder is DISPATCHED with the right arguments | exercisable, and exercised | an injected fake client observes the real call |
| A durable ROW exists | NOT VERIFIED | the function it calls is not deployed |

`.claude/rules/shipping.md` names this exact trap (G8): *"the migration exists
in this repo" is not evidence the table is live*. Nothing in this track claims
otherwise, and nothing here was run against production.

## 1. What runs, and what each thing proves

Four commands. All are static or in-process; none opens a database connection
or makes a network call.

```bash
node scripts/db-observability-replay.mjs     # replay fixtures
node scripts/db-observability-certify.mjs    # certification matrix
node scripts/db-observability-security.mjs   # security posture
node scripts/db-observability-coverage.mjs   # regenerate the coverage matrix
node scripts/db-observability-coverage.mjs --check   # fail if it is stale
```

The first two re-exec themselves under the `tsx` ESM loader, because the
production pipeline they exercise is TypeScript and plain Node resolves
neither a `.ts` import nor this repo's `@/` alias. They also alias
`server-only` to `src/test/stubs/server-only.ts`, which is the same alias
`vitest.config.ts` already applies for the same reason.

Every assertion these scripts make is also a vitest test, so CI covers them
without running the scripts:

| Suite | Covers |
| --- | --- |
| `src/lib/observability/supabase/__tests__/replay-fixtures.test.ts` | the replay fixtures |
| `src/lib/observability/supabase/__tests__/certification.test.ts` | the certification matrix, and that it cannot report a false pass |
| `src/lib/observability/supabase/__tests__/fault-injection.test.ts` | breaking observability on purpose |
| `scripts/lib/__tests__/db-observability-security.test.ts` | the security posture and its detectors |
| `scripts/lib/__tests__/db-observability-coverage.test.ts` | the coverage matrix and its derivation |
| `src/app/admin/traces/__tests__/trace-explorer-layers.test.ts` | the Trace Explorer layer model and the rollback banner |

The two under `scripts/` are registered in `vitest.config.ts`. That
registration is load-bearing: a file under `scripts/__tests__` or
`scripts/lib/__tests__` that is not named in the include list executes under
nothing, and a guard that never runs is decorative.

## 2. Replay fixtures (brief section 57)

`src/lib/observability/supabase/__fixtures__/` holds one fixture per failure
MECHANISM, stated as an input the real pipeline accepts plus the
classification that pipeline is expected to produce. The runner drives the
real `observeSupabaseResult` / `checkZeroRowMutationIntegrity` — which compose
the real classifier, envelope builder and out-of-band recorder — and compares.

Covered: an unexpected 42501, a 23505 race, 40P01, 57014, a round-missing race
(PGRST116), a stale optimistic lock, a schema mismatch (42703), a zero-row
update. Plus the two pairs that make the set worth having: 42501 expected
versus unexpected, and 23505 idempotent versus genuine race. A fixture set
containing only failures cannot demonstrate that the classifier tells the
routine ones apart, which is its main job.

### No database, by construction

`RecordDbErrorOptions.client` is a documented replay seam added by this track.
The fake client is passed IN, so `createAdminClient()` is never constructed,
no service-role secret is read, and nothing leaves the process. The safety
property holds regardless of which environment the fixtures run in, rather
than depending on an environment variable being unset.

The brief offers "local Docker / isolated DB" as an option. It was
deliberately not taken: every mechanism here is decided in TypeScript from an
error shape, so a database would add a dependency without adding evidence.
What a database WOULD prove — that Postgres really raises 40P01 for a given
interleaving — is reported NOT VERIFIED rather than implied.

### Privacy sentinels (brief section 6)

Synthetic JWT, bearer token, service-key pair, email and UUID values are
planted in fixture inputs and asserted ABSENT from every persisted string:
fingerprint, normalized message, safe details, safe hint, relation, rpc and
metadata. Distinctive FRAGMENTS are asserted absent too, so a redactor that
replaced a whole string but left its tail behind still fails. A "guards the
guard" test proves the sentinels really went into the fixture, so the sweep
cannot pass vacuously.

`safeMetadata` is included in the sweep even though
`buildSupabaseErrorEnvelope` documents that it does not sanitize that bag —
the producer allow-lists it instead. The sweep is therefore stricter than the
contract, on purpose.

### Two measured findings

**The fingerprint ignores `action`.** `buildSupabaseFingerprint` reads
service, feature, operation, rpc-or-relation and code. Two different actions
on the same relation with the same code therefore share one dedupe key and
would be filed as one incident. This is recorded as a test rather than
changed: the fingerprint is a contract other tracks depend on, and altering
its granularity is a behaviour change outside this track's scope.

**Occurrence-count collapsing is NOT VERIFIED.** A fixture proves that two
occurrences of one mechanism produce one dedupe KEY. Only a live database
proves they produce one ROW, and the upsert that would do it is held.

## 3. Certification matrix (brief section 58)

`scripts/db-observability-certify.mjs` walks every scenario the brief names —
42501, 42883, 57014, an expected 23505, handled and unhandled server DB
errors, a failed RPC with rollback, Realtime CHANNEL_ERROR and TIMED_OUT, an
expected Storage miss, an Auth invalid credential, a synthetic actionable Auth
failure, a collector failure, an unreadable telemetry source, and an invariant
violation — and for each states what the system SHOULD produce before
establishing whether it does.

Three verdicts, never collapsed:

| Verdict | Meaning | Effect on exit code |
| --- | --- | --- |
| `PASS` | established in this process | none |
| `FAIL` | established and false | exit 1 |
| `NOT_VERIFIED` | needs a live database or a deployed environment | none |

A run that is half unverifiable exits zero while saying so. A run with one
FAIL exits one. Treating NOT_VERIFIED as either is how a report ends up
asserting things nobody checked.

Evidence carries its own label, because two kinds are not the same strength:

- **exercised** — the real production function ran here and the claim is about
  what it returned or did.
- **static** — the claim is about WIRING (does this module capture to Sentry
  at all; does the wrapper route a thrown error there), established by reading
  the module. A wiring fact is real, but it is not proof an event arrived.

A scenario the brief names but nobody built FAILS the run rather than quietly
improving the score.

### Two bugs the matrix found in its own checks

Worth recording because both are the same shape, and it is the shape this
whole program keeps rediscovering.

**A regex matched a doc comment.** `observe-result.ts`'s header says *"It does
not call `Sentry.captureException`"*. A raw pattern over the file matched that
sentence and reported the opposite of the truth, failing six scenarios. The
sibling platform track hit the identical failure with its live-proof detector,
which matched the documentation explaining how to set the marker. Fixed with a
URL-safe `stripCodeComments` that is unit-tested directly, including a
positive control so a stripper returning an empty string cannot pass.

**An assertion passed vacuously.** The first version of that test wrote a
probe file to a temp directory and read it back through a helper that joins
against the repository root — which silently returned an empty string for an
absolute path, and `not.toContain` is true of the empty string. The check is
now a pure function with no path semantics to get wrong.

## 4. Fault injection (brief section 59)

`fault-injection.test.ts` breaks a piece of observability and asserts two
things that must both hold: the PRODUCT path continues, and the observability
surface marks itself degraded or unknown rather than rendering green.

| Fault | Product | Surface |
| --- | --- | --- |
| Collector grant revoked (42501 on the facade) | classifies and returns | a real reported failure, deliberately not the migration no-op |
| Observability table missing (42P01) | unaffected | clean no-op with `skipped` set; the read side still reports blind |
| Sentry unavailable (capture throws) | channel returned, own status handler still runs | — |
| Metrics transport unavailable | observer never throws | see the finding below |
| Recorder times out | abandoned on a bounded timeout, request not hung | `skipped: 'timed-out'` |
| Collector throws | structurally unaffected (cron, not a user request) | source blind or stale, board not green |
| Bridge reader throws | unaffected | failed envelope with null data, never an empty success |

Plus the surface invariants: an empty source list is unknown rather than
green, "unreadable" and "read fine, no data yet" stay two different facts, and
three healthy sources never average away one blind one.

### The one module that is not fault-ISOLATED

`observe-result.ts` is fail-open with respect to the product — it never throws
into the caller, which is the hard requirement — but the durable write sits
DOWNSTREAM of the metric call in the same try block. A throwing metrics emit
therefore also suppresses the durable evidence and the returned envelope.

This is reported, not fixed, and not papered over. It is not reachable through
the real module today, because `metrics.ts` wraps every emit in its own
try/catch (`safeCount` / `safeDistribution`, "A Sentry failure must never
reach product code"). The test pins the ORDERING consequence so that a future
refactor removing that inner guard is caught here rather than in production.
Reordering `observe-result.ts` so the durable write happens first would be a
behaviour change to a hot production path that this track was not asked to
make; it is left as an owner decision.

## 5. Security posture (brief sections 60 and 61)

`scripts/db-observability-security.mjs` is static and read-only: it reads
migrations and source, opens no connection and makes no request.

| Check | Verdict |
| --- | --- |
| Every new observability table is private (no anon, no authenticated) | PASS |
| Every facade is service-role-only with a fixed `search_path` | PASS |
| Every surface reading observability data is admin- or cron-gated | PASS |
| No server-only observability module is reachable from a `'use client'` component | PASS |
| No NEW generic browser error-ingest endpoint | PASS |
| Pre-existing browser ingest route, per control | FINDING |
| The LIVE catalog matches what the migrations declare | NOT_CONFIGURED |

The definer-rights facades each revoke EXECUTE from public, anon and
authenticated and grant it only to `service_role`; the `helm_debug` schema is
revoked from public in the same migration that adds a table to it. The
server-only module list is discovered by reading each file's own
`import 'server-only'` rather than from a hand-kept list that would rot.

The gated-surface check originally found a single surface, and would have
declared the whole thing gated on the strength of one admin page. It was
broadened to the facade RPC names so that a collector route calling a facade
directly is held to its own cron gate.

### The pre-existing ingest endpoint, stated plainly

`src/app/api/log-error/route.ts` accepts anonymous, client-supplied error
reports and writes `error_logs` and `admin_events`. Measured against the six
controls brief section 61 would require:

| Control | Present |
| --- | --- |
| Rate limit | yes |
| Dedupe | yes |
| Size limit | yes |
| Schema validation (field-level type checks) | yes |
| Authentication | no — deliberate; it exists to capture pre-auth client errors, and caps anonymous severity |
| Field allow-list | no |

This route predates the whole program and writes no observability table.
Section 61 governs endpoints this program creates, so it is allow-listed with
its status printed rather than failed on — changing it is scope this track was
not asked to take, and hiding it inside an allow-list would be worse than
either. **Owner decision:** whether to add a field allow-list.

The guard fails on any NEW such endpoint.

### Two false positives in the detector, both fixed

The CRM calendar route was flagged because a COMMENT mentions not flooding
`error_logs` — the read-the-prose bug again. The admin log-event route was
flagged despite returning 401 without a session. The detector now strips
comments and requires the route to actually accept an unauthenticated caller,
distinguishing a real guard from a `getUser()` call that refuses nobody. Both
discriminations are unit-tested, including a case proving a distant 401 cannot
vouch for a guard that is not there.

### What is NOT verified here

The live catalog. No credential is used and no query is run, so the script
reports NOT_CONFIGURED. Confirming that production's grants match the
migrations requires a read-only catalog query the owner runs, and is moot
until the migrations are applied.

## 6. Trace Explorer layers (brief section 56)

The existing Trace Explorer under `src/app/admin/traces/` was EXTENDED, not
duplicated. `trace-tree.ts` keeps owning containment; a new
`trace-explorer-layers.ts` projects its output into the brief's seven layers
with the per-step facts the brief lists.

`POSTGRES_SUBSTEPS` is containment-derived, not column-derived, and this is
the detail a naive implementation gets wrong. The SQL checkpoint writer
records every in-transaction checkpoint at `layer = 'postgres'` and
deliberately never overwrites an already-recorded layer, so
`db.save_partial_round_atomic` stays `'supabase'` while its own checkpoints
arrive as `'postgres'`. A per-row lookup would render those checkpoints as
separate top-level RPCs.

### The rollback banner

When a transaction rolls back it erases its own trace rows, so a failed RPC
renders as one step with nothing beneath it — indistinguishable from an RPC
that simply had no substeps. The explorer now emits the brief's wording
verbatim:

```text
POSTGRES FAILURE DETAIL: NOT DURABLY CAPTURED — application-observed SQLSTATE: <code>, raw Postgres log: manual
```

`UNKNOWN` appears in place of the code when the application observed none —
never a blank, because an absent code is itself the finding.

Two deliberate non-behaviours:

- It does NOT fire when an exception checkpoint SURVIVED.
  `helm_private.trace_exception_checkpoint` writes `{sqlstate, message}` into
  metadata, and where that row is present the detail WAS durably captured.
- It does NOT guess which `'supabase'`-layer steps are RPCs. After a total
  rollback nothing in the trace proves it: the JS recorder never sends
  `p_function_name`, so the surviving parent row has a null function name
  exactly like a table read does. The caller states the list instead, and the
  mounted panel's list is measured from the RPC call sites in
  `src/app/golf/actions/golf.ts` rather than inferred from a key prefix.

**Scope boundary:** the panel is mounted inside `TraceTree.tsx`, above the
tree, because when a transaction erased its own rows the tree below is short
and plausible and the banner has to be seen before the short tree is believed.
`src/app/admin/database/page.tsx` was not touched — a sibling track owns it.

## 7. Coverage matrix (brief section 79)

`docs/observability/SUPABASE_COVERAGE_MATRIX.md` is GENERATED. Do not
hand-edit it; edit the detectors in
`scripts/lib/db-observability-coverage.mjs` and regenerate.

Every cell is derived by reading the modules a row names, with comments
stripped first. Nothing is transcribed from the brief's intent, because a
matrix that restates its own design document certifies nothing. The generated
file carries no date and no commit SHA, so `--check` is a real idempotence
test rather than a diff against the clock.

Two columns deserve explanation, and both explanations are uncomfortable:

**Sentry is UNKNOWN for nearly every row, and that is the accurate answer.**
Only `realtime.ts` captures to Sentry from inside the observability layer.
Every other path reaches Sentry only if the error ESCAPES to an action wrapper
or `onRequestError`, which is a property of the call site rather than of the
observing module. Reporting YES would claim something no detector established.

**Live verified is NOT VERIFIED for every row**, derived from `HELD.md` rather
than hardcoded, so the cell resolves on its own once the hold is discharged.

A row whose implementing module is absent from the branch being generated from
reads UNKNOWN rather than NO. Missing evidence is weaker than "the code does
not do this", and several rows name modules belonging to sibling tracks of the
same program — regenerating after integration resolves them.

The Blind spot column names, per row, which channels are missing. The rows
with the least coverage are pg_cron, pg_net, locks, saturation, schema and
type drift, query regression, and collector-missing: each is surfaced on the
Bridge but has no durable error event, no replay fixture and no metric.

## 8. Acceptance checklist (brief section 80)

Scope note: this track builds the CHECKS. Several checklist items are other
tracks' deliverables, and are marked with what this track's checks were able
to establish about them rather than being claimed or dismissed.

| Item | Verdict | Basis |
| --- | --- | --- |
| **App/database errors** — PostgREST code, SQLSTATE, Auth code, Storage code, Realtime state, Edge exception, expected vs actionable, retry vs terminal | **VERIFIED (exercised)** | replay fixtures and the certification matrix drive the real classifiers; both discriminating pairs separate correctly |
| **Rollback** — true SQLSTATE propagates | **VERIFIED (exercised)** | the app-observed SQLSTATE reaches the envelope and the Trace Explorer banner |
| **Rollback** — Sentry sees it | **NOT VERIFIED** | static only: routing depends on whether the error escapes to the action wrapper, which is a call-site property |
| **Rollback** — Bridge sees it | **NOT VERIFIED** | requires a live database; `admin_events` cannot be asserted from here |
| **Rollback** — a separate DB error event persists | **NOT VERIFIED — MIGRATION HELD** | dispatch is exercised; the row cannot exist because `record_db_error_event` is unapplied |
| **Rollback** — no product dependency on the write | **VERIFIED (exercised)** | fault injection: a throwing, failing and hanging recorder each leave the caller unaffected |
| **DB health** — 5m samples, reset-aware deltas, connections, idle-in-tx, lock waits, commits/rollbacks, deadlocks, temp, size, freshness | **NOT VERIFIED — MIGRATION HELD** | Track A deliverable; the pure evaluators are unit-tested, no sample has ever been collected |
| **Query performance** — delta sampling, no auto reset, bounded Top-K, safe catalog, workload split, release regression | **NOT VERIFIED — MIGRATION HELD** | Track A deliverable; same reason |
| **Platform** — Metrics API health, DB-up, CPU, memory, pools, Realtime pressure, stale = UNKNOWN | **NOT VERIFIED** | sibling track; its module is not on this branch, so the coverage matrix reports UNKNOWN for that row |
| **Jobs** — pg_cron failure, missed run, collector self-health, pg_net | **VERIFIED (exercised, evaluator only)** | `evaluateCronJob` produces findings for a failed run in the certification matrix; no live cron run has been read |
| **Integrity** — outcome contracts, violations become incidents, HTTP 200 cannot hide corruption | **VERIFIED (exercised)** | the zero-row and stale-lock fixtures produce a critical envelope on the per-occurrence path |
| **Correlation** — Sentry trace, propagated trace, Helm trace, release, feature/action, DB object, incident | **PARTIAL — VERIFIED for the envelope, NOT VERIFIED end to end** | the envelope carries correlation ids and release; the Trace Explorer finds no release on any trace step because the recorder never writes one |
| **Privacy** — no JWT, cookies, service key, password, raw body or arbitrary filters; sentinel absent | **VERIFIED (exercised)** | sentinel sweep over every persisted string plus fragments, with a guards-the-guard test |
| **Privacy** — Session Replay masked | **NOT VERIFIED** | out of this track's scope; no check was written |
| **Cost** — no drain, no continuous log ingestion, no new vendor | **VERIFIED (exercised)** | every script here is static or in-process; none opens a connection or makes a request |
| **Cost** — bounded rows/day measured, table sizes measured, collector cost measured | **NOT VERIFIED — MIGRATION HELD** | nothing has been written, so nothing can be measured |
| **Security** — storage private, facades service-role-only, fixed search_path, Bridge admin-gated | **VERIFIED (static)** | established from the migration text; the live catalog is NOT_CONFIGURED |
| **Security** — pgTAP verification of the above | **NOT VERIFIED** | no pgTAP suite was written or run for these migrations; consistent with what `HELD.md` already records for Phases 1 and 2 |
| **No generic browser ingest endpoint** | **VERIFIED (static)**, with one FINDING | no new endpoint; the pre-existing one is allow-listed with its per-control status printed |

### Blocked and owner-action items

| Item | Status |
| --- | --- |
| Applying any migration in this program | **OWNER ACTION REQUIRED** — R3, held, `db-migration-reviewer` review not yet requested |
| Live catalog grant verification | **BLOCKED** on the above; a read-only query the owner runs |
| A local Supabase stack for database-level replay | **BLOCKED** — not present on this machine; the fixtures are designed not to need one |
| pgTAP coverage for the observability migrations | **NOT VERIFIED** — none written; needs a local stack |
| Whether `observe-result.ts` should write durably BEFORE emitting its metric | **OWNER ACTION REQUIRED** — a behaviour change to a hot path, out of this track's scope |
| Whether `log-error` should gain a field allow-list | **OWNER ACTION REQUIRED** — pre-existing route, outside this program |

## 9. Cost

Nothing in this track creates a recurring charge. No log drain, no continuous
log ingestion, no new vendor, no additional Supabase resource, no scheduled
job. Every script is static or in-process and runs on demand; no check opens a
database connection, and no check makes a network request. The generated
coverage matrix is a file in this repository.

**INCREMENTAL RECURRING OBSERVABILITY COST $0.**
