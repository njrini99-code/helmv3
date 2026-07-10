<!--
STATUS: PARKED
DATE: 2026-07-10
PARKING DECISION: Self-declared "Status: DESIGN ONLY. No product code, no migrations applied." Dated 2026-06-24. No evidence found of the proposed DB objects being applied as of this 2026-07-10 pass.
KEPT FOR HISTORY -- do not delete this file.
-->

# GolfHelm / CoachHelm Engine Upgrade Plan

**Make the engine (a) more golf-aware and (b) genuinely trained/learning on real golf data**

> Status: DESIGN ONLY. No product code, no migrations applied. Every proposed
> DB object is called out for golf-safety review (the Supabase DB is SHARED
> with GolfHelm production).
> Author leg: planner agent. Date: 2026-06-24.

---

## 0. How to read this

The engine is **not a blank slate** and the plan must respect that. Two findings
reframe the whole effort and are baked into every section:

1. **The v3 self-learning loop is LIVE, not inert.** Memory said the
   "effectiveness weight is static." That is true of the *v2* rollup table
   (`golf_insight_effectiveness`) but **false** of the v3 path. The v3 ranking
   reads a real, outcome-updated coach weight:
   - `src/app/api/cron/v3/causality-attribute/route.ts:308-321` computes a
     direction-corrected `improvement_lift` (14d-pre / 21d-post window) and calls
     `updateCoachWeight()` → upserts `golf_coachhelm_coach_weights`.
   - `nextWeight()` (`src/lib/coachhelm/v3/causality/attribute.ts:482-494`) is a
     magnitude-/sign-aware EMA toward `target = 1 + tanh(lift)`, `alpha =
     1/(sample_n+1)`, hard-clamped `[0.25, 2.0]` — a crude-but-real Bayesian-ish
     learner.
   - `scoreInsight()` (`src/lib/coachhelm/v3/ranking/score.ts:239-272`) reads that
     weight via `loadCoachWeightsForPlayer()` (`score.ts:293-327`), gated at
     `sample_n ≥ 10`, and multiplies it into the rank.
   So **we build ON this loop — deepen and feed it — not stand one up from zero.**

2. **The engine is data-starved, not algorithm-starved.** The single most
   revealing file in the codebase is
   `src/lib/coachhelm/v3/causality/metric-sources.ts`. It is a *blindness map*:
   nearly every advanced metric (putt-make-by-distance, approach-proximity,
   scrambling rough/fairway, three-putt-chain, compound-mistake-rate,
   short-side-proximity) is classified `intentional-null` with reasons
   `needs-shot-level-join` / `no-per-round-putt-distance-cache` /
   `needs-hole-level-sequencing`. Because they have **no per-round time-series**,
   the causality cron can't attribute lift to them, so the learning loop above
   **never accumulates `sample_n`** for those insight types and they default to
   weight 1.0 forever. **The bottleneck is per-round shot-level data structure,
   not model sophistication.**

These two facts drive the phase order: the cheapest highest-leverage move is to
**build the per-round shot-level/hole-level caches** that simultaneously deepen
golf reasoning, feed the existing learning loop, and ground the LLM — one build,
three vectors.

---

## 1. Current-state map (cited)

### 1.1 Engine layout
- **v2** (`src/lib/coachhelm/v2/`): `orchestrator.ts` (97 KB pipeline),
  `mining/` (`causal-engine.ts`, `pattern-miner.ts`, `approach-analytics.ts`,
  `shot-pattern-miner.ts`, `lie-specific-analysis.ts`, `correlation-discovery.ts`,
  `tee-strategy.ts`, `course-management.ts`, `stats-insight-generator.ts`),
  `prediction/`, `learning/` (`behavior-learner`, `cross-learner`,
  `outcome-validator`), `feedback/insight-scorer.ts`,
  `nlg/insight-composer.ts`, `analytics/effectiveness-writer.ts`.
- **v3** (`src/lib/coachhelm/v3/`): `llm/` (`compose.ts`, `round-review.ts`,
  `hero-narrative.ts`, `budget.ts`, `citations.ts`, `types.ts`), `chat/`
  (`agent.ts`, `tools.ts`), `causality/` (`attribute.ts`, `metric-sources.ts`),
  `ranking/score.ts`, `metrics/registry.ts` (28 canonical metrics),
  `effectiveness/event-ledger.ts`, `practice-rx/composer.ts`, `ingest/`.

### 1.2 The Strokes-Gained subsystem
- SG headline (5 components) is denormalized onto `golf_rounds`
  (`strokes_gained_total | _tee | _approach | _around_green | _putting`) and read
  per-round by the attribution cron via `metric-sources.ts:183-187`.
- Player-aggregate SG lives in `golf_player_stats_cache`. Per-team selectable
  baselines (PGA / Women / Scratch / D1–D3) are stored in DB and mirrored in TS
  (`src/lib/golf/sg-benchmarks.ts`, `src/app/golf/actions/team-sg-baseline.ts`,
  `recompute_team_sg` RPC). **Sync risk:** the TS scale constants must stay in
  lockstep with the DB `sg_baseline_scale` (existing known gotcha).
- Calibration is Broadie PGA Tour (migration 140000), validated by the rule
  `SG_total ≈ −(over par)`.

