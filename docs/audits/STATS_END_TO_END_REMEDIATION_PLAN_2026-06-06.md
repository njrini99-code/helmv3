# GolfHelm Stats — End-to-End Remediation Plan (2026-06-06)

Goal: every stat correct and **identical** across the two layers, because CoachHelm is built on the DB layer.

```
raw golf_shots/golf_holes
  ├─[TS calculators] → player stats pages
  └─[DB functions]   → golf_round_stats_cache → golf_player_stats_cache (+ golf_player_standing) → CoachHelm v3
```

## Confirmed correct (leave alone, but route through shared helpers to prevent drift)
GIR% (64.75), putts/round (32.9, 18-norm), scrambling (33.7), par-type scoring, doubles%.

## Fixes — ordered by impact

### ✅ STAGE 1 — SG model recalibration — DONE 2026-06-06

**Root cause (proven on prod data, demo player Nick Rini 49ffe06d):** ONE shared,
mis-calibrated, internally-inconsistent expected-strokes table across THREE engines
(`sg_expected_strokes` DB fn = `PGA_BASELINE_DATA` strokes-gained.ts = `PGA_TOUR_BASELINE`
sg-benchmarks.ts; plus a 4th divergent bucketed `buildDefaultBaseline` in shot-level-sg.ts):
- TEE curve too high AND no data below 260yd → 442yd par-4 read 4.50 (true ≈4.18); every
  par-3 tee shot (categorised approach, lie='tee') floored at 3.62. Phantom +0.59/drive.
- FAIRWAY/ROUGH sagged 0.3-0.5 below Tour (fw 140=2.61 vs Broadie 2.91; rough 100=2.54 vs 3.02).
- GREEN curve too low in makeable range (8ft=1.24 vs 1.50) → −0.23/putt phantom loss.
- Off-tee inflation (+7.76/rd) and putting deflation (−7.32/rd) CANCELLED to a fake −0.09 total.

