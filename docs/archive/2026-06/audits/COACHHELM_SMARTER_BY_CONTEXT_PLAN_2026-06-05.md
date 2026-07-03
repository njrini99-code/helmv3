# CoachHelm Insights & Mining — Fix List + "Smarter by Context" Plan

**Date:** 2026-06-05
**Author:** Lead engineer (insight engine)
**Scope:** Remaining correctness work + a grounded plan to make insights smarter by distance, par, lie, and context.
**Repo root:** `/Users/ricknini/Downloads/helmv3`

> **One-line thesis.** The v2 stats calculator (`src/lib/utils/golf-stats-calculator-shots.ts`) already computes a far richer grid than the v3 generators surface — 9 putt buckets, 8 approach bands × 3 lies × par-3/4/5, ATG-by-distance-lie, GIR-by-lie. Almost every "smarter by distance/par/lie" win is **read-side wiring + a few new generator instances + standing aggregation**, NOT new shot math. The two exceptions are (1) **lie granularity** (a CHECK-constraint ceiling needs a schema change) and (2) the **college/division cohort baseline** (the deferred PGA-baseline cluster), which is the keystone that makes every other number honest. Build the baseline first; everything downstream inherits its accuracy.

---

## Part 1 — What still needs to be fixed

The 2026-06-05 P0/P1 batch is confirmed fixed in code (C1 approach percent-as-feet, H1 empty subset guard, H2 zero-strokes ranking, H3 ctx-composite magnitude, H6 priority-on-update, H8 tone polarity, H9 30-49yd band edge, rate-limit gate, pressure factor 1.0→0.5, scrambling attempts-gating). What remains is below, prioritized.

### P0 — The deferred PGA-baseline cluster (the KEYSTONE)

> **Why this is the keystone, not just another bug.** Every standing bar and every counterfactual stroke number is currently benchmarked against **PGA Tour only**. A +2 D1 player is gapped Tour-sized on sand save, short-putt %, par-N scoring, and GIR — which **overstates every weakness and inflates the strokes-saved targets coaches build practice plans around**. The domain doc is explicit that the primary comparison is COLLEGE/division with Tour as an aspirational ceiling (`docs/v3-research-golf-domain.md:348-349`, Implication 2). Until `level_avg` is wired, NO downstream by-distance / by-par / by-lie number can be trusted, because each new bucket inherits the same Tour-inflated baseline. **Build this first; it unblocks honest counterfactuals everywhere.**

| # | Item | Why it matters to a coach/player | File | Fix |
|---|------|----------------------------------|------|-----|
| P0.1 | **Wire `level_avg` (college/division cohort baseline)** | Stops overstating every elite-amateur weakness; unlocks the documented "PGA + team + you" three-bar render (`docs/v3-research-competitive-landscape.md:352,362`). The column exists and the loader fetches it but it is never populated or read. | RPC body `supabase/migrations/20260527000000_prod_public_baseline.sql:4683-4702` (joins only `pga_tour_value`/`pga_p50`); column exists at `:10185`; loader SELECTs but ignores it at `src/lib/coachhelm/v3/standing/loader.ts:19-21`; never passed in `src/lib/coachhelm/v3/engine/generator-base.ts:182-194`; `cohortBaselineValue`/`CohortTier` have zero importers in `src/lib/coachhelm/v3/standing/pga-standards.ts` | Add a cohort-baseline pass to `refresh_player_standing` (group players by team division tier, compute `level_avg`/`level_n`/`level_pct` via `PERCENT_RANK` over the cohort). Then at `generator-base.ts:187-193` pass `standing.level_avg` into `computeCounterfactual` as primary baseline, `pga_value` as fallback. Render `StandingBar` with a college marker + a Tour ceiling marker. |
| P0.2 | **Scrambling hard-codes Tour 50% for college players** | A college player scrambling at the cohort-normal ~40% (`docs/v3-research-golf-domain.md:174`) is gapped 10pp × 0.03 = exactly 0.30 strokes/round — just above the 0.3 suppress floor — so it renders a recoverable-strokes projection for a **non-existent leak** and misprioritizes bunker work. | `src/lib/coachhelm/v3/generators/scrambling.ts:104` (`comparison_value: 50`), `:89` (prose "Tour average is ~50%"); factor `src/lib/coachhelm/v3/counterfactual/lookup-tables.ts:73` | Use the `scrambling_pct_sand` div1/d2/d3 baseline (~40% college) for `comparison_value` and as counterfactual baseline once `level_avg` lands; keep 50% Tour as ceiling marker only. **Depends on P0.1.** |
| P0.3 | **ParType dual baseline (display vs par, counterfactual vs PGA)** | The same card shows a vs-par delta in prose but sizes its strokes-saved against Tour `pga_value` with a 10×/4× factor — the number the coach reads is not the number used to size the leak. | display `src/lib/coachhelm/v3/generators/par-type.ts:79-103` (`comparison_value: agg.par`, `source 'absolute_target'`) vs counterfactual `generator-base.ts:182-194` + factor `lookup-tables.ts:84-86` | Use ONE explicit baseline in both — the cohort `scoring_par_N` (college par-N averages) once `level_avg` is wired. Until then relabel so displayed delta matches projected strokes. **Depends on P0.1.** |

### P1 — By-distance / by-lie STANDING gaps (the literal blockers on "smarter by distance/lie")

