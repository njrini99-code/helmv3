# GolfHelm Stats Accuracy & Population Audit — 2026-06-09

**Mandate:** "Make sure the stats computation for players and coach is 100% accurate and all populating."
**Method:** three independent passes — (1) data-layer recompute-and-diff of every cache column against raw `golf_holes`/`golf_shots` on prod, (2) read-surface audit of every player/coach stats display, (3) write-path audit of every cache writer, trigger, and refresh trigger condition. Plus a full shot-tracking→UI pipeline trace.

---

## 1. Data layer (prod, project qmnssrrolpinvwjjnufo) — verified CLEAN

Recomputed from raw tables and diffed against stored values, all players, all completed rounds (173):

| Check | Result |
|---|---|
| Player cache: 24 columns (scoring avg, putts, GIR, FW, scramble, sand, penalty/18, hole-count buckets, par-3/4/5 avgs, SG ×5, best, last-date) vs recompute mirroring the live writer | **0 divergent** |
| `golf_round_stats_cache` + denormalized `golf_rounds.total_*` vs raw hole sums | **0 drift**, 0 missing rows, 0 orphans |
| SG: every completed round has SG; components sum to total; round-cache mirrors rounds; mean SG −5.54 vs mean +4.49 over par ≈ Broadie baseline offset | **clean / populated** |
| Putt make-% bands + attempt counts vs raw `golf_shots` | **exact match** |
| Proximity, miss-direction %, putts-per-GIR, driving distance vs live-function mirror | match (1-decimal storage rounding only) |
| Population: players w/ rounds missing cache rows; stale flags; cache older than latest round | **all zero** |
| Standing: 13 eligible (≥5 rds) players — rows present, fresh, percentiles in range; low-round players' rows are by-design shot-sample metrics (≥3 shots/band gate) | clean |

The standing-cron self-checks (SC1 prune, SC2 covered-metric-zero-rows assertion) and `check:stats` guard (19 players, 0 divergent) corroborate.

## 2. Bugs found and FIXED (this PR + applied prod migrations)