**Fix applied:** migration `20260606140000_fix_sg_expected_strokes_baseline_calibration.sql`
replaces all lie curves with Broadie "Every Shot Counts"/ShotLink anchors (sourced from
docs/v3-research-golf-domain.md + DIY-golfer reproductions of the canonical table; putting
cross-checked against the doc's Tour make% table). TEE extended down to 80yd. Same anchors
mirrored into all 3 TS engines. PROD recomputed: `recalculate_round_strokes_gained` (176
rounds) → `update_player_stats_strokes_gained` (all players) → `refresh_player_standing`
(all teams). Snapshots: `_bk_sg_recalib_20260606_{player_cache,round_cache,standing}`.

**Verified:** Nick off_tee +7.76→+1.15, app +1.61→−1.14, arg −1.37→+0.20, putt −7.32→−3.91,
TOTAL −0.09→−3.70 (matches independent TS canonical −3.77 and his +3.47 over par). Roster-wide
`SG_total ≈ −(strokes over par)` with tight ~−0.2 residual. Recompute also fixed STALE caches:
identical-data clones (Nick/Jackson/Braeden) had divergent old SG, now identical. Gate green
(tsc + lint + 1667 unit tests).

**Engine notes / follow-ups discovered:**
- `calculate_round_strokes_gained` (DB) is dead legacy (only in generated types) with inferior
  distance-based categorisation — candidate to DROP.
- SG is computed only vs PGA Tour (DB fn has no benchmark-level param). The multi-level
  `sg-benchmarks.ts` scaling + new `team_settings.sg_benchmark_level` (migration 130000) are
  NOT wired into the DB cache. If college-relative SG is intended, the DB fn needs a level arg.
- Data-quality (NOT engine): some players (Lily Rowe, Grace Saunders, Gabbie/Lily Hollberg,
  Taylor Park) have SG_total far below their scoring → incomplete shot tracking; demo seeder
  also clones rounds across players and gives bomber 287yd drives on 442yd par-4s (gh.yardage NULL).

### STAGE 1 (original notes) — SG model recalibration (CRITICAL; poisons CoachHelm SG + standing)
- Root cause: `PGA_BASELINE_DATA` (TS `src/lib/golf/strokes-gained.ts`) and the DB `sg_expected_strokes()` share a mis-calibrated baseline.
  - **green/putting curve too low** by 0.15–0.30 across lag range → fix to Broadie standard (3ft 1.04, 4 1.13, 5 1.23, 6 1.34, 7 1.42, 8 1.50, 9 1.56, 10 1.61, 12 1.69, 15 1.78, 20 1.87, 25 1.93, 30 1.98, 40 2.06, 50 2.14, 60 2.21).
  - **tee curve too high** (600=4.90 → ~4.52; 400=4.10 → ~3.99) and **fairway/rough short-range too low** (100yd fairway 2.40 → ~2.80) — recalibrate so a tour drive nets ≈0 and a +3.47 scorer's SG total ≈ −3.5 to −4.5.
- Apply to BOTH TS baseline AND DB `sg_expected_strokes` (one shared set of numbers).
- Recompute `golf_rounds.strokes_gained_*` → `golf_round_stats_cache` → `golf_player_stats_cache.sg_*_per_round` → `golf_player_standing` (sg_*). VERIFY Nick total ≈ −3.8, tee ≈ +1.2, putt ≈ −3.9.
- Add a guardrail: flag any per-round SG component with |value| > ~4.

### ✅ STAGES 1.5–6 — DONE 2026-06-06 (continuation)

- **STAGE 1.5 (SG durability):** SG was stored in 3 places with conflicting writers;
  `recalculate_round_strokes_gained` wrote only the cache, so `golf_rounds.strokes_gained_*`
  stayed stale (-0.09) and the AFTER trigger / `refresh_player_stats_cache` (both read
  golf_rounds) would have re-staled the cache on the next edit. Fixed: recalculate now
  syncs golf_rounds too (migration 150000) + backfilled. Verified 0/176 mismatched.
- **STAGE 2 (putt make%):** cache columns were 100% NULL; added `update_player_putt_make_pct`
  + true `putt_make_pct_15_25ft`/`25_plus_ft` columns (migrations 160000/170000), fixed
  `refresh_player_standing` band bindings (180000), repointed v3 putt-distance generator,
  re-promoted the 5 deferred standing metrics. Verified cache==raw truth (Nick 3-5=60.5 vs
  old stale 94.8) and LIVE CoachHelm renders 61/35/15/13/2%.
- **STAGE 3 (fairway% denom):** `recompute_golf_round_totals` + golf.ts + admin-tracer counted
  ALL par-4/5 holes; fixed to `par>=4 AND fairway_hit IS NOT NULL` (migration 190000) +
  backfill. Nick driving accuracy 59.6% → 60.8% (cache==truth==LIVE UI).
- **STAGE 4 (sand-save):** VERIFIED the plan's direction (the in-code comment claiming the
  gir gate matched ground truth was WRONG): cache ungated denominator = 248 = shot-level
  greenside-bunker-visit truth; the old gir=false gate wrongly dropped legit bunker visits.
  Dropped the gate in shot-analytics.ts + golf-stats-calculator-shots.ts. LIVE UI shows
  5% / 20 attempts. (Note: a greenside-bunker visit is a sand-save opportunity even when the
  hole is correctly GIR — e.g. a par-5 regulation 3rd shot played from a greenside bunker onto
  the green; sand_save itself is the user-entered up-and-down result, never set without a real
  bunker shot.)
- **STAGE 5 (anti-drift):** delivered canonical `src/lib/golf/stat-formulas.ts` (+ tests)
  mirroring the DB (NULL-on-empty %, correct fairway/sand denominators, 18-norm putts,
  18-round scoring avg). Full 188-site routing is an INCREMENTAL follow-up (mass blind
  rewrite is too regression-risky; the tested module is now the single source of truth).
- **STAGE 6:** prod recomputed across all stages; cache == independent raw-shot truth for
  SG/putt make%/fairway/sand; full gate green (tsc + lint + 1667 unit tests); LIVE CoachHelm
  visually verified for Nick Rini.

**Verified NON-issues (investigated 2026-06-06, no fix needed):** the `gir` column is CORRECT —
all 205 holes with gir=true + an around-green shot are legit GIRs (the chip/bunker shot was the
regulation stroke that reached the green; on-green-in-(par-2)=GIR), and 0 false-negatives. So
GIR% and scrambling are NOT affected by any gir bug.

