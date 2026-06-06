<!--
Methodology: multi-agent audit (Workflow run wf_10761f9b-f20, 2026-06-05).
221 sub-agents · ~15.7M tokens · ~66 min.
Pipeline: 2 map agents (live-path trace + insight catalog) -> 8 dimension auditors
(numerical/unit · generation/write · composite cascade · read-path/delivery ·
golf-domain/causal · NLG prose · data plumbing · tests/dead-code) -> 3 adversarial
verifier lenses per finding (code-reproduction · golf-domain reality · skeptic;
finding kept only if >=2 lenses confirmed) -> synthesis.
Result: 70 findings -> 59 confirmed (5 critical, 16 high, 23 medium, 15 low),
6 contested, 5 refuted as false positives.
Structured findings: docs/audits/coachhelm-insight-engine-audit-2026-06-05.findings.json
-->

# CoachHelm Insight Engine — Final Audit Report

**Date:** 2026-06-05
**Scope:** v3 insight generation, counterfactual/standing math, composite cascade, read/delivery, NLG prose, data plumbing, tests
**Repo root:** `/Users/ricknini/Downloads/helmv3`

---

## 1. Executive Summary

The CoachHelm v3 engine is **architecturally healthy but has a cluster of ship-affecting defects concentrated at two seams**: (a) unit handling at the approach-miss→composite boundary, and (b) the divergence between `evidence.strokes_impact` (always 0) and `evidence.counterfactual.strokes_saved_per_round` (the real value) across every ranking path. The core counterfactual math (`compute.ts`), the v2 SG/proximity aggregation, the write path (genuine upsert, no destructive deletes), RLS/auth scoping, and the v3 themes assembler are all sound and, in the themes case, well-tested.

The **single most important risk** is the **strokes_impact-vs-counterfactual ranking break**: all 9 Tier-1 generators hard-code `strokes_impact: 0` and `confidence: 0`, yet every flat-feed read path (coach feed, player Hub top card, round takeaway, morning-digest cron) ranks by `|strokes_impact| × confidence = 0`. The genuinely highest-leverage skill gaps therefore never sort first; ordering silently collapses to recency, and a few mixed-unit composites dominate the feed. This corrupts *which* insight a coach/player acts on across the most prominent surfaces.

The second systemic risk is **unit corruption at the approach composites**: after the documented "reach vs dial-in" redesign, `approach_miss.your_value` is now a green-hit **percent**, but two live composites (`long_approach_3putt_cascade`, `short_approach_proximity_gap`) still read it as **feet** — they fire on the wrong condition and print a percentage labeled "ft from the hole," a fabricated number a coach would act on. Two passing tests actively **lock in** this bug.

A third systemic issue: every standing bar and counterfactual benchmarks college players against **PGA Tour only** — the cohort/division baseline machinery exists but is dead code — overstating every weakness magnitude for elite amateurs.

**Verdict: healthy-with-fixes, but with ship-blocking correctness defects.** There are no data-loss or security defects, and the math engine is trustworthy. However, the approach percent-as-feet composites (fabricated numbers), the ctx-composite suppression bug (entire themes vanish), and the empty-`source_insight_ids` subset suppression should be treated as **P0 ship-blockers** because they produce wrong claims or silently delete correct insights on the live path. Five findings were dropped as false positives during adversarial verification.

---

## 2. Critical & High Findings

### CRITICAL

#### C1. Approach composites print green-hit % as "feet from the hole" (fabricated number + inverted firing)
- **Severity:** claimed critical / lenses split high↔critical → **final: CRITICAL** (it produces a wrong, action-driving number a coach reads, with no guard once fired).
- **Files:**
  - `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/composite/rules/long-approach-3putt-cascade.ts:16-23, 52-69`
  - `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/composite/rules/short-approach-proximity-gap.ts:14-21, 49-69`
  - source field: `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/generators/approach-miss.ts:192-194` (`unit: 'percent'`, `your_value: agg.green_hit_pct`)
- **What's wrong:** `isWeakLongApproach` does `Number(i.evidence.your_value ?? 0) > 50` with the stale comment "the lower-better unit is feet; >50 ft is weak"; `isWeakShortApproach` does `yourVal > 22`. But `your_value` is now a 0–100 green-hit **percent**. So `>50` matches a *good* green-hit rate (50%+ greens = strong reach), and `>22` is true for nearly every player. The real proximity (`proximity_when_hit_feet`, `approach-miss.ts:150`) is never written into `evidence`.
- **What the user sees wrongly:** "Your 175+ yd approaches average 62 ft from the hole" / "you're leaving the ball 78 ft from the hole (Tour is ~18 ft)" — where 62/78 are green-hit **percentages**. The card fires on good ball-strikers, claims a catastrophic, physically impossible proximity, and prescribes wedge distance-control drills for a non-existent problem.
- **Fix:** Surface `proximity_when_hit_feet` into `evidence` (e.g. `evidence.proximity_feet`) with the `MIN_GREENS` guard and gate composites on that with a HIGH-proximity / LOW-green-hit% threshold; OR retire both composites until a real proximity-in-feet standing ships. At minimum, stop labeling a percent as "ft."

