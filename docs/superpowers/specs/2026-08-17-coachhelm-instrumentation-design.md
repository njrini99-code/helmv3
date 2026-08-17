# CoachHelm: instrumentation, honesty, and the action loop

**Date:** 2026-08-17
**Status:** design approved (owner, 2026-08-17) — ready for implementation planning
**Sequencing:** Approach A — instrument first, then judge

---

## Why this exists

CoachHelm is not broken. It runs nightly, writes evidence-backed findings, and
has produced 612 of them across 18 types and 42 players. Coaches have interacted
with **nine**.

The reason that is hard to act on is that the engine cannot report on itself.
Measured against production on 2026-08-17:

| Signal | Reality |
|---|---|
| `golf_coach_insights` rows | 612 |
| `action_taken = true` | **0** |
| dismissed / acknowledged / with an outcome | 2 / 5 / 2 |
| team-scoped (`player_id IS NULL`) | **0** |
| share of last 30 days from one generator | **54%** (`approach_miss`, 38 of 71) |
| `golf_insight_effectiveness` rows | 5,612 |
| …with `insights_generated = 0` **and** `effectiveness_score = 0` | **5,164 (92%)** |

### The root cause everything else hides behind

Insights upsert on `signature`. First detection INSERTs and stamps
`created_at`; every nightly re-confirmation is an UPDATE, so `created_at`
freezes permanently at the day a finding was *first ever seen*. Every read path
in the product orders by `created_at DESC`.

| Generator | Rows | Newest `created_at` | Newest `updated_at` | Touched in 7d |
|---|---|---|---|---|
| `putt_distance` | 110 | 2026-06-26 | 2026-08-17 | **110 / 110** |
| `par_scoring` | 69 | 2026-06-26 | 2026-08-17 | 30 / 69 |
| `course_management` | 46 | 2026-06-26 | 2026-08-17 | 20 / 46 |
| `scrambling` | 23 | 2026-06-26 | 2026-08-17 | 9 / 23 |
| `warmup_hole` | 16 | 2026-06-22 | 2026-08-17 | 4 / 16 |

`putt_distance` looks dead. All 110 of its rows were rewritten this week. The
generators reported as silent since June never stopped — only the column anyone
reads did.

Two consequences, and the product one is worse than the diagnostic one:

1. The feed is sorted by *how long ago a problem started*, not by whether it is
   still true, and every card wears a June date. That is a large part of why the
   feed reads as stale and generic.
2. Any conclusion drawn from `created_at` about generator liveness is wrong —
   including several framings in the current issue backlog, and including part
   of the review that produced this spec.

`src/components/golf/coachhelm/triage/SignalDossier.tsx` already hit this and did
the right thing: it deleted its "55d ago" age label rather than render a wrong
number, and left a comment naming the fix — an explicit content timestamp. That
column does not exist yet. Creating it is the first item here.

---

## Already done — do not re-plan

Two items from the originating review landed on `main` earlier the same day and
are **awaiting a production promote**, not implementation. Production is roughly
60 commits behind `main`.

| Item | Commit | State |
|---|---|---|
| Cron outcome metadata | `9f85cdf92` | `recordJobRun` extracts scalar keys from the route's JSON response into `background_job_logs.metadata`. Genome-nightly returns `players_in_chunk` and `duration_ms`, both scalars. Populates on the first production run after deploy. |
| `v3-genome-nightly` writing nothing | `2e0632326` | Root cause found and fixed: 25 players with no completed round in the 90-day window are permanently unable to produce a vector, sort first under "never-computed first", and filled the 25-slot chunk every night for six weeks. `selectGenomeRefreshChunk` now considers only eligible players. |

**Therefore the single highest-value action available to the owner is the
production promote**, which is what makes the observability in Phase 1
measurable at all. It is an owner decision and stays queued.

Also superseded: `docs/COACHHELM_FIX_PLAN.md` (2026-08-02, 675 lines). Its
Phase 4.1 "monitoring for stalled generation" is built on
`.select('created_at').gte('created_at', now - 24h)` — the column that freezes —
so shipping it would report every generator as permanently stalled. Its
calibration (1.1) and behavior-learning (1.2) work is independent and still
valid; this spec does not touch it.

---

## Scope

Three phases. Every phase after the first is judged by instruments the previous
one made honest.

| Phase | Items | Shape |
|---|---|---|
| **1 — Honesty** | Content timestamps · null-honest effectiveness · feed re-ranking | Small, coupled, ends on a coach-visible change |
| **2 — The loop** | One-tap coach action | Medium, unblocks outcome measurement |
| **3 — Structure & value** | v2 → v3 consolidation · first team-level generator | Large |