**Remaining follow-ups:** (b) Several players (mostly women's team) show shot-level SG well
below their over-par scoring (Lily Rowe SG −11.56 vs +6.5; residual −5). INVESTIGATED: shots
are COMPLETE (4.35 shots/hole = 4.35 score/hole, 0 missing). Root = SG is vs the MEN'S PGA Tour
baseline and their par-4/5 tees average ~376 yd (forward tees) vs ~442 for the men's squad, so
the men's-Tour baseline expects well-under-par on short holes (per-round residual = Σ(E_tee−par)).
CORRECT SG math vs the chosen benchmark, NOT a miscalculation — remedy = level/gender-appropriate
baselines (= (d), a feature, not done).
(c) DB fn `calculate_round_strokes_gained` was NOT dead — it backs the BEFORE-completion
trigger `calculate_strokes_gained_on_round_complete`; CONVERGED with recalculate (migration
200000) so newly completed rounds get identical, correct SG (it previously skipped lie
normalization). `submit_round_atomic` already calls recalculate.
(d) multi-level SG benchmark (team_settings.sg_benchmark_level) intentionally NOT wired into
the DB SG cache: SG is computed vs PGA Tour (canonical Broadie semantics); the level only
scales the comparison UI.

### STAGE 2 — Putt make% by distance + break (CRITICAL; stale standing)
- DELETE stale/orphaned `golf_player_standing` rows for `putts_made_%ft_pct` and `putt_miss_bias_%` (showing 94.8%@3-5ft vs real 60.5%).
- Either add a DB cache writer for `putt_make_pct_*` (feet, [min,max) bands, gradeable = putt_made non-null) OR point CoachHelm putt-distance consumers at the raw-shot computation the TS leak-maps already use.
- Fix `refresh_player_standing` band bindings: 15–25 metric → true 15–25 column; 25+ → true 25+ column.

### STAGE 3 — Fairway% denominator (HIGH; write-path root cause)
- Write path: `golf.ts` saveRound `total_fairways`, DB `recompute_golf_round_totals`, `arccos-mapper.ts` → `COUNT(par>=4 AND fairway_hit IS NOT NULL)`.
- `refresh_player_stats_cache`: `fairways_total = COUNT(*) FILTER (WHERE par>3 AND fairway_hit IS NOT NULL)` (stop COALESCE-ing buggy `golf_rounds.total_fairways`).
- Backfill `golf_rounds` + recompute cache → driving_accuracy 60.8%.

### STAGE 4 — Sand-save TS unification (canonical = cache's greenside-bunker-visit denom = 20)
- `golf-stats-calculator-shots.ts` (Scrambling tab) + `shot-analytics.ts`: use greenside-bunker-visit denominator; stop the `!gir` gate dropping made holes. Converge to 5% (1/20).

### STAGE 5 — Shared helpers (prevent re-divergence across 188 sites)
- `computeFairwayPct`, `computeGirPct`, `computePuttsPerRound`/`computePuttRates`, `computeScramblingPct`, `computeSandSave`, `computeScoringAverage`/`computeBestRound`, approach `getApproachDistanceBucket`+`onGreenProximityFeet`, driving (delegate to calculateStatsFromShots), SG (one engine + one baseline).
- Route stats-data, player-profile-stats, dashboard-data, shot-analytics, stats.ts, golf-stats-calculator (cache transforms), round-review-system, v3 metric-sources through them. Fix dashboard `firPct`/putts/GIR to Σ-of-sums (not per-round mean).

### STAGE 6 — Recompute + verify end-to-end
- Recompute caches/standing for the team; assert player page == cache == CoachHelm == SQL truth for the full roster; re-run gate (tsc/lint/tests).
- HELD: no prod deploy / no prod recompute until user approves.

---

## STAGE 7 — 54-finding divergence-audit remediation (2026-06-06, follow-on)

An 88-agent adversarial sweep over every stat-computation surface found 54 confirmed
divergences (44 high / 10 medium). Fixed in priority order; each batch gated on
`tsc --noEmit` + `npm test` (1675 pass) + `npm run lint` (0 errors).

### Fixed — scoring 18-hole alignment (canonical: `update_player_stats_complete` uses
`v_total_score_18 / v_rounds_18`, `COALESCE(holes_played,18)=18`; per-round rates normalize over all holes)
- `player-fingerprint.ts` computeScoringAverage / computeScoringVsPar → 18-hole filter.
- `player-profile-stats.ts` scoringAverage / avgScoreToPar → 18-hole-only (best round stays normalized; GIR/fairway denominators already correct).
- `stats-data.ts` + `stats/team/page.tsx` → tightened the 18-bucket from `else` to `=== 18` so
  `scoring_average_18`/`rounds_played_18`/`best_round_18` match the cache exactly. The plain
  `scoring_average` ("All formats" toggle) correctly stays normalize-to-18 (a distinct metric).