> These share the **same infra dependency** as P0: the data is captured (`golf_shots.lie_before`/`lie_after`, `approach_miss_details`, `putt_details`) and the counterfactual factors already exist in `lookup-tables.ts`; only the **standing aggregation** is missing. They are listed in `src/lib/coachhelm/v3/standing/refresh.ts:62-78` as `STANDING_REFRESH_DEFERRED_METRIC_IDS`.

| # | Item | Why it matters | File | Fix |
|---|------|----------------|------|-----|
| P1.1 | **Approach-proximity-by-band standings not produced** | The single biggest D1→Tour gap is 75-125yd wedge proximity (Tour 19'7" vs college 25-32ft, `docs/v3-research-golf-domain.md:120,170`). Without per-band proximity standings the wedge-gap cause + both approach composites can only gate on green-hit %, not the proximity signal that IS the gap. | deferred at `src/lib/coachhelm/v3/standing/refresh.ts:71-74`; consumers `src/lib/coachhelm/v3/composite/rules/long-approach-3putt-cascade.ts:37-42` + `short-approach-proximity-gap.ts:31-35` gate on `standing.team_pct` | Add a shot-level proximity-by-band aggregator (50-125 / 125-175 / 175+) writing `approach_proximity_*ft` standing rows from `golf_shots` + `approach_miss_details`, so `ApproachMissGenerator` ships a real anchored proximity number and composites gate on proximity. |
| P1.2 | **PuttDistance ships 3 of 5 buckets — lag standing is dead** | 3-putt avoidance is dominated by lag speed >25ft (`docs/v3-research-golf-domain.md:155-156`); `lag_distance_3putt` is the doc's #1 putting cause but it has **no standing to anchor to** because cache buckets (`15_20`, `20_plus`) don't match v3 metric edges (`15_25`, `25_plus`). | deferred at `refresh.ts:62-65`; only 3 instances built at `src/lib/coachhelm/v2/orchestrator.ts:232-234`; factors ready at `lookup-tables.ts:50-51`; skipped per header `src/lib/coachhelm/v3/generators/putt-distance.ts:18-20` | Reconcile cache buckets to v3 edges (`15_25`+`25_plus`), add them to `STANDING_REFRESH_METRIC_IDS`, instantiate the two missing `PuttDistanceGenerator` instances; resurrects `buildPuttingLagDriver`. |
| P1.3 | **Scrambling-by-lie standings not produced** | Scrambling outcome is lie-dependent (fairway-miss ~65% vs rough ~58% vs sand ~50%, sand harder than clean inside 10yd — `docs/v3-research-golf-domain.md:147,174`). Engine ships SAND only, so it can't tell a rough-chip leak from a bunker leak. | deferred at `refresh.ts:75-77`; sand-only at `src/lib/coachhelm/v3/generators/scrambling.ts:24,45` | Add a shot-level scrambling-by-lie aggregator producing `scrambling_pct_rough`/`fairway` rows from `golf_shots.lie_before`/`lie_after`, then instantiate `ScramblingGenerator` for rough + fairway. |
| P1.4 | **`approach_miss_details` (lie_type, short-side, distance_from_green) captured + stored but never read by v3** | The richest by-lie/by-context approach signal the app captures is dead weight on the v3 path — the engine never surfaces "GIR collapses from rough" or "short-siding into worse lie" as a driver. | written by submit RPC `prod_public_baseline.sql:5631`; fetched-but-unused at `src/app/golf/actions/stats-data.ts:988-993`; rich logic only in `src/lib/coachhelm/v2/mining/approach-analytics.ts:261-412` | Wire `approach_miss_details` into the shot-driver layer (`shot-drivers.ts`) so the approach theme shows a lie-aware miss-pattern driver under the proximity cause. No standing dependency. |

### P2 — Remaining correctness items (NOT baseline-dependent, NOT in the P0/P1 batch)

| # | Item | Why it matters | File | Fix |
|---|------|----------------|------|-----|
| P2.1 | **Mixed-unit composite `strokes_impact`** | `doubles-after-bogey` stores a 90-day COUNT × 0.5 while sibling composites store per-round values; the ranker and assembler tiebreak compare them directly, so the count-based composite **systematically out-ranks/over-sizes** the per-round ones (and H3 ctx-fallback now propagates the count straight into Scoring-theme magnitude). | `src/lib/coachhelm/v3/composite/rules/doubles-after-bogey.ts:87` vs `closing-hole-fatigue.ts:87` (×6), `front-9-starter.ts:87` (×3), `pressure-decel-chain.ts:75`; compared at `src/lib/coachhelm/v3/composite/assemble.ts:270` | Convert `doubles-after-bogey.ts:87` to a per-round value (divide 90-day count by rounds in window) so all composites share the per-round unit the ranker assumes. |
| P2.2 | **WarmupHole vs front_9_starter double-count opening stretch** | The same `opening_hole_delta` leak surfaces in BOTH the Pressure theme and the Scoring theme and is counted in both magnitudes — inflating total addressable strokes and showing the player two cards for one cause. | `src/lib/coachhelm/v3/generators/warmup-hole.ts:31,34` (pressure) and `src/lib/coachhelm/v3/composite/rules/front-9-starter.ts:22,75` (scoring); assembler buckets strictly by `row.category` at `assemble.ts:252-262` | Pick one home for `opening_hole_delta` (Pressure is the natural fit) or add cross-theme dedup of rows sharing a `metric_id`. |
| P2.3 | **generator-base counterfactual+standing lifecycle untested** | The producer of every user-facing stroke number + the new backfill/priority-floor logic is exercised only by the pure helpers; a regression in the seam (where most audit findings clustered) would ship green. | `generator-base.ts:134-243` (the `run()` lifecycle) | Add an end-to-end generator→rule contract test + a `run()` lifecycle test asserting `evidence.strokes_impact == counterfactual.strokes_saved_per_round` when not suppressed, plus priority-floor behavior. |

### P3 — Cosmetic / content-hygiene (self-healing or label-only)

| # | Item | Why | File | Fix |
|---|------|-----|------|-----|
| P3.1 | **ATG `20_30` bucket actually captures up to 50yd** | Any by-distance ATG insight reads the wrong distance range to a coach; counts are correct, label is wrong. | `golf-stats-calculator-shots.ts:497` (+ fields `:325,331`) | Rename key/label to `20_50` across calculator + field names **before** nesting any new ATG insight on it. |
| P3.2 | **Legacy `tee_strategy` rows filed under `course_management`** | Off-the-tee leaks on >30-day-stale rows render under the wrong theme until next regen. | `src/lib/coachhelm/v3/generators/tee-strategy.ts` files `category='tee'`; stored rows keep `course_management`; `assemble.ts:252-262` | One-time `UPDATE category='tee'` where `evidence.metric` is `sg_ott`, or re-route in assembler by `evidence.metric`. Self-heals on regen. |
| P3.3 | **"standing card below" prose baked into ParType + Scrambling** | If a flat surface (Alert Center, digest) returns raw content the reference dangles. | `par-type.ts:86-87`; `sanitizeProse` applied only at `assemble.ts:533` | Stop baking the phrase into generator content OR confirm `sanitizeProse` runs at write-time in `upsert-v3`. |
| P3.4 | **`closing_hole_fatigue` asserts "fitness or focus" causation off a 3-round split** | The doc flags aggregate back-9 fade as a myth (`docs/v3-research-golf-domain.md:180`); over-confident causal claim. | `src/lib/coachhelm/v3/composite/rules/closing-hole-fatigue.ts:70-72` | Soften prose to descriptive, raise round threshold, route magnitude through a counterfactual with `<1.0` closability factor instead of a blind delta×6. |
| P3.5 | **`getRoundTakeawayInsight` keys on `related_round_ids` no generator writes** | The round-takeaway primary match is dead — always falls through to the ±24h heuristic. | `src/app/golf/actions/insight-delivery.ts:477-480` | Stamp `related_round_ids` at write-time on round-scoped insights, or delete the dead branch. |

---

## Part 2 — How to make it smarter & more accurate

Organized by dimension. For each: **(a)** today (coarse), **(b)** smarter, **(c)** the exact data we already have (distinguishing *captured/fetched-but-unused* from *needs a capture change*), **(d)** the unlocked metric/insight, **(e)** effort (S/M/L).

---

### By distance

**(a) Today (coarse).**
- Putting: only 3 v3 buckets — `3_5` / `5_10` / `10_15` (`src/lib/coachhelm/v3/generators/putt-distance.ts:33-39`, instantiated 3× at `orchestrator.ts:232-234`). The under-3ft tap-in zone and the lag zone (15-25, 25+) are absent.
- Approach: only 3 yard bands — `50_125` / `125_175` / `175_plus` (`src/lib/coachhelm/v3/engine/shot-source.ts:69-74`). The 50-125 band is 75yd wide.
- ATG: no distance bucketing at all in v3 — `ScramblingGenerator` emits a single sand-save rate.
- Tee: no distance bucketing; driver-vs-non_driver compared in aggregate across all par-4/5 tees.

**(b) Smarter.** Mirror the domain doc's non-uniform granularity:
- Putting: **1-ft resolution 3-10ft** (steepest make curve, `docs/v3-research-golf-domain.md:60-73,153,159`); **5-ft lag bins 15-25 / 25+** where 3-putt is a speed problem not a make problem (`:155-156`).
- Approach: split the wedge zone **50-75 / 75-100 / 100-125** (the #1 college→Tour gap, `:120,170-171`); keep coarser bands long (`125-175`, `175+`).
- ATG: **inside-10 vs 10-30** banded × lie (`:174`).
- Tee: by club-choice cohort and hole-length tier, not raw yardage bins.

**(c) Data we already have.**
- *Already computed, fetched-but-unused:* the v2 calculator already has **9 putt buckets** (`golf-stats-calculator-shots.ts:464-474`), **8 approach bands** (`:477-489`) crossed with 3 lies (`approachEff*` 8×3 grid `:307-314`) and par-3/4/5 proximity (`:289-291`), and **3 ATG buckets** (`getAtgDistanceBucket :492-498`, `scramblingPct0_10/10_20/20_30 :323-325`). v3 generators each read one coarse cache column and ignore the grid.
- *Already captured per shot:* `distance_to_hole_before` + `distance_unit_before` (`golf-stats-calculator-shots.ts:25-26`), `distance_to_hole_after` (`:28-29`), `shot_distance` (`:30`), `putt_distance_feet` (`:33`). Approach miss is **already re-bucketed by distance band** at `calc:203-204`.
- *Needs a capture change:* none for distance — the substrate fully supports finer banding. **Caveat:** the per-shot unit toggle (yards/feet) is mixed in prod (`shot-source.ts:26-27` warns "normalize to feet before use") — normalize before any new band math.

**(d) Unlocks.**
- `putts_made_15_25ft_pct` + `putts_made_25_plus_ft_pct` → the lag/3-putt driver (`buildPuttingLagDriver`) and a real SG:PUTT lag-vs-short split.
- `approach_proximity_50_75 / 75_100 / 100_125` → "your 75-125 wedge proximity is 28ft vs college ~22ft, ~2 strokes/round" (the most coachable approach insight, currently invisible because it's averaged into one number).
- ATG-by-distance×lie insight ("long chips 20-30yd leak", `docs/fairway-coachhelm-insight-rebuild.md:40`).
- Distance-conditioned miss bias ("you go LONG from 175+, SHORT from 50-125") from the already-bucketed data at `calc:203-204`.

**(e) Effort.** Putting lag buckets **M** (cache bucket realignment + 2 generator instances + standing rows). Wedge-zone split **M** (new shot-level proximity aggregator + standing rows; do AFTER the C1 percent-as-feet composites land, per `audit C1`). ATG-by-distance **S-M** (data exists; rename `20_30`→`20_50` first, then surface). Distance-conditioned miss **S** (read-side only).

---

### By par

**(a) Today (coarse).** `ParTypeGenerator` reads `cache.par{3,4,5}_average` and emits a flat scoring-vs-par row per par type (3 instances `orchestrator.ts:241-243`). The only other par-aware logic is genome `par3_proficiency` (flat avg, `genome/dimensions/par3-proficiency.ts`) and the v2 calculator's `approachProximityPar3/4/5` (`calc:289-291`, **read by no v3 generator**). Par is treated as a scoring rollup, never a strategy context.

**(b) Smarter.** Make par strategy length/reachability-aware (`docs/v3-research-golf-domain.md:251-278`):
- **Par-3 by LENGTH:** short <175 (GIR 75%+, pin-hunting OK) / mid 175-210 (60-65%, safe quadrant) / long 210+ (~50%, center-green discipline). Note par-3 tee shots are APPROACH in SG (`:21,23`), so this is really approach-by-length.
- **Par-4 by LENGTH (tee strategy):** short <380 (scoring hole, driver may not be needed) / mid 380-440 (~70% GIR) / long 440+ (bogey-equivalent for high HCP). Driver-vs-3W/hybrid separator by corridor width + whether distance unlocks a shorter approach club (`:214-219`).
- **Par-5 by REACHABILITY:** reachable-in-2 (birdie ~35-40%) vs lay-up-only (~25-30%), and flag the awkward 30-50yd lay-up — lay up to FAVORITE WEDGE YARDAGE not nearest-to-green (`:263-265`).
- **Par-relative scoring distributions** (eagle/birdie/par/bogey/double per par-type) as the separator — e.g. par-5 birdie capitalization.

**(c) Data we already have.**
- *Already captured / joinable:* `golf_holes.par` and yardage are joinable to `golf_shots`; `loadTeeShotsForStrategy` already loads `club_type='non_driver'` + `golf_holes.par` + `fairway_hit` + `shot_distance` (`shot-source.ts:157-242`). Shots are ordered by `shot_number` with per-shot lie/distance, so the par-5 decision chain (tee→2nd→wedge, go-vs-layup) is reconstructable.
- *Already computed, fetched-but-unused:* `approachProximityPar3/4/5` (`calc:289-291`) — exactly the par-3-by-result signal, read by no v3 generator.
- *Needs a capture change:* none. Hole yardage exists; reachability is `par5_yardage − tee_distance ≤ reachable_threshold`. (Wind would refine reachability but is a separate gap — see By context.)

**(d) Unlocks.**
- Par-3-by-length GIR insight (turns "even on par-3s" into "even on short, bleeding on 210+").
- Par-4 driver-vs-layback EV **per hole-length tier** ("layback is higher-EV on 380-440 corridors but driver unlocks a wedge on short par-4s").
- Par-5 reachable-vs-layup + sub-optimal-lay-up flag (the 30-50yd zone).
- Par-relative scoring distribution as the par-type separator, replacing the audit-flagged dual-baseline `ParType` card.

**(e) Effort.** Par-3-by-length **S-M** (wire `approachProximityPar3` + add length tiers from hole yardage). Par-4 tee strategy by length **M** (extend `tee-strategy.ts` to bucket by `golf_holes` yardage tier). Par-5 reachability + decision chain **M-L** (new sequence reconstruction over `shot_number`). Par-relative distribution **S** (count from `hole_scores`).

---

### By lie

**(a) Today (coarse).** Lie is correctly applied in **one** place — shot-level SG via `getExpectedStrokes(lieAfter)` (`calc:568-598`). The v2 calculator computes a full lie grid (`girPctFromFairway/Rough/Sand calc:186-188`, `approachProximityFairway/Rough/Sand :292-294`, `scramblingPctFairway/Rough/Sand :320-322`, `approachEff*` ×3 lies, `atgEffByDistanceLie`) — but **none of it is read by v3 generators**. v3 `ApproachMiss` uses `result`/`lie_after` only to classify on-green vs off-green (`approach-miss.ts:80-84`). v3 `Scrambling` ships **sand-only** (`scrambling.ts:24,32-34`).

**(b) Smarter.** Surface lie as a first-class insight dimension (`docs/v3-research-golf-domain.md:189-208`):
- **Proximity-by-lie + GIR-by-lie:** "rough approaches from 150-175 leak 0.4 SG vs your fairway approaches."
- **Lie-segmented scrambling:** sand vs rough vs clean/fringe (`:49-50,174` — pooling them produces wrong claims; sand is harder than clean inside 10yd).
- **Flyer-lie detector:** the doc's most-emphasized practical lie heuristic — light/medium rough + dry = 10-20yd long, no spin (`:197,208`). Detectable from `lie=rough` + an over-distance proximity-miss pattern.
- **Short-side detection:** miss into a worse lie on the short side of the pin.
- **Recovery/penalty chain:** sequenced lie transitions (rough→sand→green) for the Big-Numbers theme.

**(c) Data we already have.**
- *Already captured per shot:* `lie_before` / `lie_after` (`golf-stats-calculator-shots.ts:23-24`); `result` (`:27`).
- *Already captured, fetched-but-UNUSED (the big one):* `approach_miss_details.lie_type` (fairway/rough/bunker/hazard), `miss_direction` (incl. short_left/long_right etc.), `distance_from_green_yards` — written by the submit RPC (`prod_public_baseline.sql:5631`), folded into `RawShot` (`golf-stats-calculator-shots.ts:43-45`), but **never read by any v3 generator** and unused on the core stats path (`stats-data.ts:988-993`). This single table powers proximity-by-lie, short-side, and flyer detection from data already in the DB.
- *Already computed, fetched-but-unused:* the entire v2 lie grid above.
- *Needs a capture change (the hard ceiling):* the `golf_shots` lie CHECK allows only `tee/fairway/rough/sand/green/other/penalty` (`20260527000000_prod_public_baseline.sql:10741-10742`). The doc's rich taxonomy (light_rough/heavy_rough/first_cut/flyer/buried/divot/hardpan/plugged, `:189-208`) **cannot be stored**. Consequence: `flyer_lie_over_the_green` filters `lie_before='light_rough'` — a value that can never exist → **DEAD rule** (`composite/rules/flyer-lie-over-the-green.ts:28`); the `heavy_rough`/`light_rough` arms of genome `scrambling_rate` (`genome/dimensions/scrambling-rate.ts:31-34`) and short-game loader (`hole-sequence-loader.ts:93`) are dead; and those loaders use `'bunker'` while the constraint stores `'sand'` — a mismatch.

**(d) Unlocks.**
- Lie-aware approach driver (GIR-from-rough vs fairway, short-side rate) under the proximity cause — **from `approach_miss_details` alone, no schema change**.
- Lie-segmented scrambling standings (`scrambling_pct_rough`/`fairway`) → correct around-green attribution.
- A flyer-recognition insight (a low-capture-cost differentiator nobody else ships) — **partial today** from `lie=rough` + over-distance miss; **full fidelity** needs the rough-severity sub-classification.
- Recovery/penalty causal chain for Big-Numbers.

**(e) Effort.** Wire `approach_miss_details` into the shot-driver layer **S-M** (data already fetched; Phase-2 fast-follow per rebuild GAP #6). Scrambling-by-lie standings + 2 generator instances **M**. Flyer detector (proximity-based, no schema) **M**. Rough-severity taxonomy (schema + shot-capture + benchmark rows for `getExpectedStrokes`) **L** — and note any new lie needs a matching benchmark row in `STROKES_GAINED_BENCHMARKS` (`calc:528-564`), not just capture.

---

### By context / pressure / scoring situation

**(a) Today (coarse).** The only pressure signal is `round_type` (practice vs tournament/qualifier), used by `PressureGapGenerator` (`generators/pressure-gap.ts:51-79`, gate ≥3 rounds/bucket) and genome `pressure_delta`. Hole-sequence is handled **three overlapping ways with no reconciliation**: WarmupHole = hole 1 vs 2-18 (`warmup-hole.ts:75-83`), `closing_hole_fatigue` = 13-18 vs 1-12 (`closing-hole-fatigue.ts:32-44`), `front_9_starter` = holes 1-3, `back_nine_delta` = 10-18 vs 1-9 (`back-nine-delta.ts:29-32`), `doubles_after_bogey` = next-hole after any bogey (`doubles-after-bogey.ts:36-45`). Pressure is a single whole-round delta; hole-sequence is positional, never tied to difficulty or in-round score state.

**(b) Smarter (within the doc's guardrails).**
- **Pressure × shot-type:** the documented choke mechanic is specifically 4-8ft putts + tentative wedges (`docs/v3-research-golf-domain.md:303`). Tag putts/wedges by `round_type` to localize the leak instead of one round-level delta. Compare a tournament putt-make to the player's OWN tournament cohort (not a blended baseline).
- **Loss-aversion split:** putts FOR PAR convert worse than equal-length FOR BIRDIE (`:299`).
- **Big-number anatomy:** 70% of doubles start with a penalty or failed recovery (`:162`); big-number avoidance is the #1 70s-vs-80s separator (`:164-165`) — build the penalty→double causal cascade.
- **After-bogey recovery / bounce-back:** next-hole 0.3-0.5 strokes worse after a double (`:306`).
- **Reconcile hole-sequence to ONE front/back + one opening definition;** frame closing-hole as fatigue/decision-load, NOT "you fade" (aggregate back-9 fade is a myth, `:179-180`).
- **Closability factor < 1.0:** practice→tournament gaps are slow-to-close (already corrected to 0.5 at `lookup-tables.ts:96-97`).

> **FORBIDDEN (doc `:352`):** no "mental toughness"/"clutch" labels, no swing-mechanics inferences from outcome data. Frame pressure mechanically (make-% delta, decision quality under load).

**(c) Data we already have.**
- *Already captured:* `round_type` (drives `practice_tournament_delta`/`opening_hole_delta`); `hole_number` (front/back slicing); per-shot `is_penalty`/`penalty_type` (`golf-stats-calculator-shots.ts:35-36`); sequenced `lie_before→lie_after` for the recovery chain; `putt_distance_feet` + `putt_made` for the 4-8ft pressure-putt split.
- *Already computed:* `practice_tournament_delta`, `opening_hole_delta` (`ROUND_REFRESH_METRIC_IDS refresh.ts:49-52`); genome `pressure_delta`/`back_nine_delta`/`par3_proficiency` — but these are **display-only** (`golf_player_genome.vector`, power radar/compare UI), they **do NOT feed insight generators, composites, or counterfactuals**.
- *Needs a capture change:* a **within-round pressure proxy** beyond hole_number (score relative to par at that point, "in contention / final round") would need either richer round metadata or a computed momentum signal. Wind/cold/green-speed (see SG decomposition note) are unmodeled — `weather_sensitivity` genome dim is an explicit stub (`genome/dimensions/weather-sensitivity-stub.ts:2-25`).

**(d) Unlocks.**
- "You 3-putt more in tournaments from 25+ft" (pressure × distance, once lag buckets ship).
- 4-8ft tournament-vs-practice make-% delta (the localized choke signal).
- Penalty→double cascade card for Big-Numbers; bounce-back rate.
- A single reconciled opening/closing-stretch insight instead of two double-counted cards (fixes P2.2).
- Wiring the genome vector into composite detection makes context-aware insights with **no new computation**.

**(e) Effort.** Pressure × shot-type (4-8ft putts, wedges by round_type) **M**. Penalty→double cascade **M** (sequence over `shot_number` + `is_penalty`). Hole-sequence reconciliation **S** (a definition decision + assembler dedup). Wire genome → composites **M**. Within-round score-state proxy **L**.

---

### Strokes-gained decomposition

**(a) Today.** The 4-way SG spine (OTT/APP/ARG/PUTT) + per-category trend (`computeSgTrends`) + a shot-driver layer exist (this is healthy). What's missing is **sub-category decomposition**.

**(b) Smarter (the decompositions the doc recommends, `docs/v3-research-golf-domain.md:20-26,150,319-342`).**
1. **SG:APP by source-distance band (and by lie)** — wedge (50-125) vs mid-iron (125-175) vs long (175+) with per-band proximity. The "wedge is the #1 gap" claim is invisible inside one APP number.
2. **SG:PUTT into LAG (>25ft, speed/3-putt) vs SHORT (3-8ft, make-%/stroke) vs mid** — different skills, different sub-metrics.
3. **SG:ARG by lie (sand/rough/clean) and by yardage (inside-10 vs 10-30).**
4. **SG:OTT into a DISTANCE component vs a PENALTY/ACCURACY component** — expose penalty-stroke rate + resulting-approach-distance as sub-signals.
5. **Outcome themes → causal source:** penalty→double cascade (`:162`) and the GIR↔scrambling coupling — `scrambling % × greens missed` is "the single most useful derived stat for sub-elite players" (`:150`).
6. **Coachability horizon per SG-loss** (`:319-342`): putting/wedge/bunker/course-mgmt = weeks-to-months; iron striking 3-6 months; driving distance years. Rank by expected-strokes-recoverable-**soon**, not just magnitude.

**(c) Data we already have.** All sub-band inputs exist in the v2 calculator (approach 8×3 grid, 9 putt buckets, ATG-by-distance-lie, GIR-by-lie) — the decomposition is a **read-side aggregation**, not new math. `is_penalty`/`penalty_type` give the OTT penalty component. `scrambling % × greens missed` is two existing cache fields multiplied. Coachability horizon is a static per-metric tag (a constant map keyed by `metric_id`), not a capture change.

**(d) Unlocks.** Sub-category SG cards that pinpoint *which* part of APP/PUTT/ARG/OTT is leaking; the GIR-load derived stat; a strokes-recoverable-soon ranking that aligns with DECADE vocabulary coaches already use (`docs/v3-research-competitive-landscape.md:231`).

**(e) Effort.** SG sub-band cards **M** (depends on the by-distance/by-lie standings P1.1-P1.3). GIR×scrambling derived stat **S**. Coachability-horizon tag + re-rank **S**. OTT distance/penalty split **S-M**.

---

### Baselines & accuracy foundation

**(a) Today.** Everyone is benchmarked to **PGA Tour only** (the cohort machinery is built-but-dead — `cohortBaselineValue`/`CohortTier` have zero importers). Sample gating is inconsistent (some metrics gate on `rounds_played`, not on the bucket's own attempts). Trend window labels don't match what's computed (`player_30d_scoring_avg` actually reads the all-rounds cache — `compute.ts:34`/`types.ts`).

**(b) Smarter / accuracy levers.**
- **Per-cohort baselines (THE biggest lever):** wire `level_avg`/`level_n`/`level_pct` (P0.1) and read it in `computeCounterfactual` via `generator-base.ts:187-193` with `pga_value` fallback. This makes EVERY by-distance/by-par/by-lie number accurate for college players: sand-save vs ~40% not 50%, short-putt vs Shot-Scope-0HCP curve (`docs/v3-research-golf-domain.md:133-138`) not Tour 99.4%, par-N vs college par-N. Render three bars: PGA + team + you (`docs/v3-research-competitive-landscape.md:352,362`), with the college baseline driving the counterfactual magnitude.
- **Per-bucket sample gating:** `minSampleN` must be on the bucket's own attempts (e.g. ≥5 attempts in THAT distance/lie band), NOT `rounds_played` — otherwise a PGA-benchmarked claim can fire off 1-2 shots. `scrambling.ts:40,73-79` now gates correctly on attempts; apply the same pattern to every new by-lie/by-distance metric. Drive `confidence_factors.sample_adequacy` off bucket attempts (`scrambling.ts:114` does attempts/20), not rounds.
- **Single stroke currency + single distance taxonomy:** normalize all composite `strokes_impact` to per-round (fixes P2.1) and reconcile the putt cache buckets to the v3 edges (P1.2) — one taxonomy across entry, calculator, shot-source, and standing or by-band numbers silently drop/mis-rank.
- **Trend window honesty:** compute a real rolling window matching the claimed label, and add per-category SG trend windows (`computeSgTrends` exists) so by-distance/by-par/by-lie insights show direction-of-travel (improving wedge proximity vs worsening), not a static snapshot (rebuild GAP #9).
- **Registry-first confidence/polarity:** `calcConfidence` is centralized at `generator-base.ts:171` and `tone-derivation.ts:88-91` resolves `lower_better` from `METRIC_RENDER_CONFIG` — keep this discipline so every NEW metric inherits correct direction + confidence automatically.
- **By-context as a baseline dimension:** compare a tournament number to the player's OWN tournament cohort, not a blended baseline, so "you 3-putt more in tournaments" is accurate not confounded by round-type mix.

**(c) Data we already have.** `golf_player_standing.level_avg` column exists (`prod_public_baseline.sql:10185`); the loader already SELECTs it (`loader.ts:19-21`); the cohort functions exist (`pga-standards.ts`). The only missing piece is the RPC populating `level_avg` + reading it in `generator-base.ts`. All gating/trend/confidence levers are read-side.

**(d) Unlocks.** Honest counterfactuals everywhere (the precondition for trusting every other dimension); honestly-low-confidence thin-band claims that sort below well-sampled ones; the three-bar render differentiator.

**(e) Effort.** Cohort baseline **L** (DB/RPC infra: cohort tier resolution + new `PERCENT_RANK` pass + column-population migration). Per-bucket gating **S** (apply existing pattern). Trend-window honesty **S-M**. Stroke-currency normalization **S**.

---

## Part 3 — The quick wins (this sprint)

Highest value-to-effort, ordered. These are mostly **fetched-but-unused data** — a small wiring change for a big insight gain — plus a few label/ranking correctness fixes that block downstream work.

1. **Wire `approach_miss_details` (lie_type / short-side / distance_from_green) into the shot-driver layer.** *Effort S-M, high value.* The richest by-lie/by-context approach signal the app captures is already written (`prod_public_baseline.sql:5631`) and folded into `RawShot` (`golf-stats-calculator-shots.ts:43-45`) but read by **no v3 generator**. Wiring it into `shot-drivers.ts` yields a lie-aware miss driver ("GIR collapses from rough", "short-siding into worse lie") with **zero new capture and no baseline dependency** (P1.4).

2. **Rename ATG `20_30` → `20_50` across the calculator + field names** (`golf-stats-calculator-shots.ts:497,325,331`). *Effort S.* Label-only, but it is the prerequisite to nesting any ATG-by-distance insight on a correct range (P3.1).

3. **Normalize `doubles-after-bogey` `strokes_impact` to per-round** (`doubles-after-bogey.ts:87`). *Effort S.* Stops the count-based composite from systematically out-ranking per-round composites in `rankScore`/`assemble.ts:270`; makes the ranker trustworthy before we add more composites (P2.1).

4. **Reconcile the opening-stretch double-count** — give `opening_hole_delta` one home (Pressure) or add cross-theme metric dedup in the assembler (`warmup-hole.ts` vs `front-9-starter.ts`; `assemble.ts:252-262`). *Effort S.* Removes an inflated-magnitude / duplicate-card bug (P2.2).

5. **Compute and surface `scrambling % × greens missed`** (the doc's single most useful derived stat for sub-elite players, `docs/v3-research-golf-domain.md:150`). *Effort S.* Two existing cache fields multiplied — a coupling insight with no new aggregation.

6. **Surface the existing distance-conditioned miss bias** ("you go LONG from 175+, SHORT from 50-125") from the already-bucketed data at `calc:203-204`. *Effort S.* Read-side only; turns the aggregate `miss_side_bias` genome dim into a coachable, distance-conditioned signal.

7. **Add a coachability-horizon tag per metric and re-rank by strokes-recoverable-soon** (`docs/v3-research-golf-domain.md:319-342`). *Effort S.* A static `metric_id → horizon` map; aligns ranking with what coaches can actually fix this season.

> Items 1-7 require **no schema change and no baseline dependency** — they ship this sprint. The cohort baseline (P0.1) and the by-band standings (P1.1-P1.3) are bigger infra and belong in the roadmap below.

---

## Part 4 — Sequenced roadmap

Dependencies drive the order. **Cohort baselines unblock honest counterfactuals everywhere**, so they come first even though they are the largest single item — every by-distance/by-par/by-lie number computed before they land will be Tour-inflated and have to be re-validated.

### Phase 0 — Foundation (unblocks everything)
- **P0.1 cohort `level_avg`** in `refresh_player_standing` + read in `generator-base.ts:187-193` (Tour as ceiling marker). **[L]**
- Then immediately: **P0.2 scrambling 40%** and **P0.3 ParType single baseline** flip on (they were only blocked by P0.1).
- In parallel (no dependency): the **Part 3 quick wins #1-7** (fetched-but-unused wiring + ranking/label fixes).
- Also: **per-bucket sample gating** discipline + **stroke-currency normalization** (P2.1) so the ranker is honest before new buckets arrive.
- **Dependency note:** nothing in Phases 1-3 should ship its user-facing stroke number until Phase 0's baseline is live; until then, by-band cards can be computed but should render against the team/college marker, not raw Tour.

### Phase 1 — By distance / by par / by lie (the bulk of "smarter")
- **By distance:** P1.2 lag putt buckets (15_25 + 25_plus) + P1.1 wedge-zone approach split (50-75/75-100/100-125) — both need shot-level standing aggregators. ATG-by-distance (after the `20_50` rename). **[M each]**
- **By par:** par-3-by-length (wire `approachProximityPar3` + yardage tiers), par-4 driver-vs-layback by length tier, par-5 reachable-vs-layup + decision chain, par-relative scoring distributions. **[M-L]**
- **By lie:** P1.3 scrambling-by-lie standings + rough/fairway generator instances; flyer detector (proximity-based, no schema). **[M]**
- **Depends on:** Phase 0 baseline (for honest gaps) + the C1 approach percent-as-feet composites landing (per `audit C1`, do not nest new approach-distance logic until that's in).

### Phase 2 — Context / pressure / scoring situation
- Pressure × shot-type (4-8ft putts + wedges by `round_type`, compared to the player's own tournament cohort).
- Penalty→double-bogey cascade + bounce-back rate (Big-Numbers anatomy).
- Hole-sequence reconciliation to ONE opening/closing definition; closing-hole framed as fatigue (P3.4), magnitude through a `<1.0` closability factor.
- Wire the genome vector (`pressure_delta`/`back_nine_delta`/`par3_proficiency`) into composite detection so context-aware insights need no new computation.
- **Depends on:** Phase 1 lag buckets (for "3-putt more in tournaments from 25+ft") and Phase 0 by-context baselines.

### Phase 3 — SG decomposition (rides on Phases 1-2)
- SG:APP by source-distance band (+ lie), SG:PUTT lag-vs-short, SG:ARG by lie + yardage, SG:OTT distance-vs-penalty split.
- GIR×scrambling derived stat (can pull forward to Phase 0 as a quick win — item #5).
- Coachability-horizon ranking (item #7).
- Per-category SG trend windows (rebuild GAP #9) for direction-of-travel.
- **Depends on:** the by-band/by-lie standings from Phase 1 (the sub-categories are aggregations over those buckets).

### Cross-cutting / later (needs new capture, not just wiring)
- **Rough-severity lie taxonomy** (first_cut/rough/heavy_rough + recovery) — CHECK-constraint + shot-capture + matching `STROKES_GAINED_BENCHMARKS` rows. Unblocks the dead `flyer_lie_over_the_green` rule and full-fidelity flyer detection. **[L]**
- **Pin position** (front/middle/back zone) — enables true short-side detection beyond the ~50yd approximation (`calc:505-517`). **[M]**
- **Wind/temp at round header** — unblocks `weather_sensitivity` (currently a stub) and refines par-5 reachability + expected-strokes-by-distance. **[low-M]**
- **Dedicated `shot_note` column** (today `golf_shots.notes` is a JSON backup blob, `golf.ts:4923`) for the LLM narrative layer. **[S]**
- **Lifecycle test coverage** (P2.3) for `generator-base.run()`. **[S]**

---

### Appendix — the "captured but underused" inventory (the engine team's fastest wins)

| Signal | Status | Where | What it unlocks |
|--------|--------|-------|-----------------|
| `approach_miss_details.lie_type` + `miss_direction` + `distance_from_green_yards` | written + fetched, **read by no v3 generator** | submit RPC `prod_public_baseline.sql:5631`; folded `golf-stats-calculator-shots.ts:43-45`; unused `stats-data.ts:988-993` | proximity-by-lie, short-side, flyer (no schema change) |
| v2 calculator lie grid (`girPctFrom*`, `approachProximity*`, `scramblingPct*`, `approachEff*`×3, `atgEffByDistanceLie`) | computed, **read by no v3 generator** | `calc:186-188,292-294,320-322,307-314,337+` | every by-lie insight |
| 9 putt / 8 approach / 3 ATG buckets | computed, v3 reads 1 coarse column | `calc:464-498,477-489,492-498` | every by-distance insight |
| `approachProximityPar3/4/5` | computed, **read by no v3 generator** | `calc:289-291` | par-3-by-length, par-relative proximity |
| `putt_slope` (uphill/downhill/level/severe) | written, **read only as a passthrough label** | written `golf.ts:1225,3739`; label-only `calc:863` | slope-conditioned make% ("downhill 5-10ft well below level") |
| genome `pressure_delta`/`back_nine_delta`/`par3_proficiency` | computed, **display-only** (radar/compare) | `genome/registry.ts:23-33`; written to `golf_player_genome.vector` | context-aware composites with no new computation |
| `putt_details.estimated_break_inches` | **read but never written** (dead column) | read `calc:41`; no write path in `golf.ts` | either wire UI to capture break, or drop the column |
| `golf_player_standing.level_avg` | column + loader exist, **never populated/read** | `prod_public_baseline.sql:10185`; `loader.ts:19-21` | the cohort baseline (P0.1) |

---

*End of plan. Build Phase 0 first — the cohort baseline is the keystone that makes every smarter-by-X number honest.*