### Read surfaces (display math)
1. **Leak maps truncated at 1000 rows** — `stats-leak-maps.ts` putt/approach/round-id fetches used `.limit(20000)` with no pagination (PostgREST hard-caps at 1000). Player/team putt-make and approach-proximity leak maps computed from an arbitrary subset for big datasets. → paginated via `fetchAllRowsResult`.
2. **PuttingStats heatmap truncated** — same class, client-side `.limit(5000)`; rounds list capped at 200. → inline pagination loop.
3. **Player Hub headline stats capped at 50 rounds** — `roundsPlayed` could never exceed 50; career best older than 50 rounds vanished. → headline stats now read the canonical cache; the rounds fetch only feeds recent-form widgets.
4. **Coach Dashboard "All" window silently capped at 200 rounds** — every KPI (team scoring avg, GIR%, putts, top players, monthly trend). → paginated, full window.
5. **Round Review comparison averages** — GIR/FW were average-of-percentages (Simpson's-paradox class) and missing data was **fabricated** (avgScore=72, putts=32, GIR/FW=50) and presented as "your averages". → weighted + null-honest (comparisons skip when no data).
6. **Round Review grading compared raw 9-hole values to 18-hole averages** — every 9-hole round graded "exceptional" (16 putts vs 32 avg). → normalized comparison inputs.
7. **AI recap compared 9-hole scores to 18-hole season averages and PERSISTED the text** ("~37 strokes below the season average"). → comparison ledes skipped for non-18 rounds (deterministic + LLM prompt facts). Prod scan: **0 bad recaps persisted** (all stored recaps are 18-hole).
8. **Engine SG-per-round denominator** divided by ALL rounds (cache divides by SG-rounds only) — engine figure shrank ~3× for players with partial shot data. → SG-eligible denominator, matching the cache.
9. **Two different "make %" definitions on the Putting tab** — by-break grid was first-putt-only with made = exactly-1-putt. → all-putt definition everywhere (data model carries break on every putt); caption fixed.
10. **Putt bands dropped whole holes when the first putt lacked a distance.** → every distance-tagged putt contributes (matches the DB function).
11. **Engine fabricated score=par, putts=2 for shotless holes.** → null-honest; all consumers (totals, streaks, buckets) skip-and-reset; no NaN paths.
12. **`holes_played` not passed into RoundInfo** (`stats-data.ts`) — 18-vs-9 classification inferred from hole-row count; partial hole entry shifted format buckets. → passed through like `player-profile-stats.ts`.
13. **`bestToPar` unnormalized** — a −1 over 9 holes beat E over 18 while `bestScore` was normalized. → normalized ×18/holes.
14. **`getCoachRosterStats` rounds fetch unpaginated** (1000-row cap on large teams). → paginated.
15. **Team averages unweighted** — Team Stats footer + FairwayTeamStats summary/SG hero averaged per-player averages (2-round walk-on = 40-round starter). → rounds-weighted.
16. **Team page birdies comparator counted eagles** (`<= par-1`; latent, column not rendered). → `=== par-1`.
17. **Round detail `scramble_attempt`** flagged from `up_and_down !== null` instead of missed-GIR. → canonical `gir === false AND score IS NOT NULL`.
18. **Putts/Rd definition unified** — hub/coach-dashboard/shot-analytics used mean-of-per-round-normalized; canonical is hole-weighted `(Σputts ÷ Σholes) × 18`. → aligned everywhere.

### Write path / population (migrations applied to prod 2026-06-10)
19. **`up_and_down_percentage` had NO writer** while player-fingerprint displays it (0 populated vs 1,133 source rows). → computed in both the trigger writer and `refresh_player_stats_cache`; prod backfilled (20/20 players, 0 divergent).
20. **Standing orphans never pruned for off-roster players** — prune was team-scoped; a player removed from all teams kept frozen rows forever (live example: 14 rows). → global-orphan clause added; prod pruned.
21. **Round trigger ignored `round_date`/`holes_played`** — a direct PATCH changed ordering-sensitive stats with no recompute. → added to the trigger's `UPDATE OF` list.
22. **Lost-`after()`-callback staleness hole** — shot-derived columns (putt bands, proximity, miss bias, putts/GIR, driving distance) are refresh-only; if the post-submit callback dies, `is_stale` is already false and nothing self-heals. → nightly standing-refresh cron now pre-refreshes chunk players that are stale-flagged or had completed-round activity in the last 26h, BEFORE ranking.
23. **`golf_pga_standards` seed lived only in prod** — fresh environments got an empty standing table. → codified as a repo migration (ON CONFLICT DO NOTHING).
24. **Five dead writer functions** (bound to no trigger, called by nothing) dropped, including `calculate_strokes_gained_on_round_complete` — migration 20260606200000's claim that it is a live BEFORE trigger was drift; SG is actually computed by `submit_round_atomic` + the invalidate pipeline (verified: all 173 rounds carry SG).

## 3. Shot-tracking → UI pipeline (traced, healthy)

Entry (`ShotTrackingComprehensive`) → `submit_round_atomic` (server recomputes totals; GIR derived from shots; SG in-transaction via `recalculate_round_strokes_gained` with per-team baseline; putt distances always-feet clamp [SG-2 fix verified live]) → trigger cascade (holes → round totals → round cache → player cache) → lazy full refresh on next stats read (`is_stale` → `refresh_player_stats_cache` → putt bands/proximity) → cron safety net (this PR) → display surfaces (cache or paginated weighted recompute).

## 4. Deferred (documented, not fixed)

- **SG estimate fallback** (`sg_estimate_from_holes`) blends heuristic SG into per-round averages for hole-only rounds, defeating the SG-eligible denominator gate. **Zero live impact today** (every prod round has shot-level SG). If hole-only rounds appear, either NULL the fallback or add an `sg_source` flag.
- **9-hole-only players** get NULL `scoring_average`/`last_5/10` (18-only by design) while best/worst are normalized — mixed semantics, UI shows em-dash; revisit if 9-hole-only users materialize.
- **Direct PATCH forged `total_score`** — round cache prefers the round column over hole sums by design (rounds without hole rows); a player can only falsify their own data, same as entering wrong scores.
- **`total_gir_possible`** has 3 coinciding-for-app-data definitions (all-holes / gir-not-null / score-not-null); align next time the round-totals function is touched.
- **Dormant columns** with no readers stay NULL by design: `putt_make_pct_left_to_right/right_to_left/straight`, `golf_round_stats_cache.detailed_stats`; `engine_version` frozen at 'v2' (cosmetic).
- **Scoring-average definition trio** (cache 18-only vs coach-dashboard normalized-mean vs roster hole-weighted "all" mode): each is internally consistent and labeled; full unification would change displayed numbers and deserves a product decision.

## 5. Re-verification after fixes (prod, 2026-06-10)

Full battery re-run after the mass cache refresh through the NEW functions: **0 divergent players**, 0 missing round caches, 0 stale flags, 0 standing orphans, trigger carries both new columns, dead functions gone, `check:stats` 19/0.