### 1.3 The LLM layer
- `compose()` (`src/lib/coachhelm/v3/llm/compose.ts`) is the single chokepoint:
  budget gate → `generateText` (Vercel AI Gateway) → **citation verifier** → one
  grounded retry → deterministic template fallback → log
  `golf_coachhelm_llm_calls` → `recordSpend`.
- Budget gating (`budget.ts`): per-`(coach, day)` row in
  `golf_coachhelm_llm_budget`; default budget resolved from
  `golf_coachhelm_settings.llm_budget_usd_per_day`; **default 0 = deny**.
- Tasks: `round_review` + `hero_narrative` on Haiku, `coach_chat` on Sonnet
  (`types.ts:MODEL_FOR_TASK`).
- **Grounding gap:** prompts contain ONLY the player's own numbers plus a couple
  of labels (`round-review.ts:145-209`). There is **zero external golf coaching
  knowledge** in any prompt. The model can phrase; it cannot teach a cause.

### 1.4 The chat agent
- `chat/agent.ts` wires a Sonnet `ToolLoopAgent` over **10 READ tools**
  (`chat/tools.ts`): context, insights, standing, recent rounds, compare,
  team overview, team patterns, goals (×2), and a **propose-only** goal tool.
  **There is no tool to compute SG, find similar players, pull drills for a fault,
  or simulate scoring impact** — exactly the four the brief wants. (The drill
  library and a Practice-Rx composer already exist —
  `src/lib/coachhelm/v3/practice-rx/composer.ts`, `golf_drills.impacts_metric_id`
  — so "pull drills for a fault" is a thin wrapper, not new infrastructure.)

### 1.5 The data structures that gate everything

| Table | Has (today) | Missing (gates awareness) |
|---|---|---|
| `golf_shots` (db doc L1262) | `hole_number, shot_number, shot_type, club_used, club_type, distance_to_hole_before/after (+units), shot_distance, lie_before/after, result, is_penalty, penalty_type, putt_made, putt_distance_feet, putt_break, putt_slope, miss_direction` | **shot SHAPE (draw/fade), launch/face/path, curvature, carry-vs-total split, x/y landing dispersion, intended target/aim, pin position, hazard geometry** |
| `golf_holes` (L540) | `round_id, hole_number, par, score, putts, fairway_hit, gir, up_and_down, sand_save, penalty_strokes` | no course link, no yardage, no hazards |
| `golf_course_holes` (L377) | `course_id, hole_number, par, yardage, handicap_index` | no hazard geometry, no pin position |
| `golf_courses` (L389) | `par, course_rating, slope_rating, holes` | (course difficulty IS available — good) |

**This table is the honest spine of the whole plan.** Anything computable from
the left column ships now; anything in the right column needs richer manual
entry or sensor ingest (Vector 5).

---

## 2. Honesty ledger — grounding vs. training, ROI

| Vector / build | Type | ROI | Note |
|---|---|---|---|
| **Encoded causal-attribution model** (V1) | **Encoding** (rules + stats) | **High / cheap** | Deepest golf-awareness win. Hand-encoded chains + existing causal stats. |
| **Per-round shot-level caches** (V1 data) | Data engineering | **Highest / medium** | Unblocks 3 vectors at once. Pure additive tables. |
| **Situation / Par / Shape awareness** (V1) | Encoding (mostly) | High / mixed | Par = cheap+now. Situation = medium. Shape = sensor-gated. |
| **Predictive models** (V2) | **Genuine ML training** (gradient-boosted / statistical) | Medium / medium | The real "trained" win, but needs data depth first. |
| **Effectiveness loop deepening** (V2) | **Genuine training** (Bayesian/bandit on real outcomes) | High / cheap | Loop already exists — extend, don't build. |
| **Cross-program corpus** (V3) | Training + governance | Medium / medium-high | The data moat. Privacy-gated. |
| **RAG grounding** (V4) | **Grounding** (retrieval, NOT training) | **High / cheap** | Recommend RAG decisively OVER fine-tuning. |
| **Golf-specific agent tools** (V4) | Encoding / wiring | High / cheap | Mostly wrappers over existing compute. |
| **Sensor ingest** (V5) | Data capture | High payoff / high cost | The fuel. Partnership-gated. Least urgent to *start*, but everything shape-related blocks on it. |
| **Fine-tuning a golf LLM** | Training | **Low / expensive** | Explicitly DEFERRED. See §8.4. |

**The deepest golf-awareness win is the encoded causal model + RAG. The real
"trained" win is the predictive models + the (already-live) effectiveness loop.
Fine-tuning is the least worth doing first.**

---

## 3. Golf-safety / shared-prod-DB rules (apply to EVERY DB change below)

The Supabase project backs **GolfHelm production**. Every schema change in this
plan MUST be:
1. **Purely additive** — new `golf_*` tables/columns only; never alter or drop an
   existing column a product read depends on.
2. **`REVOKE ALL ... FROM anon`** immediately after create (a `CREATE TABLE` in
   `public` auto-grants via default privileges — known gotcha; verify ACL via
   `pg_class.relacl`, not `information_schema`).
3. **RLS enabled** with team-scoped policies mirroring the existing CoachHelm
   tables; service-role-only for the cron/recompute writers.