---

## Phase 1 — Honesty

### 1.1 Content timestamps

Two nullable columns on `golf_coach_insights`:

```sql
ALTER TABLE golf_coach_insights
  ADD COLUMN last_verified_at timestamptz,
  ADD COLUMN last_changed_at  timestamptz;
```

**`last_verified_at`** — a generator re-evaluated this signature and the finding
still holds. Stamped unconditionally on every write. Powers honest freshness
display ("confirmed 6h ago").

**`last_changed_at`** — the measured values moved. Powers ranking.

Both are stamped by the only two functions that write insights:

- `src/lib/coachhelm/v2/insights/upsert.ts:108` — `upsertInsight`
- `src/lib/coachhelm/v3/insights/upsert-v3.ts:56`

There is no third write path; this was verified by grepping every
`from('golf_coach_insights')` in `src/lib/coachhelm`.

#### What counts as "changed"

Diff **the measured numeric fields of `evidence`, plus `priority`**. Do NOT diff
`title` or `content`.

The prose comes from NLG and can vary between runs without anything about the
player changing. Diffing prose would make `last_changed_at` fire on nearly every
run and the ranking signal would be noise. Diffing the numbers means "changed"
fires when the player's actual measurement moved, which is the thing worth
surfacing to a coach.

Accepted tradeoff: if a generator rewrites how it *phrases* a finding without the
numbers moving, the card does not resurface. A rephrasing is not news. This is
reversible by widening the diff later.

The comparison uses the row the upsert already reads to decide insert-vs-update,
so it costs a comparison, not a second query.

#### Backfill

**Both columns backfill as NULL.** No seeding.

Seeding from `updated_at` would relabel a coach's dismissal as a generator
confirmation — a DB trigger bumps `updated_at` on any write, which is precisely
why `SignalDossier`'s comment rejects that column. Seeding from `created_at`
re-tells the lie being removed. NULL is the honest state: we genuinely do not
know when those 612 rows were last verified.

Every row self-heals on its next nightly confirmation, so the feed is fully
populated within 24 hours of the first cron run after deploy.

#### Error handling

The stamps are fields in the existing upsert payload, not a second write. If the
upsert fails, the columns stay untouched with everything else — there is no
partial state in which a row claims a verification it did not receive.

### 1.2 Null-honest effectiveness

`src/lib/coachhelm/v2/analytics/effectiveness-writer.ts:207`:

```ts
b.action_rate = b.insights_generated > 0 ? b.insights_acted_upon / b.insights_generated : 0;
```

A zero denominator yields `0`, not `null`. 5,164 of 5,612 rows (92%) are a
team-type-period that generated nothing, scored zero. The mean
`effectiveness_score` across the table is **0.002**, and any chart reading from
it reports CoachHelm as 0.2% effective — a number produced entirely by empty
cells.

Change:

- `action_rate`, `improvement_rate`, `effectiveness_score` become `null` on a
  zero denominator.
- Backfill the 5,164 fabricated-zero rows to `null`.
- Every consumer (`src/app/golf/actions/coachhelm-analytics.ts:202-213` and the
  surfaces it feeds) must render "no data" rather than `?? 0`. This is the same
  class already fixed repeatedly in the stats surfaces this year; the difference
  is that here the zero is baked into the stored data, not applied at render.

The backfill rewrites existing rows, so it gets the measure → dry-run count →
apply → verify treatment, not blind execution.

### 1.3 Feed re-ranking

Six read paths order by `created_at DESC`:

- `src/app/golf/actions/insight-management.ts:219`, `:229`
- `src/app/golf/actions/intelligence-dashboard.ts:275`
- `src/app/golf/actions/insights.ts:1222`, `:3315`, `:4043`

Re-rank on `last_changed_at DESC NULLS LAST`, with severity/priority as the
tiebreak and `last_verified_at` as the final tiebreak. Ordering by
`last_verified_at` alone would collapse to a tie — 500 rows re-confirmed the same
night share one timestamp.

Restore the age label `SignalDossier` had to delete, reading `last_verified_at`,
worded "confirmed {n}d ago" to match the chat surface's existing idiom. It renders
nothing while the column is NULL.

This is the item that makes the feed stop reading as monotonous. The engine
already produces ten distinct kinds of finding; the feed could not surface nine
of them because they were all first seen in June.

---

## Phase 2 — Close the loop

`action_taken` is false on all 612 rows because nothing in the UI writes it
cheaply. Until acting costs one tap:

- the outcome columns stay empty (2 of 612),
- effectiveness stays undefined regardless of 1.2,
- and the learning loop in `src/lib/coachhelm/v2/learning/` never receives a
  training signal.

