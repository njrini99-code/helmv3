# CoachHelm: cron, insight accuracy, root cause, and what to wire where

**Measured** 2026-08-18 against production, signed in as coach Ben Potter
(Guilford College Men's Golf Team, 12 active players), after the promote of
`5add250d4` and the `golf_shots` RLS migration.

Everything below is a measurement, not an inference. Where I could not measure,
it says so.

---

## Part 1 — What the crons actually do now

23 cron runs since the deploy. What they wrote:

| Output | Rows |
|---|---|
| genomes | 6 |
| patterns | 3 |
| causal relationships | 1 |
| predictions | 1 |
| **new insights** | **0** |
| insights re-confirmed (upsert, `created_at` frozen) | 22 |
| standing rows | 0 |
| prediction validations | 0 |

### 1.1 The genome cron writes, but not for the team you are looking at

All 6 refreshed genomes went to **Demo University** players. **Zero Guilford.**
Guilford's compare surface still reads "last refreshed Jul 7, 2026".

Where they landed, quality is good — 5 to 7 live dimensions (Cole Bennett 7 of 8
off 17 rounds) against Guilford's 4. The engine is capable; the rotation is the
constraint.

**Fix (already filed as #1503).** `selectGenomeRefreshChunk` filters on *has ≥1
round*; the skip path triggers on *produced no dimensions*. Seven eligible
players produce nothing, never get a `computed_at`, and so sort first under
never-computed priority every night — burning 7 of 25 slots permanently.
Record the refusal (`last_attempted_at`, or a row with a skip reason) so a
player who cannot produce a vector stops competing for a slot.

### 1.2 The genome cron throws away its own diagnostics

`background_job_logs.metadata` for `v3-genome-nightly` is
`{"duration_ms": 3431, "players_in_chunk": 25}` — and nothing else.

The route returns a rich `per_player` array showing exactly which players
resolved 0 dimensions. `recordJobRun`'s `extractOutcomeMetadata` keeps only
string/number/boolean values, so the array is dropped before it reaches the log.
That is why #1503 was invisible until the job was run by hand.

**Fix.** Flatten the summary into scalars before returning:
`players_written`, `players_skipped_no_dimensions`, `dimensions_computed_total`,
`dimensions_null_total`. Same shape as the fix already shipped for
`coachhelm-validation` in `4071158f0`.

### 1.3 Prediction validation was a dead loop; half of it is fixed

`coachhelm-validation` logged `{total: 66, skipped: 66, validated: 0}` on every
one of 72 runs.

Two causes, both now addressed on `main`:

- **`225f29af0`** — the resolver windowed `golf_rounds.created_at` (the row's
  INSERT timestamp) instead of `round_date`. 260 of 326 completed rounds (80%)
  were entered on a different day than they were played, averaging 33.6 days
  apart, max 89. It both missed real outcomes and admitted rounds played before
  the prediction existed. Unblocks **5** of the 69 ripe predictions.
- **`4071158f0`** — `skipped` conflated "retired", "window closed empty" and
  "still waiting". Now three flat counters.

**Still open.** 64 of 69 ripe predictions have a window that closed with no
round in it. They are re-fetched every hour forever. They cannot be retired
naively, because this product back-dates entries (max lag 89 days), so a
back-dated round can still legitimately fill a closed window. Needs a grace
period chosen from the observed entry-lag distribution — a threshold decision,
not a mechanical fix.

### 1.4 Crons that have not reported since the deploy

These log `metadata: null` and last ran before the promote, so their new
instrumentation is unproven: `coachhelm-calibration`,
`coachhelm-insight-lifecycle`, `v3-causality-attribute`,
`v3-goal-suggestions-evaluate`, `v3-goal-suggestions-write`,
`v3-standing-refresh`, `event-reminders`. Re-check after their next run.

---

## Part 2 — Insight accuracy

### 2.1 The shot-derived numbers are correct

Verified Connor Lynde's approach card against raw `golf_shots`:

| Card claim | Raw data |
|---|---|
| 88 approaches, 50–125 yd | **88** |
| found the green 77% | **77.3%** |
| 19 ft when on the green | **18.6** |
| over 68 greens | **68** |

Four of four. **Accuracy of the shot-derived layer is not the problem.** The
problem is what the insight is *about* — see Part 3.

### 2.2 RETRACTED — the cached putting numbers are correct

**This section previously claimed the cache disagreed with raw shots by up to
13.5 points. That was my measurement error, not a product defect.** Correcting
it in place rather than deleting it, because the way it went wrong is worth
keeping.

I compared the cache against a query using bands `>= 3 AND < 5`. The writer,
`update_player_putt_make_pct` (a SECURITY DEFINER plpgsql function), uses
`> 3 AND <= 5` — exclusive lower, inclusive upper. Re-running the function's
exact aggregation against `golf_shots` today reproduces the cache perfectly:

| Band | Cache | Recomputed from shots |
|---|---|---|
| 3-5 ft | 46.5% / 43 | **46.5% / 43** |
| 5-10 ft | 27.7% / 83 | **27.7% / 83** |
| 10-15 ft | 15.6% / 64 | **15.6% / 64** |
| 25+ ft | 0.0% / 31 | **0.0% / 31** |

The TS bucketer `getPuttDistanceBucket` uses the same semantics
(`<= 3`, `<= 5`, `<= 10`, `<= 15`), so the two implementations agree. There is
no drift.

What made the wrong conclusion convincing: the 3-5 ft band had an IDENTICAL
attempt count (43) under both definitions, so it looked like the same
denominator with a different numerator — the one shape that cannot be a
boundary difference. It can: a 3.0 ft putt is in my band and not theirs, a
5.0 ft putt is in theirs and not mine, and here those happened to cancel. Equal
set SIZE is not equal set MEMBERSHIP.

**The genuine version of this concern still stands and is unenforced.** SG has
two implementations by design — `sg-benchmarks.ts` states "AUTHORITATIVE SOURCE
OF TRUTH IS THE DATABASE" and carries a "KEEP IN SYNC" comment against the DB's
`sg_expected_strokes`. Nothing tests that they agree. A reconciliation check
belongs there, where drift is possible, rather than on the putting bands, where
it is not.

### 2.3 Insight staleness is invisible

`created_at` freezes at first detection because insights upsert on `signature`.
`putt_distance` shows a newest `created_at` of 2026-06-26 while all 110 of its
rows were rewritten within 7 days. Every read path orders by that column.

Fix is specified in `docs/superpowers/plans/2026-08-17-coachhelm-instrumentation.md`
(Tasks 1–2: `last_verified_at` / `last_changed_at`), still awaiting go-ahead.

---

## Part 3 — Root cause

### 3.1 What reaches the UI today

`CausalWhyPanel` is wired — mounted in `PlayersGridView` (coach, via
`intelligence?view=players`) and `DevelopmentDrill` (player), fed by
`getTeamCausalRelationships`. It is not an unwired component.

What it receives for Guilford:

| Player | active rows | relationships |
|---|---|---|
| Luke Wise | 3 | rounds_per_week→score · gir→score · putts→score |
| James Peach | 2 | gir→score · putts→score |
| **Connor Lynde** | 2 | **fairways_hit→total_gir** · putts→score |
| Larsen Gallimore | 2 | fairways→score · gir→score |
| Braeden Gillen | 1 | gir→score |
| the other **7** | **0** | empty state |

Across the whole table: **5,642 rows, and `effect_metric` is `score_to_par` in
every row but one.** Only 169 (3%) are `is_active`.

### 3.2 The lever, and the proof it works

Connor Lynde's `total_fairways_hit → total_gir` is the only genuine causal chain
on the roster. It exists because one research-backed hypothesis pair was added
on 2026-08-17. One pair, one real root cause.

A second pair shipped in `ff87d8126`: **`total_gir → total_putts`**, backed by
`docs/v3-research-golf-domain.md:29` — *"putts-per-round is lower for bad iron
players (they chip close and 1-putt for bogey)"*. Where it holds, the card can
say "your putts per round are low BECAUSE you are missing greens", which is a
root cause rather than arithmetic.

**`generateHypotheses()` is the ceiling, not the data.** Every additional
research-backed pair with fields already on `RoundData` is a direct expansion of
what the engine can explain. Candidates need doc support; do not invent
mechanisms — the blocking review rule requires a citation.

---

## Part 4 — What to wire, and where it goes in the UI

Ranked by measured payoff.

### 4.1 Chat synthesis → the insight feed

**The biggest gap.** Asked as Ben, *"Which player should I be most worried about
right now, and why?"*, the chat returned band-by-band make rates with sample
sizes, distinguished two failure modes ("short/mid putts aren't going in" vs
"lag putts aren't finishing close enough"), and volunteered that its own evidence
was stale. Same data, same engine. The generators produce
"50-125 yd approach: 95% greens hit".

- **Where:** the Signals list on `/golf/dashboard/intelligence?view=signals`, and
  the per-player dossier in `SignalDossier`.
- **Wiring:** the chat path already assembles this via
  `v3/chat/read-tools.ts`. The feed does not use it. Either run the same
  synthesis on a schedule and persist the result, or render a synthesis block at
  the top of the signals list computed on demand.
- **Cost note:** `coach_chat` runs Sonnet at **$0.068/call**; a nightly
  synthesis for 12 players is ~$0.82. Max observed daily spend is $0.78 against
  a $3 cap, so there is headroom.

### 4.2 `golf_player_standing` → the generators

496 rows, 38 players, 22 metrics, refreshed **2026-08-17** — genuinely fresh.
Read today only by `v3/goals.ts` and `progress-drivers.ts`. Only **275 of 613**
insights carry standing.

- **Where:** the benchmark line on every insight card, replacing
  "PGA Tour ~80%, approximate" with the player's real cohort position.
- **Wiring:** generators already accept a `standing` block in `evidence`
  (275 rows prove the shape works). `approach_miss` ships
  `requiresStanding=false`; flipping that on once standing covers its metrics is
  the change.

### 4.3 `golf_insight_exposure` → ranking

**125,221 rows** across 202 insights (~620 views each) — the largest table in the
product, written by `v3/effectiveness/event-ledger.ts` and read for nothing that
affects order.

- **Where:** the sort of the Signals list.
- **Wiring:** needs `last_verified_at`/`last_changed_at` first (instrumentation
  plan Tasks 1–2), then rank on movement + severity + inverse exposure so a card
  a coach has scrolled past 600 times stops leading.

### 4.4 Drill attachments → the "so what do I do" step

63 drills, 135 attachments — **44 of them in April 2026 and one since.** Only 1
of the last 72 insights carries a drill.

- **Where:** `SignalDossier`'s Prescribe action, and the insight card footer.
- **Wiring:** find why attachment stopped in April. The library and the join
  table both exist and are populated; this is a generator-side regression, not a
  missing feature.

### 4.5 Round review → the v3 composer

Opening a real un-reviewed round as Ben generated a review with
`generation_method: 'v1'`, `ai_model_version: NULL`, `engine_version:
'coachhelm-v2'` — and **zero rows** in `golf_coachhelm_llm_calls`. The toast said
*"AI analysis complete for your round."*

- **Where:** `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx:473`
  is the hardcoded toast; the page also badges itself "CoachHelm AI".
- **Wiring:** two separable changes. (a) Make the toast derive from the result's
  own `ai_model_version` — a two-line honest fix. (b) Route the coach-facing
  review page at the v3 composer, which is a product decision.

### 4.6 `InsightsFeed` has zero mount sites

A built component with no consumer. Decide: wire it, or delete it so it stops
reading as available capability.

---

## Part 5 — Ordering

1. Instrumentation plan Tasks 1–2 (`last_verified_at`, cron metadata) — nothing
   downstream is measurable without them.
2. Cache-vs-shots reconciliation (2.2) — this one is actively wrong on a coach's
   screen today.
3. Genome chunk fix (#1503) — cheap, and Guilford is not getting refreshed until
   it lands.
4. Standing into generators (4.2) — highest quality-per-effort on the cards.
5. Chat synthesis into the feed (4.1) — the biggest win and the largest change.