- `admin-tracer-data.ts` `live_scoring_avg` → 18-hole-only (was normalize-all, false-flagged the tracer).
- `team-category-insights.ts` scoring trend → 18-hole rounds only (putting trend stays normalize-18 = canonical).
- `golf.ts` qualifier `averageScore` → null (not 0) on empty + type `number | null`; QualifierViewTabs guarded.
  (Deliberately NOT 18-hole-filtered: ranking uses cumulative to-par; filtering would blank legit 9-hole qualifiers.)

### Fixed — fairway denominator / null-coercion
- v2 `mining/tee-strategy.ts` + v3 `generators/tee-strategy.ts`: `fairway_hit` null no longer coerced to a
  miss; denominator = recorded-fairway tee shots; v2 fwPct → `number | null` with emitComparison early-return.
- `shot-analytics.ts` fairway denominator already canonical (par≥4 AND fairway_hit recorded) — verified.

### Fixed — percentage rounding (canonical 1dp) + null-on-empty
- `round-recap.ts` (LLM + fallback FIR/GIR), `round-reviews.ts` (fairway/gir) → canonical `pct()`.
- `round-review-system.ts` girPct → null on empty; `determineGrade`/keyStats/strokesToGain guarded for null.
- `stats-leak-maps.ts` putt-make% + proximity → `round(…,1)`.
- `cache/golf-stats-calculator.ts` livePuttsPerRound → 2dp (matches computePuttsPerRound).
- v3 `approach-miss.ts` green_hit_pct + penalty_rate_pct → `round(…,1)`.

### Fixed — putt-band canonical alignment
- `team-pattern-generator.ts`: stale putt benchmarks → D1 averages (golf_pga_standards.div1_avg_value:
  5-10ft 50, 10-15ft 25, 15-25ft 12); band renamed 15_20→15_25 (canonical). StatsRow + insights.ts select updated.
- `database.ts`: added `putt_make_pct_15_25ft` / `putt_make_pct_25_plus_ft` (migration 160000 cols, types were stale).

### Fixed — sand-save gate
- v2 `shot-analysis/scoring-opportunities.ts`: sand-save counting moved OUT of the `if (hole.gir) continue`
  gate (canonical: bunker-visit denominator, never gated on the mislabeled gir column).

### Fixed — platform-wide averages (top-50 bias)
- New gated RPC `get_admin_platform_stat_averages()` (migration 20260606210000) AVGs the full
  `golf_player_stats_cache`; `admin/rollup-b.ts` uses it for platformScoringAvg/FairwayPct/GirPct/PuttsPerRound,
  falling back to the (biased) top-50 calc only if the RPC degrades. (No visible effect today — 20 players < 50 —
  but corrects the bias once player count exceeds 50.)

### Fixed — stale comments / dead-code values
- `shot-level-sg.ts:164` header "D2/D3 college" → Broadie PGA Tour (matches the already-correct docstring/values).
- `insights/benchmarks.ts` (UNCONSUMED): PGA putt fractions → canonical (0.905/0.622/0.357); header notes it's
  superseded by golf_pga_standards. Band-name restructure (15_20→15_25) left — dead code, golf_pga_standards is SoT.

### Verified NON-issues (correct as-is; documented in-code)
- v2 `lie-specific-analysis.ts` green-finding/penalty "proxies" (calculateGreenHitRate, girRate bracket,
  driving penaltyRate): these are SHOT-LEVEL metrics (per distance-bracket/lie) that CANNOT be derived from
  hole-level booleans — correct by design; misnamed at worst. Added clarifying comments + canonical-source pointers.