**One-tap "Working on this"** on the insight card. It sets `action_taken`,
`action_date`, and opens the outcome measurement window. It is deliberately
lighter than the existing convert-to-focus-area path, which has produced only 25
rows in five months — that is an escalation, not the default gesture.

Outcome measurement then reads `outcome_metric_before` from the evidence at
action time and `outcome_metric_after` after the window, which is machinery that
already exists and has never had inputs.

---

## Phase 3 — Structure and value

### 3.1 Collapse to one engine

Both engines write the same table today:

| Engine | Rows | Types | Last 30d | Newest | Signature form |
|---|---|---|---|---|---|
| v3 | 500 | 10 | 56 | 2026-08-17 | `v3:<generator>:…` |
| v2 | 112 | 9 | 15 | 2026-08-17 | `<uuid>:…` |

Their type vocabularies overlap (`course_management` comes from both) and their
signature namespaces do not, so the dedup key that is supposed to keep one
finding to one row cannot span them. Lifecycle, effectiveness and ranking all
read the union of two authors who never agreed on terms.

The migration cost is five generators, not the 2,631-line orchestrator — these
are the types v2 produces that v3 does not: `pattern_detected`, `bubble_player`,
`scoring_decline`, `recurring_weakness`, `team_trend`.

Port those to v3, retire the v2 writer, renamespace its 112 rows under `v3:`.
The row rewrite gets the same measure → dry-run → apply → verify treatment.

### 3.2 First team-level generator

Zero of 612 insights have ever had `player_id IS NULL`. Team-level intelligence
has never produced a row — not degraded, never existed. Every finding CoachHelm
has ever made is about one athlete, while the buyer coaches a roster and is
asked to synthesise 42 individual reports by hand.

One generator reading across the roster — "four of your seven starters lose most
from 150–175 yards" — is worth more to the buyer than another per-player type.
`golf_patterns_v2` holds 563 rows and was written to today; the inputs exist.

---

## Testing

Every item follows the repo rule: **the failing test comes first, is run, and its
failure is quoted** before any fix.

- **1.1** — unit tests on both upsert functions: a re-confirmation with identical
  numbers moves `last_verified_at` and leaves `last_changed_at`; a
  re-confirmation with moved numbers advances both; a prose-only change advances
  only `last_verified_at`. A NULL-column row renders no age.
- **1.2** — `effectiveness-writer` returns `null` on a zero denominator, and a
  real 0-of-40 stays `0`. This is the distinction the current code destroys, and
  it is the same shape as the `safePercent` tests already in the repo.
- **1.3** — ordering test proving a June-created, today-changed row outranks a
  today-created, today-changed row of lower priority.
- **2** — the action write is authorised (a coach may only act on their own
  team's insight) and idempotent.
- **3.1** — a signature-namespace collision test: the same finding from both
  engines must dedup to one row after the port.

Gates on every commit: `typecheck`, `lint`, and the unit suite under `TZ=UTC`.
Anything touching a date or window also runs under `Pacific/Kiritimati` (+14) and
`Pacific/Midway` (−11).

## Migrations

Owner decision (2026-08-17): applied directly via Supabase MCP rather than
queued. Each migration is reviewed by the `db-migration-reviewer` agent before
apply, per `CLAUDE.md`'s mandatory rule for this shared production database.

Additive changes (the two columns) apply straight. Anything that rewrites
existing rows — the 5,164-row effectiveness backfill, the 112-row v2
renamespace — is measured, dry-run counted, applied, then verified.

## Risks

- **The two columns are only as good as the generators that stamp them.** If a
  generator writes through a path that bypasses the two upsert functions, its
  rows stay NULL and silently rank last. The test for this is a query asserting
  no non-NULL-`signature` row has a NULL `last_verified_at` more than 48 hours
  after the first post-deploy cron run.
- **1.3 changes what a coach sees on their main intelligence surface.** It should
  land in the same deploy as 1.1 so the ordering never reads from a
  fully-NULL column.
- **Phase 3.1 is the only item that can lose data.** The renamespace is an
  UPDATE on 112 rows; a dedup collision after the port could merge two findings
  that were not the same. The collision test above is the guard.

## Out of scope

- Narrative quality — whether the prose in an insight is any good. Measured here
  only as engagement.
- The LLM paths: round-review citation discards (#1474) and review generation
  coverage (#1476, 30% lifetime / 66% in August). Own issues, own fixes.
- `docs/COACHHELM_FIX_PLAN.md`'s calibration and behavior-learning items, which
  are independent and remain valid.