#### C2. Two passing tests lock in the C1 unit bug
- **Severity:** claimed critical / lenses split critical↔high → **final: CRITICAL** (the tests guarantee CI stays green over a fabricated user-facing number; they encode the wrong contract).
- **Files:**
  - `/Users/ricknini/Downloads/helmv3/src/test/coachhelm/v3/composite.test.ts:154-165` (`your_value: 60` → asserts content `'60 ft'`)
  - `/Users/ricknini/Downloads/helmv3/src/test/coachhelm/v3/composite-w305.test.ts:147-167` (`your_value: 28` → asserts `'28 ft'`; non-fire case `your_value: 19`)
- **What's wrong:** The fixtures feed a green-hit percent (`makeInsight` defaults `unit: 'percent'`) and assert the prose renders it as feet, pinning both the misfire threshold and the percent-as-feet mislabel as "expected."
- **Fix:** Rewrite the tests to feed a percent and assert green-hit semantics, OR feed a real feet field after the rule is fixed to read it. Add an end-to-end test that pipes actual `ApproachMissGenerator.composeContent()` output into the rule so the field contract is validated.

---

### HIGH

#### H1. Empty `source_insight_ids` is a subset of every composite → all 5 ctx-driven composites suppressed whenever any insight-driven composite fires
- **Severity:** claimed high / all lenses high → **final: HIGH** (silent omission of correct insights; an entire Scoring theme can vanish — borderline critical, held at high because nothing wrong is *displayed*, it's deleted).
- **File:** `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/composite/synthesis.ts:93-107`
- **What's wrong:** The subset check `candidate.source_insight_ids.length < other.length && candidate.source_insight_ids.every(id => other.includes(id))` is **vacuously true** for an empty array. All 5 ctx-driven rules return `source_insight_ids: []` (`closing-hole-fatigue.ts:49`, `front-9-starter.ts:50`, `doubles-after-bogey.ts:51`, `short-side-scrambling-chain.ts:40`, `flyer-lie-over-the-green.ts:39`), so any insight-driven composite (with ≥1 id) suppresses all of them — even `priority:'urgent'` doubles-after-bogey.
- **What the user sees wrongly:** On any player where a putting/approach insight-driven composite fires, the closing-hole-fatigue / slow-start / doubles-after-bogey / short-side / flyer-lie insights silently disappear, and the Scoring outcome theme (gated to empty at `assemble.ts:358` when it has zero causes) vanishes.
- **Fix:** Guard the subset check: `candidate.source_insight_ids.length > 0 && ...` (ctx-driven composites read raw data, can never be "covered," and must be exempt).

#### H2. Flat insight feed / top-signal ranks by zero `strokes_impact` — highest-leverage insight never surfaced first
- **Severity:** claimed critical (in two findings) / lenses consistently high → **final: HIGH** (no individual number is wrong; the *ordering and selection* a user acts on is wrong). Three near-duplicate findings collapse here: `flat-feed-rank-tier1-zero-impact`, `rank-reads-zeroed-strokes-impact`, `coach-feed-ranks-by-zero-strokes-impact`, `top-insight-player-ranks-by-zero`, `flat-feed-ranks-on-zero-strokes-impact`.
- **Files:**
  - `/Users/ricknini/Downloads/helmv3/src/app/golf/actions/insight-delivery.ts:451-457` (coach feed), `:965-969` (`rankScore`), `:218-246` (top insight), `:515,570` (round takeaway)
  - `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/ranking/score.ts:32-33, 80`
  - zeros: every generator, e.g. `putt-distance.ts:138/140`, `approach-miss.ts:203/205`, `scrambling.ts:109/111`, `course-mgmt.ts:119/121`, `par-type.ts:108/110`, `pressure-gap.ts:131/133`, `warmup-hole.ts:134/136`, `putt-bias.ts:150/152`, `tee-strategy.ts:213/215`
  - injection that never backfills: `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/engine/generator-base.ts:129-142`
- **What's wrong:** `rankScore = |strokes_impact| × confidence`. All 9 Tier-1 generators hard-code both to 0; the real value lands in `evidence.counterfactual.strokes_saved_per_round`, which `rankScore` never reads. So every counterfactual-backed insight scores 0; the stable sort collapses to `created_at` order; the only rows that float are the 4 composites that set non-zero `strokes_impact` (often on mixed units — see M-group). `goalBoost` is also nullified (×0).
- **What the user sees wrongly:** The Hub "signal card," the coach feed's top insight, and the round-takeaway pick the *newest* non-urgent insight, not the highest-stroke leak. A 0.8-stroke putting gap can rank below a trivial diagnostic. The morning-digest email even renders `strokes_impact` directly → shows "~0.0 strokes."
- **Fix:** Make `rankScore`/`scoreInsight`/coach-feed comparator counterfactual-first: `base = cf && cf.suppressed !== true && Number.isFinite(cf.strokes_saved_per_round) ? cf.strokes_saved_per_round : Math.abs(strokes_impact); return base * confidence` (and floor confidence as the coach feed already does with `Math.max(0.1, …)`). Alternatively, backfill `evidence.strokes_impact = counterfactual.strokes_saved_per_round` in `generator-base.ts ~141` and derive confidence from `confidence_factors`. Composites that legitimately set `strokes_impact` (`front-9-starter.ts:87`, `closing-hole-fatigue.ts:87`, `pressure-decel-chain.ts:75`, `doubles-after-bogey.ts:87`) must keep working under whichever field the ranker reads. **Note:** the themes path (`assemble.ts:280`) already ranks correctly by counterfactual — only the flat surfaces are broken.

#### H3. Assembler drops ctx-composites' computed `strokes_impact` → real leaks render as un-actionable "Tendency" chips
- **Severity:** claimed high / lenses high,high,medium → **final: HIGH** (materially degraded: a whole live theme can read 0 addressable strokes; downgraded-to-medium argument acknowledged but the urgent doubles-after-bogey losing its plan CTA tips it to high).
- **File:** `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/themes/assemble.ts:407-414, 442-448, 500-515`; consumer `/Users/ricknini/Downloads/helmv3/src/components/.../CauseRow.tsx:128, 180-205, 265-270`
- **What's wrong:** `tourGapOf` reads only `ev.counterfactual.strokes_saved_per_round`; `strokes_impact` is used only as a ranking tiebreak (`assemble.ts:270`). Ctx composites have `composite_rule_id` set (isComposite) but `source_insight_ids:[]` → `compositeOwnedLeafCount=0` → `strokesSavedPerRound=0` and `counterfactualSuppressed=true`, even though the rules computed real values (`delta*6`, `delta*3`, `compounded*0.5`).
- **What the user sees wrongly:** "Closing 6 holes are leaking strokes" / "Bogeys turning into doubles too often" render as numberless "Tendency" chips with the "no reliable stroke estimate" caption and no "Make it a plan" CTA — only "Talk to your coach." The Scoring theme reads `themeStrokesPerRound=0`.
- **Fix:** In `buildCause`, when a composite has no usable counterfactual and no demoted same-category leaves, fall back to its own `evidence.strokes_impact` for `strokesSavedPerRound`; OR have synthesis inject a real `evidence.counterfactual` on composites that compute a `strokes_impact`. (Caveat: for `closing_hole_fatigue`/`front_9_starter` the raw `delta×6`/`delta×3` may overstate — route through a counterfactual rather than a blind copy.)

#### H4. All counterfactuals benchmark college players to PGA Tour; cohort/division baseline is dead code
- **Severity:** claimed high / lenses high,high,medium(uncertain) → **final: HIGH** (systematically overstates every weakness and the strokes-saved targets coaches build plans around; medium dissent rests on the themes-path team-anchoring mitigation, which does not cover the my-standing CounterfactualLine surface or cold-start).
- **Files:**
  - `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/engine/generator-base.ts:118-126` (`pga_value: standing.pga_value`)
  - `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/counterfactual/compute.ts:53-55`
  - live RPC: `supabase/migrations/20260527000000_prod_public_baseline.sql:4697` (`COALESCE(pga.pga_tour_value, pga.pga_p50)`)
  - dead code: `cohortBaselineValue`/`CohortTier` at `pga-standards.ts:120-133` (zero importers); `standing.level_avg` fetched at `loader.ts:19-21` but never populated by the RPC
- **What's wrong:** Every standing bar and stroke counterfactual gaps against the PGA Tour value only. The division-cohort machinery exists but is never wired, contradicting the rebuild's explicit "college-primary / Tour-ceiling" decision (GAP #8) and the domain doc's "college baselines not Tour baselines" (`v3-research-golf-domain.md:348-349`).
- **What the user sees wrongly:** A +2-handicap D1 player is told sand-save, short-putt make %, par-N scoring, and GIR all trail by a Tour-sized gap, with "saves ~X strokes/round" projected against an unreachable Tour target — inflating every weakness.
- **Fix:** Populate `level_avg` in the standing-refresh RPC (compute division baselines), then pass `standing.level_avg` (or `cohortBaselineValue(standard, tier)`) into `computeCounterfactual`, falling back to `pga_value` only when null. Render StandingBar with both college baseline and Tour ceiling markers.

#### H5. Sand-save insight hard-codes Tour 50% for college players (doc says ~40%)
- **Severity:** claimed high / lenses high,high,medium → **final: HIGH** (a concrete ~0.3 strokes/round projection at the 40% college-normal point, surfaced on the live my-standing CounterfactualLine; medium dissent is the themes team-anchoring, which does not cover that surface).
- **File:** `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v3/generators/scrambling.ts:84-104` (`comparison_value: 50`, `requiresStanding=true` → gaps vs Tour 50%); factor `lookup-tables.ts:73` (0.03)
- **What's wrong:** A college player scrambling at the cohort-normal ~40% is gapped against Tour 50%, producing a 10pp gap × 0.03 = exactly 0.30 strokes/round (above the 0.3 suppress floor, so it renders). Domain doc `v3-research-golf-domain.md:174`: "Tour sand save ~50%; college ~40%."
- **What the user sees wrongly:** A player scrambling at the expected college rate is flagged below benchmark with a recoverable-strokes projection for a non-existent leak, misprioritizing bunker work.
- **Fix:** Use the `scrambling_pct_sand` div1/d2/d3 baseline for `comparison_value` and the counterfactual; keep 50% Tour only as the ceiling marker.

#### H6. Priority/severity persists only on INSERT — dedup UPDATE path never re-writes it
- **Severity:** claimed high / all lenses high → **final: HIGH**.
- **File:** `/Users/ricknini/Downloads/helmv3/src/lib/coachhelm/v2/insights/upsert.ts:186-196, 233-243` (both UPDATE payloads omit `priority`); INSERT writes it at `:315`. Type comment documents it: `types.ts:155-157`.
- **What's wrong:** Re-runs within the 30-day dedup window hit `updateExisting`, which refreshes evidence/content/title but never re-writes `priority`. Value-derived single-metric generators (e.g. `course-mgmt.ts:104`) recompute priority every run, but it's dropped. Read path filters/orders on the stale DB column (`insight-delivery.ts:205, 428, 815`).
- **What the user sees wrongly:** An insight that escalated to "high" keeps shouting "high" after the player fixed it; a worsening insight first seen as "low" stays buried and is excluded from the Alert Center's `['urgent','high']` filter. (Composites use static rule priorities, so the urgent-forever case is not reachable — only value-derived single-metric generators go stale.)
- **Fix:** In both `updateExisting` payloads add `if (input.priority) payload.priority = input.priority`.

#### H7. Flat delivery skips `sanitizeProse` — authoring artifacts leak to coach/player
- **Severity:** claimed high / lenses high,medium,medium → **final: HIGH→MEDIUM**. **Final call: MEDIUM.** It is genuinely live and reaches the screen + daily email, but it corrupts no number and is React/HTML-escaped (no XSS/PII leak). Two of three lenses call it medium; the rubric ("misleading" vs "wrong number") supports medium.
- **File:** `/Users/ricknini/Downloads/helmv3/src/app/golf/actions/insight-delivery.ts:917` (`content: row.content ?? ''` in `mapRowToEvidenceInsight`); sanitize only at `assemble.ts:488, 508`.
- **What's wrong:** Generators bake `(Research doc §N)` / `Per Research doc …` / `The standing card below shows …` into content; `sanitizeProse` strips these but runs only on the themes path. The flat path returns raw content to the coach insights page, Alert Center, Hub, round review, Fairway components, and the morning-digest email — where the "standing card below" reference dangles at nothing.
- **Fix:** Call `sanitizeProse` in the flat mappers (read-time), or sanitize at write-time in `upsert-v3`.

#### H8. Tone painter calls lower-is-better metrics "encouraging"
- **Severity:** claimed medium / lenses medium,medium,high → **final: HIGH→MEDIUM**. **Final call: MEDIUM** (it inverts framing/tone on a real weakness, but no numeric value is wrong; the StandingBar below shows the correct direction; one lens argues high because ParType emits this by default).
- **File:** `/Users/ricknini/Downloads/helmv3/src/components/golf/coachhelm/insight-card/tone-derivation.ts:57, 75` (`NEGATIVE_METRIC_PATTERN = /severity|score_to_par|miss|stddev|dispersion|penalty/i`)
- **What's wrong:** The regex misses many live lower-better metric IDs — `scoring_par_3/4/5` (the regex has `score_to_par`, not `scoring_par_*`), `big_number_rate`, `practice_tournament_delta`, `opening_hole_delta`, and the approach proximity metrics. For these, `your_value > comparison_value` (worse) is classified as positive polarity → tone `encouraging`.
- **What the user sees wrongly:** A player worse than par on par-4s, or who blows up more holes, gets a green trophy icon and, in round review, the "Today's bright spot" label — a celebrated strength painted over a weakness.
- **Fix:** Source polarity from `METRIC_RENDER_CONFIG.direction` (lower_better ⇒ negative polarity) instead of the regex, so it stays in sync with the 28-metric registry.

#### H9. 30–49yd shots fall in an entry-vs-calculator dead zone
- **Severity:** claimed high / lenses medium,medium,medium → **final: MEDIUM** (three lenses converge on medium: it degrades by-distance breakdowns and silently drops these from v3 approach buckets, but overall proximity averages and scrambling % still count them; no headline number is fabricated).
- **Files:** entry `/Users/ricknini/Downloads/helmv3/src/hooks/golf/use-shot-state-machine.ts:865-867` (`<= 30` ⇒ around_green, else approach); calculator `/Users/ricknini/Downloads/helmv3/src/lib/utils/golf-stats-calculator-shots.ts:1782, 480, 1855` (AROUND_GREEN_THRESHOLD = 50); v3 `shot-source.ts:69-74` (bucket null for <50yd)
- **What's wrong:** A 31–49yd shot is stored `shot_type='approach'` (>30) but excluded from approach by-distance buckets (<50) and from ATG efficiency (filters `shot_type==='around_green'`). On the v3 path it is dropped from every approach bucket entirely.
- **Fix:** Reconcile to one band edge (raise entry around_green cutoff to 50yd, or bucket by stored `shot_type` only). Apply consistently at entry, calculator, and `shot-source.bucketApproachDistance` (spec GAP #7).

---

## 3. Medium Findings (grouped by dimension)

### Numerical / unit correctness
- **Mixed-unit composite `strokes_impact`** — `doubles-after-bogey.ts:87` uses a 90-day **count** (`compounded × 0.5`); `closing-hole-fatigue.ts:87` (`delta×6`), `front-9-starter.ts:87` (`delta×3`), `pressure-decel-chain.ts:75` are **per-round**. They're compared directly in `rankScore` (`insight-delivery.ts:966`), so the count-based one systematically out-ranks per-round composites. Normalize all to strokes-per-round before storing.
- **v3 approach `onGreenFinishFeet` ×3 on null unit** — `approach-miss.ts:89-93` multiplies a null/unknown `distance_unit_after` by 3 (inverse of the v2 `normalizeToFeet` default). A null-unit on-green 20ft proximity displays as 60ft. Diagnostic-only (no counterfactual), display number only. Fix: treat non-`'yards'` (incl. null) as already feet.
- **Pressure counterfactual factor 1.0** — `lookup-tables.ts:92` projects the full above-Tour pressure gap as recoverable; `pressure-decel-chain.ts:75` drops the 0.5 PGA subtraction entirely. Doc calls the college 2–5 stroke gap "typical" / slow-to-close. Apply a <1.0 closability factor; subtract the PGA reference in the composite.
- **ParType dual baseline** — `par-type.ts:79-103` displays "+X vs par" while the injected counterfactual gaps vs PGA (`generator-base.ts:119-126`) with a 10×/4× factor (`lookup-tables.ts:84-86`). At even par the magnitude sits at the 0.3 suppress floor; medium per the live my-standing surface, low per themes (team-anchored). Use a single explicit baseline in both display and counterfactual.
- **`baseline_loader` 30d label mismatch** — `baseline-loader.ts:22-29` reads the all-rounds cache average but it's labeled `player_30d_scoring_avg` (`compute.ts:34`, `types.ts:13`). Internal naming/doc drift only (UI never claims "30-day"). Rename or compute a real window.

### Generation / write integrity
- **`generateTeamInsights` bypasses the P0-11 rate limit** — `insights.ts:738-839` loops `analyzePlayer` over the whole roster (batches of 3) with no `gateCoachHelmEngineCall`, unlike the four sibling entrypoints (`insights.ts:1450, 1502, 2276, 3521`). Authenticated-coach, self-scoped DoS vector. Add the gate after resolving the user.
- **Scrambling gates on rounds, not sand attempts** — `scrambling.ts:40, 64-78, 105`: `minSampleN` is on `rounds_played`, and `sample_n: Math.max(agg.attempts, rounds_played)` inflates the persisted sample past the `MIN_SAMPLE_N=5` floor. A player with 1–2 bunker shots gets a PGA-benchmarked "sand save 0%" with overstated `sample_n`. Gate on attempts; set `sample_n` to attempts.
- **Descriptive generators pinned `priority:'low'`** — `putt-distance.ts:122`, `par-type.ts:92`, `scrambling.ts:93` set `priority:'low'` ("severity is read off the StandingBar") despite carrying real PGA counterfactuals. Excludes them from the Alert Center `['urgent','high']` filter and the prescribed-practice-plan top-3. Compute priority from standing gap / counterfactual magnitude.

### Composite / cascade
- **WarmupHole vs front_9_starter double-theme** — `warmup-hole.ts:31,34` (pressure, `opening_hole_delta`, hole 1) and `front-9-starter.ts:22,75` (scoring, `opening_hole_delta`, holes 1–3) surface the same opening-stretch leak in two themes with no cross-metric dedup. Pick one home, or dedup cross-theme rows by metric_id.
- **Legacy tee_strategy rows under wrong theme** — `tee-strategy.ts:99-105`: generator now files `category='tee'`, but stored rows keep `course_management` until prod regen; assembler buckets strictly by `row.category` (`assemble.ts:252-262`). Backfill `category='tee'`, or re-route by `evidence.metric` (sg_ott→tee). (Self-heals on next regen within the 30-day window — exposure is the >30-day-stale tail.)

### Read-path delivery
- **`getRoundTakeawayInsight` dead primary match** — `insight-delivery.ts:502` filters `metadata.related_round_ids` which no generator ever writes; always falls through to the `updated_at ±24h` heuristic. Stamp the key, or delete the branch + fix the doc.

### Domain / causal validity
- **closing_hole_fatigue myth causation** — `closing-hole-fatigue.ts:70-72` asserts "fitness or focus" off a 3-round split the doc flags as a myth on aggregate (`v3-research-golf-domain.md:180`). Soften to descriptive, raise round threshold. (Note: the doc does grant fatigue is real *situationally*, so the claim is over-confident rather than flatly false.)
- **bunker_miss_side_amplifier conflates break-read bias with leave-side** — `bunker-miss-side-amplifier.ts:52-58` claims "short-siding yourself twice" by equating a green-reading putt bias (`putt-bias.ts:85-99`) with the bunker leave-side; neither input carries a physical side. Reframe as co-occurring leaks. (Severity low per all three lenses — kept here for grouping; see below.)
- **Approach Tour anchors too lenient** — `approach-miss.ts:60-64`: `125_175ft → 30`, `175_plus_ft → 45` flatter the player vs the doc's per-distance table; display-only (no counterfactual). Narrow bands or set band-average anchors. (Lenses lean low.)

### Data plumbing
- **Cohort baseline orphaned** — duplicate of H4 from the plumbing angle (`generator-base.ts:118-126`; `level_avg` fetched, never used).
- **opening_hole_delta split across two themes** — duplicate angle of the WarmupHole/front_9 overlap.
- **PuttDistance ships 3 of 5 buckets** — `orchestrator.ts:232-234` only instantiates `3_5/5_10/10_15ft`; the 15+ft lag metric is never produced, so `lag_distance_3putt` (the doc's #1 putting cause) is dead on pure-v3 data and `buildPuttingLagDriver` has no cause to anchor to. Resolve the cache bucket misalignment and ship `15_25/25_plus` buckets + standing.
- **PuttBias drills inverted** — `putt-bias.ts:45-47` emits only left/right; the drill seed tags only high/low (`20260526060000_v3_seed_drill_metric_tags.sql`). A bias insight's Practice-Rx join returns zero drills. **Contested** (1 lens refuted: the broken CTA path `generatePracticeRx` has no live callers; the goal-suggestion writer self-guards on drill coverage). Tag left/right drills regardless; low real-world reach today.

---

## 4. Low / Dead-code / Doc-drift

- **Cross-theme `totalStrokesPerRound` double-count** — `assemble.ts:375-378` sums per-theme magnitudes across overlapping SG + outcome themes; **not currently rendered** (no consumer reads it). Latent. Compute from SG buckets only, or remove the field.
- **`EvidenceInsight.player_feedback` never populated** — `insight-delivery.ts:86` declared + documented as present on player fetchers, but `INSIGHT_SELECT` never joins it and no mapper sets it. **No consumer reads it today** — inert contract drift.
- **Coach pre-rank fetch cap** — `insight-delivery.ts:408-417` over-fetches only `min(50, limit×4)` ordered by `created_at`, then ranks by zero (see H2). Impact is borrowed from H2; once ranking is fixed, raise/justify the cap or order by priority+created_at.
- **`bunker_miss_side` semantic cross-wire** — low per all lenses (narrative-only, `strokes_impact:0`, rare co-fire). See M-group.
- **Cross-category leaf double-display** — `assemble.ts:231-243, 465-492`: a cross-category claimed leaf renders both as a top-level cause and as a driver under the composite. **Intentional, test-asserted** (`assemble.test.ts:312-350`); stroke value correctly conserved. Design-preference note, not a bug. (1 lens refuted.)
- **`shot-source` ignores `distance_unit_before`** — `shot-source.ts:100-114, 69-74`: a feet-entered approach is misbucketed. Edge-case only (normal flow always yields yards for approaches); low confidence.
- **ATG bucket label `20_30` captures up to 50yd** — `golf-stats-calculator-shots.ts:492-498`: label mislead on around-green stats; underlying count correct. Rename to `20_50`.
- **`proximity_when_hit_feet` not in evidence** — `approach-miss.ts:190-211`: the dial-in signal exists only in prose, not structured evidence — the root enabler of C1. (Filed low; the *consequence* is C1/critical.)
- **Test-quality gaps:** `generator-base` counterfactual+standing injection has **zero tests** (`generator-base.ts:98-155`) — final medium; `lag_distance_3putt` test feeds impossible v3 buckets (`composite-w305.test.ts:112-140`) — final medium; subset-suppression test reimplements `synthesis.ts` instead of importing it (`composite.test.ts:188-226`); chain unit-normalization untested (`hole-sequence-loader.ts:82-105`); realistic≤Tour invariant only example-tested (`assemble.test.ts:282-310`); counterfactual non-negativity only example-tested; lookup factors + standing loader untested; `upsert-v3` priority persistence untested; v2 shot-level SG property test name overpromises (`shot-level-sg.property.test.ts:39-67`); v2 `orchestrator.ts` (2342 lines) is imported only by its own threshold test — false confidence over engine the live path never calls.
- **`sanitizeProse` has no forbidden-token guard** — `assemble.ts:146`: no clutch/mental-toughness strip. **Contested/low** — no generator currently emits a forbidden label; defense-in-depth only.

---

## 5. Contested Findings — Adjudication

1. **`long-approach-composite-displays-zero-strokes`** (1 confirmed, 2 uncertain) — **Adjudication: real but misattributed; downgrade to LOW/MEDIUM.** The mechanism is correct for `long_approach_3putt_cascade` only (its same-category leaf is the counterfactual-less `approach_miss`). The finding wrongly names `short_approach_proximity_gap` (its category is `short_game`; its same-category leaf is the *scrambling* insight, which has a real counterfactual). Also, the render path shows an *honest* suppressed "Tendency" caption, not a fabricated "0.0" — so no wrong number reaches the user. Folds into H3's fix family; not a separate critical.

2. **`player-minConfidence-window-filtered-after-limit`** (1 confirmed, 2 uncertain) — **Adjudication: real code defect, LOW live impact.** `insight-delivery.ts:295-372` applies `minConfidence`/`window_days` after the SQL limit. But **every** live caller passes only `limit` (verified: `stats-intelligence.ts:272/350`, `coachhelm/page.tsx:157`, `review/page.tsx:352`), so the filters are no-ops today. A latent footgun for the next caller. **Final: LOW.** Over-fetch then slice (mirror `PRE_RANK_FETCH`) when wiring filters.

3. **`band-edge-mismatch-calc-vs-registry`** (1 confirmed, 2 uncertain) — **Adjudication: symptom real, root cause misattributed.** The missing 15-25/25+ putt and approach-proximity standings are real and live, but the gating cause is the `golf_player_stats_cache` schema + `refresh_player_standing` RPC v-bindings (`refresh.ts:62-78`), **not** the cited `golf-stats-calculator-shots.ts:464-489` (which the v3 path doesn't consume). **Final: MEDIUM**, fix at the cache/RPC layer. Overlaps the PuttDistance-3-of-5-buckets finding.

4. **`no-forbidden-guard`** (1 confirmed, 1 refuted) — **Adjudication: LOW, keep as hardening note.** No generator emits "clutch"/"mental toughness" today; the cited `pressure-decel-chain.ts:57` "decel under pressure" language is domain-*approved* (data-backed mechanical description), not forbidden. Add a forbidden-token strip as cheap future-proofing; not a current defect.

5. **`calculator-fetches-detail-fields-never-reads`** (1 confirmed, 2 uncertain) — **Adjudication: dead-field hygiene, LOW.** The 6 detail fields (`golf-stats-calculator-shots.ts:38-45`) are genuinely unused by the calculator. But the impact claim ("themes ignore the harder-lie penalty") is **wrong**: SG already captures lie via `getExpectedStrokes(lieAfter)`, and lie-aware GIR/scramble/proximity already exist from base fields. The detail signal reaches users via `shot-drivers.ts` (the spec's intended driver layer). **Final: LOW** — remove dead fields or document them.

6. **`gir-pipeline-no-producer`** (1 confirmed, 2 uncertain) — **Adjudication: LOW, partly intended.** No generator emits a `gir_pct` insight, but the `gir_pct` standing row **is** consumed and shown (my-standing page, fingerprint) — the "wasted refresh" claim is false, and the domain doc deliberately deprecates GIR-as-diagnostic in favor of SG:Approach/proximity. Only the `gir_pct` counterfactual factor + drill tag are truly orphaned dead plumbing. **Final: LOW** — prune the orphaned factor/tag or confirm intent.

---

## 6. Cross-Cutting Themes

1. **`strokes_impact` (always 0) vs `counterfactual.strokes_saved_per_round` (the real value).** This single split drives the most findings: H2 (every flat ranker), H3 (assembler sizing of ctx composites), the morning-digest showing "~0.0," `goalBoost` nullification, and the mixed-unit composite ranking. **One canonical decision** — pick `counterfactual.strokes_saved_per_round` as the ranking/display currency (themes already do; flat paths and EvidencePanel do not) — resolves a whole class. The cleanest single change is backfilling `evidence.strokes_impact = counterfactual.strokes_saved_per_round` in `generator-base.ts:141` after `computeCounterfactual`, which fixes ranking AND the EvidencePanel "~0.0" display in one place.

2. **Unit handling at the approach-miss seam.** The "reach vs dial-in" redesign changed `approach_miss.your_value` from feet to percent but left two composites (C1), two tests (C2), and the `proximity_when_hit_feet` evidence gap behind. The redesign was half-landed: the generator was fixed, downstream consumers and tests were not. A grep for any reader of `approach_miss.your_value` that assumes feet should be part of the fix.

3. **Baseline source = PGA Tour everywhere.** H4 + H5 + the cohort-orphan + the par-type dual baseline all stem from the same gap: the college/division baseline infrastructure (`cohortBaselineValue`, `level_avg`, div1/d2/d3 columns) is built but unwired, and the live RPC hard-codes Tour. The themes path partially masks this with team-anchored "realistic" gaps, but the my-standing CounterfactualLine and cold-start paths show the raw Tour gap.

4. **Subset/empty-array edge cases.** H1 (empty `source_insight_ids` is a subset of everything) is a classic vacuous-truth bug — a length-guard would also be worth auditing anywhere else `[].every()` / subset logic appears.

5. **Tests that lock in bugs or skip the live lifecycle.** C2 (percent-as-feet asserted as correct), the lag-distance test feeding impossible buckets, and the zero-coverage `generator-base` lifecycle mean CI is green over real defects. Property tests exist for the math but not for the wiring that produces user-facing numbers.

---

## 7. Prioritized Remediation Plan

### P0 — Ship-blocking (wrong claims / silent data loss on live path)
1. **Fix the approach percent-as-feet composites (C1).** Surface `proximity_when_hit_feet` into `approach-miss.ts` evidence; rewrite `long-approach-3putt-cascade.ts:16-23,52-69` and `short-approach-proximity-gap.ts:14-21,49-69` to read it with corrected (LOW-green-hit% / HIGH-proximity) thresholds, or disable both until a proximity standing ships.
2. **Rewrite the two tests that lock in C1 (C2)** — `composite.test.ts:154-165`, `composite-w305.test.ts:147-167` — and add an end-to-end generator→rule contract test.
3. **Guard the empty-`source_insight_ids` subset suppression (H1)** — one line at `synthesis.ts:94`.

### P1 — High (misleading / materially degraded, broad blast radius)
4. **Make ranking counterfactual-first (H2).** Backfill `evidence.strokes_impact` from the counterfactual in `generator-base.ts:141` (fixes flat rankers, `goalBoost`, EvidencePanel "~0.0", and morning-digest in one place), OR change `rankScore`/`score.ts:80`/coach-feed comparator to read `evidence.counterfactual.strokes_saved_per_round`. Verify the 4 real-`strokes_impact` composites still rank.
5. **Quantify ctx composites in the assembler (H3)** — `assemble.ts:500-515` fallback to `evidence.strokes_impact`, or inject a real counterfactual in synthesis (prefer the latter to avoid the `delta×6` overstatement).
6. **Wire the college/division baseline (H4 + H5 + cohort-orphan).** Populate `level_avg` in `refresh_player_standing` RPC; pass it (or `cohortBaselineValue`) into `computeCounterfactual` in `generator-base.ts:118-126` with PGA fallback; fix scrambling's hard-coded 50% comparison.
7. **Persist priority on UPDATE (H6)** — `upsert.ts:186-196, 233-243`.
8. **Sanitize prose on the flat read path (H7)** — `insight-delivery.ts:917` (and `:809` if needed).
9. **Fix tone polarity from the registry (H8)** — `tone-derivation.ts:75` source from `METRIC_RENDER_CONFIG.direction`.

### P2 — Medium (correctness-adjacent / robustness)
10. **Reconcile the 30–49yd band edge (H9)** + the cache/RPC bucket misalignment (contested #3) + ship PuttDistance 15_25/25_plus buckets — these all touch the band-edge definitions across `use-shot-state-machine.ts:866`, `golf-stats-calculator-shots.ts`, `shot-source.ts`, `refresh.ts`, and the cache schema; do as one coordinated change.
11. **Normalize composite `strokes_impact` to per-round** (`doubles-after-bogey.ts:87`) + apply a <1.0 pressure closability factor (`lookup-tables.ts:92`, `pressure-decel-chain.ts:75`).
12. **Add the missing rate-limit gate** to `generateTeamInsights` (`insights.ts:~750`).
13. **Fix scrambling sample gating** (`scrambling.ts:40,105`) + descriptive-generator priority computation (`putt-distance.ts:122`, `par-type.ts:92`, `scrambling.ts:93`).
14. **Backfill tee_strategy category** + dedup opening-stretch across WarmupHole/front_9.
15. **Add the `generator-base` lifecycle test** (the untested counterfactual+standing producer) and fix the lag-distance / subset-suppression / chain-unit tests.

### P3 — Low / cleanup
16. Fix the null-unit ×3 in `approach-miss.ts:89-93`; rename ATG `20_30` label; remove or compute `totalStrokesPerRound`/`player_feedback`/orphaned `gir_pct` factor; soften closing-hole-fatigue and bunker-miss-side prose; remove dead RawShot detail fields or the v2 orchestrator's self-only test; add forbidden-token strip to `sanitizeProse`.

---

## 8. What's Healthy

Credit where the engine is correct and well-built:

- **Core counterfactual math (`compute.ts`) is sound.** Gap-direction sign logic is correct for both `higher_better` and `lower_better`; the 0.3/round suppress threshold is applied consistently; the projected-score subtraction always moves toward a better score; the `gap <= 0` guard prevents negative strokes-saved. It is example-tested (`Counterfactual.test.tsx`) across both directions, no_gap, below_threshold, no_baseline, and full projection.
- **No destructive writes.** The v3 write path uses genuine `.upsert({onConflict, ignoreDuplicates})` with a recovery re-read, signature-scoped dedup, a TOCTOU-safe unique constraint, and per-generator failure isolation (`Promise.allSettled`) — fully consistent with the no-delete-then-reinsert policy.
- **Division safety is robust.** `safeAverage`/`safePercent`/`loadPlayerScoringBaseline` all null-on-zero; no divide-by-zero on the stats path.
- **Auth/RLS is correctly scoped.** `golf_coach_insights` RLS (`coach_insights_select_via_player_team` + `coach_insights_select_player_own`) correctly handles both the coach roster sweep and player self-read; `verifyPlayerAccess` gates every fetcher — no cross-team or cross-player leak found, including the `player-fingerprint.ts` "pass user.id as coachId" pattern.
- **The v3 themes assembler is genuinely well-built and well-tested.** Same-category demotion, stroke conservation (no double-count), the never-blank scaffold, magnitude capping (`min(childSum, |SG|)` / dominantCause), the realisticTeamGap team-fraction rescaling, and the realistic≤Tour invariant are all correct; covered by `assemble.test.ts` + `insight-delivery-themes.test.ts` including fast-check properties for conservation, disjointness, finiteness, never-throws, and theme-count bounds. The themes path correctly ranks by counterfactual — it is the flat paths that lag.
- **The documented v2 unit-inflation fix is correctly in place** in the v2 calculator (on-green-only proximity, `golf-stats-calculator-shots.ts:839-846`), and lie-aware SG already captures the harder-lie penalty via `getExpectedStrokes`.
- **Domain grounding on mechanism is correct** where it matters: SG spine, no forbidden "clutch"/"mental toughness" labels in shipped prose, lag-vs-line attributed correctly, and pressure tied to short-putt mechanics with research citations.
- **Several spec "gaps to close" are already closed:** the theme rollup, per-category SG trend (`computeSgTrends`), and the shot-driver layer (`shot-drivers.ts`) all exist and are mounted on the live redesign-on prod surface.
