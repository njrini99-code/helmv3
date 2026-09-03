<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD040 MD060 -->
# Supabase diagnostics and correlation — Phase 3 Track D

Five pure modules plus one Bridge read model and one Bridge surface, built
against `docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md`
§34, §40–43, §48, §53, and the §68 42501 runbook.

Phase 1 and Phase 2 answered *what failed* — an error envelope, a classifier,
a durable store, health/query/lock/table/job collectors, a Bridge board. This
track answers *what does it mean and what changed*: which object went missing
and whether this repo ever created it, whether an authorization denial is the
security boundary or a defect, which release could plausibly have caused it and
how confident that claim may be, which service layer actually decided the
failure, and whether a journey started making materially more DB calls.

Everything here is additive. No existing module was changed, no migration was
written, and nothing in `src/lib/admin/incidents/**` is imported.

---

## 1. What is in this track

| Module | Kind | Brief |
| --- | --- | --- |
| `src/lib/observability/supabase/schema-drift.ts` | pure | §40–41 |
| `src/lib/observability/supabase/authorization-diagnosis.ts` | pure | §41, §68 |
| `src/lib/observability/supabase/release-correlation.ts` | pure | §42–43 |
| `src/lib/observability/supabase/service-layers.ts` | pure | §48 |
| `src/lib/observability/supabase/call-budgets.ts` | pure | §53 |
| `src/lib/admin/database/incident-detail.ts` | server-only reader | §34 |
| `src/lib/admin/database/drift-inputs.ts` | server-only reader | §40 |
| `src/app/admin/database/page.tsx` | Bridge surface | §34, §35B |

Every pure module takes its evidence as arguments, has no side effects, no
`server-only` import, no ambient clock, and a fixture test file under
`src/lib/observability/supabase/__tests__/`.

---

## 2. Schema / types / migration drift — `schema-drift.ts`

**Input.** A missing-object failure (an envelope subset), a migration ledger
listing, a generated-types listing.
**Output.** `SchemaDriftDiagnosis`.

**Mechanisms it separates.** Postgres undefined-object SQLSTATEs (`42P01`
undefined_table, `42703` undefined_column, `42883` undefined_function, `3F000`
invalid_schema_name) versus the PostgREST schema-cache family (`PGRST200`,
`PGRST201`, `PGRST202`, `PGRST203`, `PGRST204`, `PGRST205`). These are not the
same failure: a cache miss is fixed by reloading the cache, an absent object is
not.

**The object name** comes from the structured `relation`/`rpc` fields first and
from the already-sanitized message second, in both the Postgres and PostgREST
wordings (Postgres quotes with `"`, PostgREST with `'`). When neither names it,
`object.name` is `null` — a reportable unknown, not a guess.

**Three axes, three separate unknowns.** This is the whole point of the module:

```text
migrationFile    found | absent | unknown     does the TREE create it
ledgerRow        present | absent | unknown   does the LEDGER record it
generatedTypes   present | absent | unknown   do the TYPES mention it
```

`.claude/rules/shipping.md` §4 and `scripts/db/migration-ledger-drift.mjs`'s own
header both record why they may never be collapsed: **"recorded" is not
"applied"**, a migration file in the tree is not evidence the object exists, and
five local-only migrations were verified live in production carrying no ledger
row at all (2026-08-26). Every unreadable input yields `unknown`, never `absent`.

**Verdicts.**

| Verdict | Means |
| --- | --- |
| `not-applicable` | Not a missing-object mechanism |
| `unknown` | An axis could not be determined; no verdict is supportable |
| `object-unknown-to-repo` | No migration creates it and the types do not mention it — suspect the caller |
| `migration-held` | A migration naming it is recorded in `HELD.md`, i.e. deliberately not applied |
| `migration-not-in-ledger` | The tree creates it, the ledger has no row — and the ledger is not authoritative |
| `schema-cache-stale` | PostgREST cache miss for an object this repo does define |
| `object-defined-but-unreachable` | Tree and ledger both have it — suspect grants, `search_path`, schema exposure |

`migration-held` outranks every inference below it, but stands down when the
ledger claims that same version was applied anyway. Two disagreeing sources are
not a headline.

**Not covered.** The live catalog. This module cannot and does not query
Postgres; ground truth is `npm run db:drift:check`, and every verdict's
`nextSteps` says so.

### The reader — `drift-inputs.ts`

Scans `supabase/migrations/*.sql` for created/altered objects, `HELD.md` for
14-digit versions (the same deliberate tolerance the ledger-drift script
documents), and `src/lib/types/database.ts` for tables, view/table `Row`
columns and functions. Both file reads are cached for the process lifetime.