- v3 `themes/shot-drivers.ts` local `pct()`: PROSE generator (whole-number % in sentences); null would break
  sentences and call sites already guard n>0. Commented as prose-only, not the canonical stat value.

### Deferred (documented; value is correct, only empty-state rendering or legacy approximation)
- `shot-analytics.ts` `calculatePercentage` 0-on-empty → null: ~28 call sites feed a typed return interface +
  50+ UI consumers; values are correct, only the empty state renders "0%" vs "—". Larger refactor; not done here.
- v2 `ScrambleAnalysis` rate fields 0-on-empty: the display card coalesces `?? 0` so null has no visible effect;
  `calculateConversionRate` is exported-but-unused. No display impact.
- v2 `lie-specific-analysis.ts` up-and-down 6ft proximity proxy (+ sand-save alias): a documented approximation;
  a true fix needs per-hole shot-sequence reconstruction in a live legacy engine. Authoritative up-and-down/
  sand-save figures already exist in the cache (scrambling_percentage / sand_save_percentage). Commented.
- Level/gender-appropriate SG baselines: a feature (no gender field on golf_players/golf_teams); unchanged.

---

## STAGE 8 — Full shots → stats → CoachHelm end-to-end verification (2026-06-06)

Drove a data-level cross-layer audit (live SQL on prod) alongside 3 parallel read-only
code-path agents (TS calculators, CoachHelm v3 sourcing, CoachHelm v2 sourcing).

### Data-level: VERIFIED CORRECT (live prod, 22 players)
- **round cache → player cache**: recompute-from-round-cache == stored player cache, EXACT,
  for all 12 metrics (scoring 18-only, scoring-vs-par, putts ×18, fairway%, GIR%, sand-save%,
  scrambling%, all 5 SG components — which sum to total).
- **shots → round cache (SG)**: per-round telescoping identity holds. Men residual ≈ −0.2
  (SG_total ≈ −over par). Women (Grace Saunders) residual −5.91 with stddev 0.78 — a SYSTEMATIC
  baseline gap (forward tees vs men's PGA baseline), NOT a calc bug (a bug would be high-stddev).
  Confirms the deferred level/gender-baseline feature is the only women's-SG remedy.
- **player cache → standing**: SG / gir / putt-bands match; putt bands bind to the CANONICAL
  15_25ft / 25_plus_ft columns (not legacy 15_20/20_plus) — the migration-180000 fix verified live.
- **platform sanity**: 0 out-of-range %, 0 SG-sum mismatches, 0 driving/approach OOB. The only
  2 null-scoring rows are demo accounts with 0 completed rounds (correct).

### Code-path agents — NEW divergences found & FIXED
- **golf-stats-calculator-shots.ts** (HIGH): partial (10-17-hole) rounds were bucketed as 18 →
  scoring avg/best wrong (feeds player profile). Fixed to strict `holesInRound===18`. Also
  best/worst normalized to 18 across all rounds (cache best_round_normalized), and avgScoreToPar
  now 18-hole-only (was normalize-all). Tests updated.
- **correlation-discovery.ts** (MED): GIR% hardcoded `total_gir/18` halved 9-hole GIR% and
  corrupted the GIR↔scoring correlation. Fixed to total_gir_possible denominator.
- **dashboard-data.ts** (MED): player firPct was an unweighted per-round mean capped at last-20
  rounds. Fixed to a weighted SUM(hit)/SUM(recorded) over all rounds (matches GIR%/putts).
- **insight-delivery.ts** (MED): v3 theme-sizing sgByCategory came from a ≤100-round shot
  recompute; now reads canonical golf_player_stats_cache.sg_*_per_round (agrees with standing).
- **golf-stats-calculator-shots.ts** (LOW): unknown-lie SG now routes to the FAIRWAY table to
  match the DB sg_expected_strokes() ELSE branch (was rough → TS/DB divergence on malformed lies).
- **putt-distance.ts** (LOW): stale 15_20-mapping header comment corrected (code was already canonical).

### Data gap found & FIXED (migration 20260606220000)
- **driving_distance_average + approach_proximity_average were NULL for ALL players** — no cache
  writer populated them, yet player-fingerprint / team-category-insights / stats-intelligence /
  insights read them (those surfaces silently empty). Added update_player_distance_proximity()
  (driving = AVG tee-shot distance>0 = TS drivingDistanceAvg; approach = AVG on-green approach
  finish ft = TS approachProximityAvg), hooked into refresh_player_stats_cache, backfilled.
  Verified: 20/22 populated (2 = 0-round demo accounts), driving 213.8–298.5 yd, approach 17.5–25.4 ft.
  The recreated refresh_player_stats_cache was proven byte-faithful (re-ran on Jackson Hale →
  all 18 existing stats identical to pre-migration snapshot).

### Orphan-data artifact found & FIXED
- Andrew Perry (the ONLY player on no team) had a stale pre-recalibration standing — all 5 SG
  rows from the old nonsense-component baseline (sg_ott −0.17 vs correct +1.34). Root: team-scoped
  refresh_player_standing can't reach a teamless player. NOT a pipeline bug (real players are
  always rostered). Synced his 5 SG standing rows to the canonical cache. Final check:
  standing↔cache mismatch = 0 across sg_total / gir_pct / sg_putting / putts_made_15_25ft.