4. **Pinned `search_path`** on every new SECURITY DEFINER function.
5. **No destructive writes in any save/sync path** — upsert / soft-supersede
   only (the existing `causal-engine.ts` is the reference pattern).
6. **Golf-safety reviewed** before apply, and applied via the standard migration
   flow (never an ad-hoc `apply_migration`).

Every proposed table below carries a `[DB — golf-safety review]` tag.

---

## 4. VECTOR 1 — Deeper golf reasoning

This is the largest vector. It has five sub-builds: (1.A) the per-round
shot-level cache that everything else needs, (1.B) the encoded causal-attribution
model, (1.C) dispersion / miss-pattern mining, (1.D) DECADE-style decision
critique, (1.E) context-normalized baselines. The three first-class awareness
dimensions (situation / par / shape) are folded in across 1.A–1.D and called out
explicitly in §4.6.

### 4.A — Per-round shot-level & hole-sequence cache `[DB — golf-safety review]` — **effort M, do FIRST**

**Current state:** `metric-sources.ts` proves the gap — putt-make-by-distance,
approach-proximity, scrambling-by-lie, three-putt-chain, etc. are all
`intentional-null` because there is no per-round structure to average over a
window. The data EXISTS in `golf_shots` (lie, distance, putt_distance_feet,
miss_direction) — it is just never rolled up per round.

**Build:** two additive cache tables, written by a post-round trigger (reuse
`v2/post-round-trigger.ts`) and backfilled once.
- `golf_round_putt_distance_cache` — one row per `(round_id)`: made/attempted
  putts bucketed (3–5 / 5–10 / 10–15 / 15–25 / 25+ ft) from
  `golf_shots.putt_distance_feet` + `putt_made`; plus per-round miss-bias counts
  from `putt_break`/`putt_slope`/`miss_direction`.
- `golf_round_shot_rollup_cache` — one row per `(round_id)`: approach proximity
  by start-distance bucket (from `distance_to_hole_before/after` on approach
  shots), scrambling split by `lie_before` (rough / fairway / sand), penalty
  shots by lie, and a **hole-sequence digest** (ordered per-hole score-to-par for
  three-putt-chain / compound-mistake detection) stored as JSONB.

**Payoff:** graduates ~12 of the 28 metrics from `intentional-null` to real
sources in `metric-sources.ts` (the file literally names the future table:
"A future migration that adds a `golf_round_putt_distance_cache` … would graduate
these"). This **feeds the live learning loop** (those insight types start
accumulating `sample_n`) AND **deepens reasoning** AND gives RAG real numbers.
**One build, three vectors.**

**Dependencies:** none — pure rollup of existing columns.
**Risks:** backfill cost on large players (respect the PostgREST 1000-row cap —
paginate via `fetchAllRowsResult`, a known gotcha). Trigger must be non-destructive
upsert.

### 4.B — Encoded causal-attribution model — **effort M**

**Current state:** `v2/mining/causal-engine.ts` is a real Bradford-Hill-style
tester (temporal precedence, dose-response, natural experiments, Pearson) but
runs on **4 hardcoded round-level hypotheses** (`causal-engine.ts:115-157`):
putts→score, GIR→score, fairways→score, practice-freq→score. It can say "more
GIR correlates with lower score." It **cannot** say "your 3-putt problem is
actually an approach-proximity problem" because it never sees the intermediate
nodes.

**Build:** a **golf causal graph** encoded as a typed DAG (new
`src/lib/coachhelm/v3/causality/causal-graph.ts`) of the well-established
SG-coaching chains, each node mapped to a metric the §4.A cache now produces:
- `driving_distance → approach_distance_remaining → approach_proximity → GIR →
  birdie_conversion → scoring` (distance buys shorter approaches).
- `approach_proximity → first_putt_distance → 3-putt_rate` — **the headline
  attribution** ("3-putts are really an approach-proximity problem": if a
  player's 3-putt rate is high but `first_putt_distance` is long, the root cause
  is approach proximity, not the stroke).
- `tee_accuracy → lie_before_approach → approach_proximity` (rough penalty
  cascades).
- `short_side_rate → scramble_conversion → bogey_avoidance` (DECADE short-side
  chain).
- `wedge_distance_control → scoring_club_proximity → birdie_conversion`.

The encoded chain provides the **mechanism + node order**; the existing
`causal-engine.ts` machinery provides the **per-player statistical test** at each
edge. Root-cause attribution = walk the chain, find the earliest node where the
player is below baseline, and attribute downstream symptoms to it. Output is
written to the existing `golf_causal_relationships` table (extend, don't
replace) with a `root_cause_node` field. The exact chain list + edge logic will
be reconciled against `docs/v3-research-golf-domain.md` (CAUSAL CHAINS section)
before build.

**Dependencies:** §4.A (the intermediate-node metrics).
**Risks:** over-attribution; mitigate with the existing confidence gating and the
`intervention_potential` field already in the causal engine.

### 4.C — Shot dispersion / miss-pattern mining — **effort M**

**Current state:** `shot-pattern-miner.ts` + `approach-analytics.ts` exist and
already emit per-bucket metrics (e.g. `approach_direction_<150_left`), but they
are classified legacy `intentional-null` because there's no per-round home for
them.