Two honest limitations, both stated in the file's own header:

- **The file reads do not work on Vercel.** `supabase/migrations/**` and
  `src/lib/types/database.ts` are repository files, not part of a traced
  serverless function bundle. In a deployed Bridge both axes report `unknown`
  and the detail surface renders `UNREADABLE`. Making them readable would mean
  adding `outputFileTracingIncludes` to `next.config.mjs` — a deliberate,
  separate change that this track did not make.
- **The applied-ledger read is NOT VERIFIED.** It is one bounded Management API
  query (`select version from supabase_migrations.schema_migrations`), gated on
  `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`, on demand only, mirroring
  `release-context.ts`'s existing `fetchProductionMigrationHead`. `.env.local`
  is withheld from worktrees, so it has never been observed returning a
  non-null result here. Cost (§4): a read, no polling, no schedule, no writes.

---

## 3. Authorization diagnosis — `authorization-diagnosis.ts`

**Input.** An envelope subset plus an explicit `AuthorizationExpectation`.
**Output.** `AuthorizationDiagnosis` with the §68 runbook.

**There is no default expectation, on purpose.** Nothing in a `42501`
distinguishes an expected security denial from a product defect: same SQLSTATE,
same relation, same role. Only the call site knows. Defaulting a silent caller
to "expected" hides authorization defects; defaulting to "unexpected" pages
someone for a routine permission check, which the brief's own anti-pattern list
names. A caller that states nothing gets `UNKNOWN` — still actionable, because
a human must decide which it is, but never presented as either verdict.

| Verdict | When |
| --- | --- |
| `EXPECTED_SECURITY_DENIAL` | The call site declares a denial a possible correct outcome. `actionable: false` |
| `UNEXPECTED_PRODUCT_FAILURE` | The call site declares this path always authorized |
| `UNKNOWN` | The call site stated nothing |
| `NOT_AN_AUTHORIZATION_FAILURE` | Not a `42501`-family mechanism |

**The runbook**, in the brief's own order, pruned by surface: is it expected ·
RPC or table · invoker-rights or definer-rights · `search_path` · schema USAGE ·
EXECUTE grant · table/column privilege · RLS policy · recent release or
migration · reproduce as the role. An RPC denial drops the table-privilege step;
a table denial drops the function-only ones; an unknown surface keeps both
branches rather than guessing. Every step is a **question**; nothing proposes a
grant, a policy edit, or any SQL.

**Privacy is structural, not conventional.** The input type does not accept a
message, `details` or `hint`, so a policy predicate has no code path to travel
in. Every emitted string is assembled from enumerated dimensions. A test passes
a sentinel-bearing message through a widened cast and asserts the serialized
output does not contain it.

**Not covered.** Which policy is missing, and why. That requires reading the
catalog as the affected role, which is the runbook's own last step and belongs
in a local stack.

---

## 4. Release correlation and causal confidence — `release-correlation.ts`

**Input.** `OccurrenceFacts` (first-seen, the event's own release identity, the
SQLSTATE) plus `ReleaseFacts` (release-side facts, every one `boolean | null`).
**Output.** `ReleaseCorrelation`.

### Signal independence — the design constraint

PR #1789 fixed a defect in `src/lib/admin/incidents/release-context.ts` where
proximity was counted both as the trigger for considering a release and as
corroboration for it, producing a "new after release" verdict at 60% confidence
from timing alone. The mechanical cause is a category error: a signal derived
from the incident restating its own occurrence cannot corroborate a hypothesis
about the incident's cause. Every signal here is therefore sorted into one of
three buckets, and only one can raise the ladder.

**Corroborating — release-side facts.** Each is a property of the release,
determined by reading the diff or the deployment ledger, whose value is the same
whether or not this incident ever occurred. That is the independence test.

```text
featureChanged                the diff touched this feature's code
rpcOrRelationChanged          the diff touched this RPC or table
codeInTraceChanged            the diff touched code the failing trace ran
migrationNamesObject          a migration in this release names the object
candidateCohortOnly           only the exposed cohort is affected
baselineCohortClean           the unexposed cohort stayed clean
replayReproducesOnNewShaOnly  a replay separates the two SHAs
```

**Not corroborating — restatements of the incident.** Emitted in the output so a
reader sees they were considered and rejected, never counted: timing proximity;
occurrence count and severity; and **SQLSTATE mechanism fit on its own** — a
`42P01` is a missing object whichever release is live. Mechanism fit corroborates
only when paired with the release-side fact that this release carried a migration
naming that object, and then it is the migration doing the work, which is why the
pairing lives in the first bucket. A migration also does not corroborate a
mechanism it could not produce (a `40P01` deadlock).