### Verified NON-issues (correct as-is)
- v2 lie-specific-analysis green-finding/penalty are correct SHOT-level metrics; v3 shot-drivers
  pct() is prose. (Re-confirmed by the v2/v3 agents.)
- Most demo players share identical seeded shot data (expected for demo seeding, not a bug).

Gate after all STAGE-8 fixes: tsc clean, 1675 tests pass, lint 0 errors. Migrations 20260606210000
(platform averages) + 20260606220000 (distance/proximity writer) applied to prod.

---

## STAGE 9 — Deferred items closed + full integrity re-verification (2026-06-06)

Cleared every previously-deferred item; nothing left as a documented punt except the
one item that genuinely needs new data.

### FIXED — null-on-empty conventions (display correctness)
- **shot-analytics.ts**: `calculatePercentage` now returns null (not 0) on an empty
  denominator. Made the fed interface fields nullable (TeeStats / ApproachStats /
  AroundGreenStats / PuttingAnalytics / MissPatternData / DistanceRangeAnalytics) and
  fixed every consumer (tsc-guided): ShotAnalyticsPanel, ShotTypeBreakdown (BarItem +
  getBarColor + getPerformanceLabel now handle null → "—"/neutral), FairwayPlayerCoachHelm.
  Net effect: a category with no data renders "—" instead of a false "0%", and no-data
  stats are no longer flagged as a "weakness" or counted as a "strength".
- **scoring-opportunities.ts**: ScrambleAnalysis scrambleRate/sandSaveRate/upAndDownRate
  and calculateConversionRate now null-on-empty.

### FIXED — lie-specific up-and-down: proxy → true reconstruction
- v2 `lie-specific-analysis.ts` up-and-down rate (overall + per-lie) used a "finished
  within 6 ft" PROXY. Replaced with a TRUE reconstruction: an around-green shot counts as
  up-and-down when the hole was completed within 2 strokes of it (built a per-hole hole-out
  lookup from shot results). Validated on prod first: 1233/1233 around-green holes complete;
  true rate 40.4% vs the old proxy's 41.0% — so the proxy was empirically accurate, but the
  metric is now the actual outcome rather than a finish-distance heuristic.

### NOT FIXABLE without new data (documented, not a punt)
- **Women's SG reads too negative** (men's-PGA baseline on shorter forward tees). Confirmed
  via schema check: NO gender field exists on golf_players or golf_teams (only
  golf_team_settings.sg_benchmark_level = division scaling). Correctly computing women's SG
  needs (a) a gender field and (b) a women's/LPGA expected-strokes baseline table — neither
  exists, and fabricating either would be inventing data. This is a real feature, not a bug.

### FULL END-TO-END INTEGRITY SWEEP (22 players) — ALL ZERO
pct_out_of_bounds=0, sg_components_dont_sum=0, scoring_null_despite_18hole_rounds=0,
driving_oob=0, approach_oob=0, and standing↔cache drift=0 across sg_total / sg_putting /
sg_ott / gir_pct / putts_made_15_25ft / putts_made_25_plus_ft. The pipeline shots → round
cache → player cache → standing → CoachHelm is fully consistent.

Gate: tsc clean, 1675 tests pass, lint 0 errors.