**Build (on §4.A cache):** SG-by-distance-bucket and scoring-club analysis from
`golf_shots`:
- **Miss-pattern shapes** from `miss_direction` + `result` + `lie_after`:
  cluster the player's misses (e.g. "approach misses long-right 38% of the
  time"). This is computable TODAY (no shape sensor needed) because
  `miss_direction` is captured.
- **SG-by-distance-bucket**: SG attributed to each approach/putt distance band
  → "you bleed 0.4 SG/round from 150–175 yd."
- **Scoring-club analysis**: per-`club_used` proximity + SG → "your gap wedge is
  your worst scoring club."
- **Dispersion ellipses** where x/y exists (sensor-fed; see V5) — until then,
  approximate dispersion from `miss_direction` × magnitude buckets and label it
  **inferred, low-confidence**.

**Dependencies:** §4.A.
**Risks:** small per-round samples — apply the existing `sampleDamping`
(`ranking/score.ts:155-162`) so thin buckets don't out-rank deep leaks.

### 4.D — DECADE-style strategy / decision critique — **effort M–L**

**Current state:** `tee-strategy.ts` + `course-management.ts` give crude
tee-club heuristics. There is **no decision model** that separates a bad
*decision* from a bad *result*.

**Build:** a **decision-quality layer** that classifies each shot's *intent vs.
outcome* and judges the decision in context:
- Per-shot **green-light / yellow / red** classification (DECADE) from
  `lie_before` + `distance_to_hole_before` + hole `par`/`yardage`
  (`golf_course_holes`) + score state (§4.6.1). **Full** green-light/red needs
  hazard geometry + pin position the schema LACKS — so v1 ships an
  **approximate** classifier (distance + lie + miss-direction risk) labelled as
  such, and a true classifier is gated on course-hazard enrichment (V5 adjacency).
- **Decision vs. result divorce:** a green-light aggressive line that found water
  is a *good decision, bad result* — the critique must say so, not punish the
  player. This is the core DECADE insight and the thing no competitor in our
  data has.