**Exculpatory — can only lower the rung**: an overlapping provider outage; the
same fingerprint recurring after unrelated releases (historical similarity
usually argues *against* a specific release); presence on the baseline SHA.

### The ladder

| Rung | Reached when |
| --- | --- |
| `unknown` | The deploy time is unknown — nothing is computable |
| `no-signal` | First seen before the deploy, or well outside the window |
| `possible` | Inside the window, nothing corroborates. **The ceiling for proximity alone** |
| `likely` | Inside the window AND at least one corroborating signal |
| `reproduced-cause` | Experimental evidence only: replay-on-new-SHA-only, or candidate-only plus baseline-clean |

No accumulation of observational signals reaches `reproduced-cause`; half an
experiment (candidate-only without a clean baseline) is only `likely`. Presence
on the baseline SHA drops even a reproduced cause to `no-signal`. A provider
outage or historical recurrence caps at `possible`.

**There is no numeric confidence in the output.** A number invites exactly the
"base plus 0.1 per signal" accumulation that made #1789 look quantitative when it
was not.

`correlateHealthRegressionWithRelease` is the §42 second half: a scheduled sample
carries no release identity of its own, so the wrapper makes the deployment-ledger
substitution explicit and the result's `releaseIdentitySource` reads
`deployment-ledger` — the weaker attribution it is.

**Not covered.** Determining any of the release-side facts. Every one arrives as
an argument; a caller that cannot determine one passes `null`, which is treated
as "not determined" and never as `false`. `incident-detail.ts` today determines
exactly one of them (`migrationNamesObject`, from the drift diagnosis) and leaves
the rest `null`.

---

## 5. Service layers — `service-layers.ts`

**Input.** An envelope subset. **Output.** `ServiceLayerAttribution`.

Two questions kept apart:

```text
observedLayer      where Helm saw it        mechanical, from `service`
likelyOriginLayer  where it probably started  a judgement
```

Collapsing them loses the diagnosis. A board grouping every PostgREST-surfaced
failure under PostgREST points an operator at the wrong process for most of its
rows. The strongest rule: **a five-character SQLSTATE is a Postgres verdict
wherever it surfaced** — a `42501` relayed by PostgREST, a `57014` wearing a
Storage label, a `40P01` inside an Edge Function all attribute to Postgres.

Layers: `gateway_api`, `auth`, `postgrest`, `postgres`, `storage`, `realtime`,
`edge_function`, `unknown`. `pg_cron` and `pg_net` observe as `postgres`.

**Ambiguity is an answer.** `PGRST003` (a pool timeout) fits a slow Postgres and
an exhausted PostgREST pool identically; an HTTP 5xx with no service-specific
code fits the gateway and everything behind it. Both return
`likelyOriginLayer: 'unknown'`, `ambiguous: true`, and **both candidates named**
in `candidateLayers`.

`attributeMultiLayerEvidence` folds several envelopes believed to be one root
cause (§33) and returns the deepest *decided* origin, because a failure that
reached Postgres explains the relays above it. Two decided origins at the same
depth, or an all-ambiguous set, stay `unknown`.

**Not covered.** Distinguishing the Supabase edge gateway from Vercel's. Nothing
in the envelope separates them, so both fall under `gateway_api`.

---

## 6. Per-journey DB call budgets — `call-budgets.ts`

**Input.** `JourneyCallWindow[]`. **Output.** `JourneyCallBaseline` and
`CallAmplificationFinding`.

**There is no per-journey threshold table in this file.** "Round tracking should
make at most 7 DB calls" is a number nobody has measured, and once written down
it reads as authoritative forever — the rot `.claude/rules/shipping.md` §1
legislates against. What ships is a baseline **computed** from observed windows
plus a **relative** amplification test whose only constants are a global ratio
(default 2x) and a global absolute floor (default 5 calls), both overridable per
call and neither attached to any journey.

- `baseline_status: 'collecting' | 'ready'`, matching `health-rules.ts`'s
  vocabulary so the Bridge renders both the same way. Below
  `CALL_BUDGET_MIN_WINDOWS` windows the value is `null` — never zero, never a
  fabricated pass.
- **Median, not mean**, so one backfill or retry storm cannot drag the baseline
  up and then hide the amplification this exists to catch.
- **Calls per execution** is the meaningful unit for N+1: twice the traffic is
  twice the calls and is not amplification. The unit is decided by the whole
  window set, so a median is never a mixture of two units, and a per-execution
  baseline compared against a window with no execution count is **refused**
  (`ratio: null`) rather than turned into a meaningless number.