- **Target-selection critique:** given the player's own dispersion (§4.C) and
  carry numbers (§4.6.3), was the aim point sane? ("With your fade dispersion,
  aiming at a right pin over water is a red-light play.")

**Dependencies:** §4.A, §4.C, §4.6.1 situation model. Hazard-aware version → V5.
**Risks:** without hazard data the classifier is heuristic; be explicit in copy.

### 4.E — Context-normalized baselines `[DB — golf-safety review]` — **effort M**

**Current state:** SG uses a per-team selectable baseline but raw stats
(proximity, scoring) are compared against flat baselines — a 76 into a 30-mph
wind on a 75-rated course reads the same as a 76 on a soft muni.

**Build:** normalize raw metrics by **course difficulty** (`golf_courses.
course_rating`/`slope_rating` — available today), **tee/yardage**
(`golf_course_holes.yardage`), **gender** (team baseline already selectable), and
**season** (date-bucketed). Wind needs a weather field that doesn't exist —
add an optional `golf_rounds.conditions` JSONB (additive) for manual/imported
wind, and treat it as optional. Store normalized baselines in a new
`golf_context_baselines` table keyed by `(metric, difficulty_band, gender,
season)` — populated from the cross-program corpus (V3) once it exists, seeded
from PGA/college research numbers until then.

**Dependencies:** V3 corpus for the richest version; ships seeded-baseline first.
**Risks:** thin per-band samples early — fall back to the flat baseline with a
disclosed confidence.

### 4.6 — The three first-class awareness dimensions

#### 4.6.1 SITUATION awareness — **effort M**
*What it means:* the engine understands the CONTEXT of each shot and round, not
just aggregates — score state vs. par, front/back nine, momentum, what the player
"needs," and a per-shot role (stock / scoring / recovery).

*Data backing (cited):*
- **Computable TODAY:** running score-state per hole = cumulative
  `golf_holes.score − golf_holes.par`; front/back split + momentum from the
  per-hole sequence; per-shot **role inference** from `golf_shots.lie_before` +
  `distance_to_hole_before` + `shot_type` (e.g. lie=`rough`,
  short distance → recovery; fairway, scoring distance → scoring shot). Hole
  length + difficulty from `golf_course_holes.yardage`/`handicap_index` when the
  round links a cloud course.
- **NEEDS RICHER CAPTURE:** a true DECADE green-light/red per shot needs **hazard
  geometry + pin position**, which `golf_shots`/`golf_course_holes` do **not**
  have. v1 ships an approximate situation tag; true classification is V5-adjacent
  (course-hazard enrichment).

*Build:* a `SituationModel` (`src/lib/coachhelm/v3/situation/model.ts`) computed
from the §4.A hole-sequence digest → per-shot `{score_state, nine, momentum,
role, pressure_level}`. Persisted into `golf_round_shot_rollup_cache`
(JSONB, additive — no new table). It is the substrate for: attribution ("given
you were +2 needing a move, the aggressive par-5 line was correct"), the DECADE
critique (§4.D), and a chat tool (§7.4).

#### 4.6.2 PAR awareness — **effort S, cheapest+now**
*What it means:* par as a primary lens — par-TYPE strategy archetypes (par 3 =
tee shot is ~everything; par 4 = approach-club-driven; par 5 = reachable-in-two /
lay-up), and par-relative scoring analysis.

*Data backing (cited):* **FULLY computable TODAY.** `golf_holes.par` +
`golf_shots` joined by hole give: birdie conversion by par type, bogey/double
avoidance, scoring distribution + expected score per par type, par-3 proximity
(`distance_to_hole_after` on the par-3 tee shot), par-5 going-for-it efficiency
(2nd-shot `distance_to_hole_before` + `result`), and **SG split by par type**.
v3 already has `scoring_par_3/4/5` (`hole_level_avg` in `metric-sources.ts:237-239`)
and a `ParTypeGenerator` — this **extends** that, it doesn't start it.

*Build:* a par-type analytics module
(`src/lib/coachhelm/v2/mining/par-type-analytics.ts`) emitting the metrics above;
new par-archetype metric ids added to `metrics/registry.ts` **with the required
paired SQL seed migration** `[DB — golf-safety review]` and matching
`metric-sources.ts` defs (so they feed attribution + the learning loop). No new
table — all from existing columns.

#### 4.6.3 SHOT SHAPE + DISTANCE awareness — **DISTANCE effort M (now); SHAPE effort M (sensor-gated)**
*What it means:* the geometry the strategy layer needs — natural shape
(draw/fade), intended-vs-actual shape, shape-specific miss patterns, shape
consistency; and club distance profile + GAPPING, carry vs. total,
distance-control dispersion by club, proximity-by-distance, stock yardages /
wedge matrix.

*Data backing (cited) — the honesty split:*
- **DISTANCE — computable TODAY:** club distance profile + **gapping** from
  `golf_shots.club_used` + `shot_distance`; proximity-by-distance from
  `distance_to_hole_before/after`; per-club distance-control dispersion. Caveat:
  `shot_distance` is a single number — there is **no carry-vs-total split**, so
  carry analysis is approximate until sensor ingest.
- **SHAPE — NOT measured today.** `golf_shots` has `miss_direction` and `result`
  but **no shape / curvature / start-line / face-path** columns. v1 ships shape
  as **INFERRED, low-confidence** from `miss_direction` patterns (e.g. a draw
  player whose misses cluster left = over-draw / pull-hook tendency) and labels
  it as inference. **TRUE shape** (draw/fade curvature, intended-vs-actual,
  consistency) requires launch-monitor/sensor ingest — **Arccos** (dispersion),
  **Garmin** (GPS shape estimate), **TrackMan** (true launch/spin/curve). This is
  **gated on Vector 5** and must not be promised before the data exists.

*Build:* `src/lib/coachhelm/v3/shape-distance/` — a distance/gapping analyzer
(now) writing a `golf_player_club_profile_cache` table `[DB — golf-safety review]`
(per-`(player, club)` mean/SD distance + proximity), and a shape-inference module
behind a `shape_source: 'inferred' | 'sensor'` flag that upgrades to real shape
when V5 lands. Feeds target-selection critique (§4.D) and dispersion mining
(§4.C).

---

## 5. VECTOR 2 — Learn from the team's own data

### 5.A — Per-player / per-team predictive models — **effort L, genuine ML**

**Current state:** `v2/prediction/` (`performance-predictor`,
`trajectory-forecaster`, `team-forecaster`) exist but are largely heuristic
extrapolation; `golf_predictions` + `golf_prediction_model_performance` tables
exist to hold outputs + accuracy.

**Build:** **gradient-boosted / statistical models (NOT deep learning)** —
explicitly per the brief. Two model families:
- **Scoring-trajectory forecast**: gradient-boosted regression (e.g. a
  lightweight `xgboost`/`lightgbm`-equivalent runnable in a Node/Edge cron, or a
  pragmatic ridge/elastic-net + gradient-boosted residual) over features from the
  §4.A caches + `golf_player_stats_cache`: recent SG components, proximity
  trends, par-type splits, practice frequency, volatility. Predict next-round
  score-to-par + a calibrated interval.
- **Skill regression/improvement forecast**: per-component SG trajectory with
  uncertainty, flagging genuine regression vs. noise (the existing
  `outcome-validator` becomes the label source).

Train as a **service-role cron** writing to `golf_predictions`; accuracy tracked
in `golf_prediction_model_performance` (MAE already in the schema). Models are
**statistical, explainable, retrainable weekly** — feature importances become
coach-facing ("your forecast dropped mostly on approach-SG decline"). Run via
**Inngest** (already wired, free tier covers weekly backfills) — not a new
service.

**Dependencies:** §4.A caches for rich features. Ships a v0 on round-aggregate
features, upgrades when caches land.
**Risks:** small-N per player — use hierarchical shrinkage toward the team/corpus
mean (ties into V3); never present a thin-sample forecast without a wide interval.

### 5.B — Deepen the (already-live) effectiveness loop into real Bayesian/bandit — **effort M, genuine training, cheap**

**Current state (corrected):** the loop is **live** — `nextWeight()` EMA ←
`causality-attribute` cron → `rankInsights`. Its honest limits:
1. **Starved:** most metrics are `intentional-null` → `sample_n` never reaches
   the `MIN_CALIBRATED_SAMPLES=10` gate → weights stay 1.0. **§4.A fixes this
   directly** (the highest-leverage single change for the loop).
2. **Coarse:** per-`(coach, insight_type)` only — no per-player personalization,
   no exploration (it's pure exploitation of observed lift).
3. **No confidence calibration on outcomes** — the `confidence` term in
   `scoreInsight` is engine-asserted, never checked against whether the insight's
   predicted direction actually materialized.
4. **A parallel DEAD rollup:** `golf_insight_effectiveness` (written by
   `v2/analytics/effectiveness-writer.ts`) computes `effectiveness_score` but
   **nothing reads it back** — it is dashboard analytics only. (This is the table
   memory called "static" — correctly, for that table.)

**Build:**
- **Feed it (§4.A) first** — biggest single win, no new ML.
- **Upgrade `nextWeight` to a proper Bayesian update**: replace the tanh-EMA with
  a Beta/Normal-Gamma posterior per `(coach, insight_type[, intent])` so the
  weight carries a *variance*, and add **Thompson-sampling exploration** so
  rarely-surfaced-but-promising insight types still get airtime (cold-start
  problem the current pure-exploitation EMA has). Keep the `[0.25, 2.0]` clamp.
- **Confidence calibration**: a calibration job compares each insight's asserted
  `confidence` band to realized outcome direction (the
  `effectiveness/event-ledger.ts` `recordInsightOutcome` already logs the
  realized signal — `route.ts:287-296`), producing a per-insight-type reliability
  curve that rescales `confidence` in `scoreInsight`. This makes the existing
  `confidence` term *earned*, not asserted.
- **Retire or wire the dead rollup**: either read `golf_insight_effectiveness`
  back as a secondary prior, or explicitly demote it to analytics-only in docs so
  no one mistakes it for the learning signal again.

**Dependencies:** §4.A (to un-starve it). All other parts are additive to the
existing cron + ranking.
**Risks:** exploration must be bounded so a coach never sees a junk insight lead
the feed — cap Thompson variance and keep the `urgent` short-circuit
authoritative.

---

## 6. VECTOR 3 — Cross-program corpus (the data moat)

**Current state:** `v2/learning/cross-learner.ts` exists but learning is
single-team. There is no privacy-preserving cross-team aggregate.

**Build `[DB — golf-safety review]`:** an **anonymized corpus layer**.
- `golf_corpus_observations` — append-only, **no player/team identifiers**: a
  k-anonymized row per (metric, distance-band, par-type, difficulty-band, gender,
  division) carrying aggregate distributions (count, mean, percentiles) only.
  Populated by a service-role cron that aggregates across ALL teams with **a
  minimum cell size (k ≥ ~25)** before a cell is emitted — no cell can be
  back-resolved to a player.
- Two consumers: (a) the **context-normalized baselines** (§4.E) and **dispersion
  pattern detectors** train on the corpus (network effect — every new team
  sharpens every team's baselines); (b) the predictive models (§5.A) use the
  corpus mean as the **hierarchical shrinkage prior** for thin-sample players.

**Privacy / governance:**
- **Aggregate-only, k-anonymized, no raw shots leave a team boundary.**
- A team-level **opt-out** flag in `golf_team_coachhelm_settings` (additive
  column) — a team that opts out still *reads* corpus baselines but doesn't
  *contribute*.
- Corpus tables are **service-role-only**, `REVOKE anon`, RLS denies all
  authenticated reads except via a published-baseline view that exposes only
  aggregates.
- Document the data-use contract; this is the one vector with real
  legal/trust surface — gate behind an explicit product decision.

**Dependencies:** §4.A caches (the raw material to aggregate). Effort **L**.
**Risks:** privacy is the risk — the k-anonymity floor + opt-out + aggregate-only
view are non-negotiable.

---

## 7. VECTOR 4 — LLM grounding (RAG + golf tools)

### 7.1 RAG over three sources — **effort M**
**Current state:** prompts carry only the player's own numbers; the citation
verifier (`compose.ts`) already enforces "cite only supplied evidence." There is
**no knowledge base** and **no retrieval**.

**Build `[DB — golf-safety review]`:** a retrieval layer feeding `compose()`,
over three corpora:
1. **Curated golf-coaching knowledge base** — chunked, embedded passages from
   `docs/v3-research-golf-domain.md` (SG framework, putt curves, lie taxonomy,
   causal chains) + vetted coaching references. Stored in a
   `golf_kb_chunks` table with a `pgvector` embedding column (enable the
   `vector` extension — additive). This is what lets the model explain a
   *mechanism* ("a high-right miss with an iron usually traces to a steep
   angle of attack") instead of only restating numbers.
2. **The player's real numbers** — already available; now retrieved structured
   (the §4.A caches) rather than hand-passed.
3. **The engine's computed insights** — the ranked, attributed insights + causal
   root-cause (§4.B) injected as grounded context.

Retrieval runs **before** `compose()`, appends retrieved chunks as evidence, and
the **existing citation verifier guards hallucination** — RAG fits the current
architecture cleanly. Embeddings generated once (offline), cheap at query time.

**Recommend RAG decisively over fine-tuning** (justified in §8.4).

### 7.2–7.5 Golf-specific agent tools — **effort M**
**Current state:** 10 read tools, none golf-computational. Add four
(all read-only, RLS-scoped, same pattern as existing `chat/tools.ts`):
- **7.2 `compute_strokes_gained`** — on-demand SG (overall + by component + by
  distance bucket) for a player/round, reading the §4.A caches + baselines.
- **7.3 `find_similar_players`** — nearest-neighbor over the anonymized corpus
  (V3) by SG/skill profile → "players who shared this fault improved by working
  on X" (the network-effect payoff, privacy-safe because corpus is aggregate).
- **7.4 `get_drills_for_fault`** — thin wrapper over the **existing**
  `golf_drills.impacts_metric_id` + Practice-Rx composer; given a metric/fault,
  return tagged drills. (Infrastructure already exists — `practice-rx/composer.ts`.)
- **7.5 `simulate_scoring_impact`** — "if approach proximity improves to the team
  median, expected scoring delta" using the causal chain (§4.B) + SG math. Lets
  the coach ask "what's the highest-ROI thing to fix?" and get a quantified answer.

All four return structured data the verifier can cite; none writes (consistent
with the propose-only contract).

### 7.6 Cost / infra controls (fold into the above)
- Every new LLM path routes through `compose()` → inherits budget gating
  (`golf_coachhelm_llm_budget`, `llm_budget_usd_per_day`, default-0-deny) and the
  call log. **No new LLM entry points.**
- RAG retrieval is **non-LLM** (vector search) → free of the budget gate; only
  the final `compose()` call bills.
- Keep task→model assignment (Haiku for narrative, Sonnet for chat); the new
  tools ride the existing `coach_chat` Sonnet budget.
- Embedding generation is a one-time offline cost, not per-request.

**Dependencies:** §4.A (real numbers to ground), V3 corpus (for 7.3). 7.1/7.2/7.4
ship without the corpus.

---

## 8. VECTOR 5 — Data capture (the fuel)

**Current state (to be confirmed by the ingest research leg, but structurally
clear):** `src/lib/coachhelm/v3/ingest/` has provider files
(`arccos.ts`, `arccos-client.ts`, `arccos-mapper.ts`, `garmin.ts`,
`trackman.ts`), a `registry.ts`, `types.ts`, and a cron at
`src/app/api/cron/v3/ingest-sync/route.ts`. Per memory + the directory shape
these are **stubs**: no real HTTP client, no token storage, no live wiring.
(Tests exist at `src/test/coachhelm/v3/ingest/` — transactional-shape only.)

**Build (per provider):**

| Provider | What it gives | Requires | Effort |
|---|---|---|---|
| **Arccos** | Auto shot-tracking: club, distance, **dispersion**, GPS lie | Partnership/API approval + OAuth; per-provider HTTP client; env `ARCCOS_CLIENT_ID/SECRET` | L |
| **Garmin** | GPS rounds, approximate shape/distance | Garmin Connect API partnership + OAuth; HTTP client; env keys | L |
| **TrackMan** | **True launch/spin/curve/carry** (range + on-course) | Partnership (hardest); OAuth/API key; HTTP client | L |

Each needs: (1) a **token-storage table** `golf_ingest_connections`
`[DB — golf-safety review]` (per-`(player, provider)` encrypted tokens, RLS
player-scoped); (2) a real **HTTP client** replacing the stub; (3) a **mapper**
into `golf_shots` (extended additively with `shape`, `carry_distance`,
`launch_*`, `dispersion_x/y` columns — the columns §4.6.3 SHAPE needs); (4) a UI
to connect an account; (5) the cron wired to fan out per connection.

**Data-quality payoff:** sensor ingest is what graduates SHAPE from
inferred-low-confidence to measured, gives true carry-vs-total, and populates
real dispersion ellipses (§4.C) — i.e. it is the **prerequisite for the parts of
Vectors 1 and 4 that the current manual schema cannot support.**

**Dependencies:** partnerships (external, long lead) — so **start the partnership
conversations early but sequence the code last**; nothing else blocks on it.
**Risks:** partnership/legal lead time; rate limits; per-provider schema drift.

---

## 9. Phased sequence

> Principle: quick-wins that ALSO feed the loop first → the learning loop →
> corpus/sensor scale. Each phase is shippable and independently valuable.

### Phase 0 — Foundation & quick wins (effort ≈ M-S total)
- **§4.6.2 PAR awareness** (S) — fully computable now, highest certainty.
- **§4.A per-round shot-level caches** (M) — *the keystone*; unblocks the loop +
  reasoning + RAG.
- **§4.E context-normalized baselines, seeded version** (M).
- Honesty/doc fix: demote the dead `golf_insight_effectiveness` rollup.
- *Outcome:* advanced metrics graduate from `intentional-null`; the live learning
  loop starts accumulating `sample_n`.

### Phase 1 — Deeper reasoning (effort ≈ L total)
- **§4.B encoded causal-attribution model** (M) — root-cause attribution.
- **§4.C dispersion / miss-pattern mining** (M).
- **§4.6.1 situation model** (M) + **§4.6.3 DISTANCE/gapping** (M); SHAPE shipped
  as inferred-low-confidence.
- **§4.D DECADE decision critique, heuristic version** (M-L).

### Phase 2 — The learning loop, deepened (effort ≈ M total)
- **§5.B Bayesian/Thompson upgrade to `nextWeight`** + **confidence calibration**.
- **§5.A predictive models v0** (round-aggregate features) → upgrade to
  cache-rich features.
- *Depends on Phase 0 caches having accumulated a few weeks of data.*

### Phase 3 — Grounding & tools (effort ≈ M total)
- **§7.1 RAG knowledge base** + **§7.2/7.4/7.5 golf tools** (similar-players 7.3
  waits for Phase 4 corpus).

### Phase 4 — Corpus & moat (effort ≈ L total)
- **§6 cross-program corpus** (privacy-gated) → enables **§7.3 find_similar**,
  hierarchical shrinkage priors for §5.A, and the richest §4.E baselines.

### Phase 5 — Sensor scale (effort ≈ L per provider; start partnerships in Phase 0)
- **§8 Arccos → Garmin → TrackMan** ingest; graduates SHAPE to measured + true
  carry + real dispersion.

**Rough effort totals:** P0 ≈ M, P1 ≈ L, P2 ≈ M, P3 ≈ M, P4 ≈ L, P5 ≈ L×3.
**Dependency spine:** P0 (§4.A) is the hard prerequisite for the high-value parts
of P1, P2, P3 and P4. Sensor (P5) is the only vector with an external (partnership)
critical path — begin those conversations during P0 so code can land when
partnerships clear.

---

## 10. DB-change register (every proposal, for golf-safety review)

| # | Object | Type | Vector | Notes |
|---|---|---|---|---|
| 1 | `golf_round_putt_distance_cache` | new table | 4.A | per-round putt buckets + bias |
| 2 | `golf_round_shot_rollup_cache` | new table | 4.A / 4.6.1 | approach/scramble rollup + hole-seq digest + situation JSONB |
| 3 | new par-archetype metric ids + SQL seed | seed migration | 4.6.2 | paired with `registry.ts` + `metric-sources.ts` |
| 4 | `golf_player_club_profile_cache` | new table | 4.6.3 | per-club distance/proximity |
| 5 | `golf_context_baselines` | new table | 4.E | normalized baselines |
| 6 | `golf_rounds.conditions` JSONB | additive column | 4.E | optional wind/conditions |
| 7 | `golf_corpus_observations` + published-aggregate view | new table+view | 6 | k-anon, service-role, REVOKE anon |
| 8 | `golf_team_coachhelm_settings.corpus_opt_out` | additive column | 6 | opt-out |
| 9 | `golf_kb_chunks` + `vector` extension | new table+ext | 7.1 | RAG embeddings |
| 10 | `golf_causal_relationships.root_cause_node` | additive column | 4.B | attribution output |
| 11 | predictive-model feature/accuracy fields | additive | 5.A | reuse `golf_predictions`/`..._model_performance` |
| 12 | `golf_ingest_connections` | new table | 8 | encrypted tokens, RLS player-scoped |
| 13 | `golf_shots.shape / carry_distance / launch_* / dispersion_x/y` | additive columns | 8 | sensor fields (null until ingest) |

All: additive, `REVOKE anon`, RLS, pinned `search_path`, golf-safety reviewed,
applied via standard migration flow.

---

## 11. What this explicitly does NOT do (anti-scope)
- **No fine-tuning** of a golf LLM in any phase (see §8.4 below).
- **No deep learning** for the predictive models — gradient-boosted/statistical
  only (per brief).
- **No destructive writes**, **no `anon` grants**, **no non-additive schema
  changes** to GolfHelm-prod-shared tables.
- **No promising shape analysis** before the sensor data that supports it exists.

### 8.4 Why RAG over fine-tuning (justification)
- **The knowledge is small and changes**; RAG lets us edit a chunk, fine-tuning
  needs a retrain.
- **Hallucination control already exists** (the citation verifier) and composes
  with retrieval; a fine-tuned model still hallucinates numbers and would bypass
  the verifier's evidence contract.
- **Cost**: RAG adds a free vector lookup; fine-tuning adds training cost + a
  custom-model hosting cost that the Vercel AI Gateway budget model isn't set up
  for.
- **Per-player grounding can't be fine-tuned** — the player's numbers change
  every round; that's inherently retrieval, not weights.
- **When (if ever) fine-tuning is worth it:** only after RAG is saturated and we
  have a large, stable corpus of *coach-voice* preference data (thousands of
  rated narratives) and want to compress style/latency — a tone/format
  optimization, never a knowledge or accuracy mechanism. Lowest priority.

---

## 12. Open items for the research legs (to tighten before build)
- Exact CAUSAL CHAIN list + edge logic from `docs/v3-research-golf-domain.md`
  (firms up §4.B graph) and the putt-curve / baseline numbers (firms up §4.E
  seeds).
- Confirm the precise stub state + required env/OAuth per ingest provider
  (firms up §8).
- Confirm `golf_insight_effectiveness` has zero read-back callers (firms up §5.B
  "dead rollup" claim) and the v2 `golf_insight_weights` table's status.
- Confirm the SG writer paths into `golf_rounds` + the per-team scale sync
  mechanism (firms up §1.2 sync-risk note).