- `afterRelease` is reported but never required for a finding — a call explosion
  inside one release is still worth seeing.

**NOT WIRED, and this is the honest gap.** `helm_debug.db_stat_deltas` persists
`queryid`, `safe_query_class` and `source_class` per 15-minute window and has
**no journey dimension**, so nothing in this repo can attribute a DB call to a
journey today. This module is the evaluator only. Wiring it needs either a
journey tag carried into `pg_stat_statements` (an application-name or comment
convention, not built) or a separate per-journey counter. Building a fabricated
attribution to make the module look wired would be worse than an honest
`collecting`.

---

## 7. The Bridge incident detail — `incident-detail.ts` and the page

`fetchDatabaseIncidentDetail(fingerprint)` composes four collector reads
(`helm_debug_read_db_error_events`, `..._db_health_history`,
`..._db_lock_incidents`, `..._db_stat_deltas`), the drift inputs, and four of
the five pure evaluators into one `DatabaseIncidentDetail`.

**Every section degrades on its own.** Each composed section carries a
`SectionState` beside its data:

| State | Means | Rendered |
| --- | --- | --- |
| `ok` | Read, has data | the section body |
| `empty` | Read successfully, nothing in the window | `NONE IN WINDOW` |
| `unconfigured` | The migration behind it is HELD | `NOT SHIPPED YET` |
| `blind` | A genuine read failure | `UNREADABLE` |

A "locks at the time" panel rendering "none" while the locks migration is HELD is
a confident wrong answer, worse than a blank one. Only the error store itself
failing makes the whole result `unconfigured`; the established code set
(`PGRST202`, `42883`, `42P01`, `3F000`, plus the "could not find the function"
wording) distinguishes not-applied from broken, per reader.

**Structurally unconfigured, and stated rather than omitted:**

- `dataInvariant` — no invariant registry is wired to a fingerprint in this repo.
- `sentryIssue` — the Sentry issue is not fetched; the trace id on the event is
  the correlation key. Fetching it would add a credential dependency and a second
  failure mode for a link.
- `identity.httpStatus` — the error store has no HTTP column. Renders
  "not captured", never `0`.

**Health and locks "at the time"** mean within 30 minutes of the last
occurrence. A sample further away is `empty`, not presented as contemporaneous.
**Query health** shows only rows carrying a regression flag; the rest is ordinary
workload and would be noise.

**The authorization expectation is read back** from the stored `expectedness`
(`expected` → `denial-is-possible`, `unexpected` → `must-be-authorized`,
anything else → `unknown`), which already encodes what the call site declared.
It is never guessed from the feature name.

**Workflow stages** derive from the service-layer attribution rather than being
re-decided, and mark **every** stage `unknown` when the origin layer is ambiguous
— a guessed stage marker is worse than none.

### The surface

`/admin/database?incident=<fingerprint>` renders the detail above the existing
sections; each error-group row links to it. `searchParams` rather than a route
segment, because a fingerprint is pipe-delimited
(`supabase|postgrest|round_tracking|rpc|save_partial_round_atomic|42501`) and
because it keeps `requireSuperAdmin()` in one place — it still runs before any
data access, including before the query string is read.

Fairway tokens only, the page's existing `Surface` / `Inset` / `Eyebrow` /
`DatelineRule` / `PanelBoundary` structure, no side-rail cards, nothing animates.

---

## 8. What this track deliberately did NOT build

- **Anything Track C owns**: the Metrics API reader, advisors, platform rules,
  on-demand log evidence, the declarative alert policy with retry-storm
  detection, the repo-doctor module, the trace-certification script. Nothing
  here imports them; where one would help, the section degrades to unknown.
- **A migration.** Every read in this track goes through an RPC that already
  exists (HELD or not); the drift inputs are files and one Management API query.
  No new table, no new facade, no new `HELD.md` row.
- **A journey-attribution collector** for §53 — see the gap in section 6.
- **A Sentry issue fetch**, a Flight Recorder read, or any change to
  `src/lib/admin/incidents/**`.
- **An `outputFileTracingIncludes` change** to make the drift file reads work in
  a deployed Bridge.

## 9. Verification

```text
npx tsc --noEmit -p .                                              clean
npx eslint <every changed file> --max-warnings 0                   clean
npx vitest run src/lib/observability/supabase src/lib/admin/database
  src/app/admin/__tests__                    35 files, 463 tests passing
```

`npm run build`, `npm test` in full, and `npm run test:rls` were **not run** —
excluded by this track's own constraints. No database was queried; no credential
was available in this worktree.
