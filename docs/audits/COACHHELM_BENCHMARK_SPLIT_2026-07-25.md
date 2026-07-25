# CoachHelm Benchmark Split — Strengths & Weaknesses vs. Season Standing

**2026-07-25 · read-only investigation, no code changed · all claims FACT unless marked INFERENCE/UNVERIFIED**

## TL;DR for the decision

- **6 of 22 current players (27%)** with Season Standing data get an opposite-direction grade (strength vs. weakness) on at least one putting/scrambling metric between the two systems, using real production data pulled today. On the 4 metrics that are both genuinely compared by Strengths & Weaknesses (S&W) *and* live in Season Standing, 8 of 88 player-metric pairs (9%) disagree in sign.
- **The two systems don't just disagree in theory — they disagree on the same screen, from the same fetch.** `StatsBento.tsx` (the Player Stats home view) renders a card literally labeled **"Standing"** whose headline text ("Strongest in X; leaking most in Y") comes from the *flat* S&W benchmark, while the card's own visual body (a Tour-value tick mark on a rail bar) comes from the *gender-aware* Standing benchmark — `src/components/golf/stats/spine-stage/StatsBento.tsx:134-135,253-262`. Both numbers are even fetched together: `strengthsWeaknesses` and `standing` are resolved in the **same `Promise.all`** in `stats-dashboard.ts:37-51` (`getPlayerStatsDashboardBundle`) — one network round-trip produces both contradicting numbers for one render. A coach doesn't need to navigate between two pages to see the contradiction; it's baked into one card, from one request.
- **The brief's premise needs a correction:** Season Standing is **gender-patched, not division-aware**, and the gender patch only covers a subset of metrics. `golf_teams` has no division column at all (verified via `information_schema.columns`), so no live code path can key off a team's actual NCAA division — despite `golf_pga_standards` already holding real D1/D2/D3/HS reference numbers for ~10 metrics that nothing reads. See §2.
- **Recommendation:** point S&W's candidate generation at the Standing/cohort-anchor values for the ~9 metrics where both exist, in men's-vs-women's terms (not division — division isn't buildable today without a schema change). Where Standing has no equivalent (SG four-ways, driving, GIR-by-8-distance-bands, scoring, pressure — roughly two-thirds of S&W's metrics), leave S&W's flat benchmark in place but visibly label it "college average, all divisions" so it stops silently masquerading as the same number Standing shows. Full cost below (§4); it's a code change, not a migration — neither table persists a grade.

---

## 1. The two systems, precisely

### 1a. Strengths & Weaknesses (S&W)

- **Engine:** `generateStatisticalStrengthsWeaknesses()`, `src/lib/golf/strokes-gained.ts:259-309`.
- **Benchmark table:** `COLLEGE_BENCHMARKS`, `src/lib/golf/strokes-gained.ts:176-235` — a single flat object, ~30 constants, module-private (never exported — verified via repo-wide grep, only used inside this one file).
- **Source of the numbers:** no citation, no comment. Every other constants table in this codebase (`PGA_BASELINE_DATA` at `strokes-gained.ts:54-80`, `golf_pga_standards`) carries a "Broadie / ShotLink" or "NCAA reports" provenance comment; `COLLEGE_BENCHMARKS` has none. **INFERENCE:** hand-picked, not sourced from a dataset.
- **Grading mechanism:** for each of ~20 sub-metrics, compute `strokeImpact = (playerValue − benchmark)` scaled to strokes/round (`strokes-gained.ts:357-727`). Collect all candidates, keep only those with `|strokeImpact| > 0.05`, take the **top 3 by magnitude** as "strengths" (positive) and **top 3** as "weaknesses" (negative) — `strokes-gained.ts:296-306`. This is a **ranked top-3 binary classification**, not a letter grade and not a percentile. A metric that disagrees with Standing but doesn't crack the top 3 simply isn't shown at all — it's neither a displayed strength nor a displayed weakness.
- **Gender/division awareness: none.** `getPlayerStrengthsWeaknessesImpl` (`src/app/golf/actions/stats-data.ts:2473-2498`) calls `getDetailedStats(playerId, 'overall', filter)` then `generateStatisticalStrengthsWeaknesses(stats)` — no team, no gender, no division parameter anywhere in the call. Confirmed by reading both functions in full.
- **Reached via:** `stats-data.ts:2493` → `StatsSpineStage.tsx` (confirmed: `getPlayerStrengthsWeaknesses` bundle populates `strengths`/`weaknesses` state at `StatsSpineStage.tsx:82-114`) → **`StatsBento.tsx`** (home tab) and **`PuttingDrill`** (putting drill-down), both of which also receive `standingByMetric` (`StatsSpineStage.tsx:267-284`).

### 1b. Season Standing

**Correction to the brief:** the brief's cited path `src/lib/golf/stats-leak-maps.ts:186-219` does not exist. The real file is **`src/app/golf/actions/stats-leak-maps.ts`** (confirmed via repo search — no `src/lib/golf/stats-leak-maps.ts` exists anywhere). Lines 186-219 of the real file are `loadPgaRefs()`, which is gender-routed as described, so the substance of the brief's claim survives — only the path was wrong.

Season Standing is actually three layers, not one:

1. **DB write path** — `refresh_player_standing(uuid[])`, a live Postgres function (pulled via `pg_get_functiondef`, not from a migration file — the migration named in `refresh.ts:6` no longer exists in this worktree's `supabase/migrations/`, so the function body is the only authoritative source). It computes, per (player, metric): `player_value` (from `golf_player_stats_cache`), `team_avg`/`team_pct` (percentile within the player's own team, `PERCENT_RANK()`), `level_avg`/`level_pct` (percentile within the **gender** population app-wide — `PARTITION BY tv.gender`, `COALESCE(t.gender,'mens')`), and `pga_value`/`pga_delta` from `golf_pga_standards WHERE metric_id = $2 ORDER BY season DESC LIMIT 1` **with no `tour` filter** — empirically this always resolves to the `'pga'` (men's) row (verified: `avg(pga_value)` for every metric in `golf_player_standing` has `min = max = avg`, a single constant, and it matches `golf_pga_standards`'s `tour='pga'` value, not `'lpga'`). So the DB-stored `pga_value` is gender-blind for every row, exactly as the code's own comments say.
2. **Read-level gender patch** — `applyGenderAnchor()`, `src/lib/coachhelm/v3/standing/gender-anchor.ts:57-91`, called from `loadPlayerStandingMap`/`loadStandingForMetric`/`loadPlayersStandingMap` (`src/lib/coachhelm/v3/standing/loader.ts:61-189`). For `gender==='womens'`, looks up a women's value in `COHORT_ANCHORS` (`src/lib/coachhelm/v3/counterfactual/cohort-baselines.ts:45-66`); if found, overrides `pga_value`/`pga_delta`; if not, leaves the men's DB value in place but sets `pga_omitted:true` so the UI suppresses the reference marker rather than showing a wrong one.
3. **Leak maps** — `src/app/golf/actions/stats-leak-maps.ts`, a separate reader of `golf_pga_standards` for putt-make and approach-proximity buckets only, gender-routed the same way (`loadPgaRefs`, `stats-leak-maps.ts:168-220`) but exposing a raw `div1_value` per bucket (`stats-leak-maps.ts:140-144,323-327,392-396`) that is **hardcoded to `div1_avg_value`** regardless of the team's actual division.
4. **Percentiles exist here, not in S&W.** `team_pct`/`level_pct` are real `PERCENT_RANK()` percentiles (0-100), computed in SQL. Standing has no letter grade either — confirmed by reading `StandingDrill.tsx` and the `StandingBar`/`StandingStrip` components in full: they only ever render raw `player_value`/`team_avg`/`pga_value` positionally on a bar (`RailBars.tsx:48-52`, `StandingTrack`), never bucket into a grade or tier label. Only the S&W side (`strokes-gained.ts`) actually classifies into strength/weakness.
5. **S&W and Standing are two tabs of one page, not two separate screens.** `StatsSpineStage.tsx:263-292` registers both `StatsBento` (key `'home'`, hosts S&W) and `StandingDrill` (key `'standing'`) in the same `views: StageView[]` array, switched client-side via `stage.open(...)` — no navigation, no new route. A coach is one tab-click away from the other view at all times, which is why the `StatsBento.tsx` "Standing" card collision (TL;DR) is so easy to hit by accident.

**Grading mechanism:** live numeric comparison only — `player_value` vs. `pga_value`(gender-corrected)/`team_avg`/`level_avg`, rendered as bar position + tick mark. No stored letter grade or bucket anywhere (see §4).

---

## 2. "Division-tiered" — verified false for the live product

The brief describes Season Standing as "gender- and division-tiered." Gender: confirmed, see §1b. Division: **false as shipped**, verified three ways:

1. `golf_teams` has **no division column** (`information_schema.columns` for `golf_teams`: `id, organization_id, name, join_code, logo_url, primary_color, secondary_color, description, season, created_by, created_at, updated_at, timezone, gender, season_active` — no `division`, no `ncaa_division`, nothing). There is no field anywhere recording that Guilford College's "Men's Golf" team, or Lynchburg's "Women's Golf" team, is D3 vs. D1. **This alone makes true division-tiering impossible today without a schema change.**
2. `golf_pga_standards` **does** carry real division reference data — `div1_avg_value`, `div2_avg_value`, `div3_avg_value`, `hs_avg_value` columns, populated (non-null) for `gir_pct`, `big_number_rate`, `opening_hole_delta`, `penalty_rate_per_round`, `practice_tournament_delta`, `scoring_par_3/4/5`, `scrambling_pct_fairway/rough/sand` (full D1-HS spread), and D1-only for the approach-proximity and putt-make bands. Example real row: `gir_pct`, tour=`pga`: `pga_tour_value=66, div1=60, div2=55, div3=50, hs=40`. **None of it is read.** `refresh_player_standing()`'s `pga` CTE selects only `pga_tour_value, pga_p50` — it never references `div1_avg_value` etc. The one place division data IS read, `stats-leak-maps.ts`'s `loadPgaRefs`, hardcodes `div1_avg_value` for every team regardless of actual division — for a real D3 team (Guilford, Lynchburg) this silently compares them to Division 1, the wrong and harder bar, not their own (populated, unused) D3 number.
3. What the code *calls* `level_avg`/`level_pct` (which could sound like a division level) is actually a **gender population average** — `PARTITION BY tv.gender` in `refresh_player_standing`'s SQL, confirmed by reading the live function body. It is not scoped by division at all; it's "every men's player across every team in the app" vs. "every women's player." **The type definition itself is misleading**: `src/lib/coachhelm/v3/standing/types.ts:23` comments `level_avg` as `"Cohort tier (division-level) marker"` — that comment is wrong as shipped; it's gender-level, not division-level. Real population data, though: `MIN_COHORT_N=8` per player (migration `20260609230000_v3_gender_scoped_sibling_cohorts.sql:140-181`), and 420 of 464 `golf_player_standing` rows have it populated — so unlike the dead `div1/2/3` columns, this one is live, just mislabeled and gender-only. Net effect for the customer: a D3 women's player is benchmarked against *every* women's player in the app (D1 through HS pooled together), not her own division.

**Net:** Season Standing is gender-aware (partially — see the coverage table below) and *has the raw material* for division-awareness sitting unused in the DB, but ships zero division logic today. Any "smallest first step" that assumes division-awareness already exists in the target system is building on a false premise.

**One more layer, found after the above:** `src/lib/coachhelm/v3/standing/pga-standards.ts:169-190` defines `cohortBaselineValue(standard, tier: 'pga'|'korn_ferry'|'d1'|'d2'|'d3'|'hs')` — a function that *can* select `div1_avg_value`/`div2_avg_value`/`div3_avg_value`/`hs_avg_value` by tier, with a docblock claiming it's "Used by W17 counterfactual so a D3 player's 'close the gap' target is realistic." **Repo-wide grep for `cohortBaselineValue` and `CohortTier` finds zero call sites outside this one file.** It's dead code describing a consumer that doesn't exist in this worktree — the division-selection *accessor* has already been built, but nothing calls it, and (per the missing `golf_teams.division` column) nothing could supply it a correct `tier` even if it were called. This makes building real division-awareness later somewhat cheaper (the accessor exists), but doesn't change today's verdict: division-tiering is not live anywhere in the product.

---

## 3. Side-by-side: every metric both systems actually compare

"Actually compare" excludes `COLLEGE_BENCHMARKS.girPct` (overall, 60), `girPctPar3` (50), `girPctPar4` (55) — **all three are defined in the constants table but never referenced anywhere in `generateStatisticalStrengthsWeaknesses`** (verified: `grep -n "COLLEGE_BENCHMARKS\.girPct\b|girPctPar3\b|girPctPar4\b" strokes-gained.ts` → no matches outside the table declaration). Dead config, not a live disagreement — noted as its own finding in §6.

| Metric | S&W benchmark (`COLLEGE_BENCHMARKS`) | Standing/tiered men's | Standing/tiered women's | Match quality |
|---|---|---|---|---|
| GIR % (overall) | 60 (**dead — never used**) | `gir_pct` 66 | 60 (`cohort-baselines.ts:65`) | n/a — not live on S&W side |
| Putts made 3-5ft | `puttMake3_5` 75 | `putts_made_3_5ft_pct` 90.5 | 84.0 | exact metric match |
| Putts made 5-10ft | `puttMake5_10` 45 | `putts_made_5_10ft_pct` 62.2 | 52.0 | exact metric match |
| Putts made 10-15ft | `puttMake10_15` 25 | `putts_made_10_15ft_pct` 35.7 | 28.0 | exact metric match |
| Putts made 15-20ft | `puttMake15_20` 15 | `putts_made_15_25ft_pct` 15.4 | 11.0 | **band mismatch** — Standing's band is 15-25ft, not 15-20ft; the app's own `StatsBento.tsx:76-85` comment admits this ("no 15-20ft-exact metric exists... stays a reference point rather than an exact-bucket match") |
| Sand save % | `scramblingFromSand` 45 | `scrambling_pct_sand` 50 | 38.0 | exact metric match |
| Penalties/round | `penaltiesPerRound` 0.5 | `penalty_rate_per_round` 0.30 (men's only — no women's anchor; `pga_omitted:true` for women's teams) | — | exact metric match, gender gap |
| Qualifying-vs-practice gap | `qualifyingVsPracticeGap` 1.5 | `practice_tournament_delta` 0.5 (men's; **only 1 player-row exists in prod** — this metric is almost entirely uncomputed) | — | exact metric match, but Standing coverage is essentially empty |
| SG: Tee/Approach/Around/Putting | all 0 | `sg_ott/approach/around_green/putting` all 0 (raw DB) | **no COHORT_ANCHORS entry — none needed**, see §3a | agree numerically (both 0); see caveat below |
| GIR by 8 distance bands (50-75...225+) | 8 constants, all used (`girPct50_75`...`girPct225Plus`) | **none** — Standing tracks *proximity in feet after the shot* in 3 coarser bands (50-125/125-175/175+ yd), a different metric than GIR% | — | **no overlap** — different metric, different bucketing |
| GIR from fairway/rough (by lie) | `girFromFairway` 68, `girFromRough` 42 | **none** | — | gap |
| Fairway % (driving accuracy) | `fairwayPct` 60 | **none** — no driving-accuracy metric_id exists in `golf_player_standing` at all | — | gap |
| Scrambling % (overall), from rough | `scramblingPct` 55, `scramblingFromRough` 50 | `scrambling_pct_rough`/`scrambling_pct_fairway` anchors exist in `COHORT_ANCHORS` (`cohort-baselines.ts:61-62`) **but the underlying metric is on `STANDING_REFRESH_DEFERRED_METRIC_IDS`** (`refresh.ts:97-98`) — never populated. Dead anchors on both sides. | — | gap (both sides define it, neither computes it live) |
| Putt efficiency (strokes to hole out), 3 bands | 3 constants, used | none (Standing tracks make%, not efficiency-strokes) | — | no overlap |
| Three-putts/round, birdies/round, doubles+/round | 3 constants, used | `big_number_rate` is the closest analog but is a **rate of holes**, not doubles-per-round — different unit/definition, not a clean match | — | gap |

### 3a. SG doesn't actually disagree — verified with real data

`sg-benchmarks.ts:136-166` documents a `WOMENS_SG_SCALE` applied **at the DB expected-strokes-calculation layer** (`sg_expected_strokes()`, keyed off `golf_teams.gender`), not at the benchmark-comparison layer. This means the *player_value itself* is already gender-corrected before either system sees it — so both S&W's flat `benchmark: 0` and Standing's raw `pga_value: 0` are comparing against the same number, and they agree. Pulled real rows to confirm: Grace Saunders (`Women's Golf`, Lynchburg) `sg_total = -7.82`, Lily Rowe (same team) `sg_total = -6.01` — large negative numbers, but **consistent with a D3-level scoring average (~8 over par) benchmarked against a scratch/Tour 0**, not a gender artifact. **Separate, non-disagreement finding relevant to §2's "wrong for D3" question:** because SG's 0-baseline is scratch/Tour regardless of division, *every* sub-D1 player will show negative SG in nearly every category on both screens — this is a shared design choice in both systems (not something unification would fix), but worth flagging since it affects the actual customer (D3 programs).

---

## 4. Quantified disagreement — real production data, pulled today

Data as of 2026-07-25: 13 teams (11 mens, 2 womens), 61 players, 26 players with any `golf_player_standing` row (464 rows total), 30 `golf_player_stats_cache` rows, 284 completed rounds. This is a small, real production dataset (Guilford College, Denison, Hampden-Sydney, Lenoir-Rhyne, Methodist University, Piedmont, University of Lynchburg, plus demo/QA teams) — not synthetic.

**Method:** for the 4 metrics that are both (a) genuinely compared by S&W (i.e., not dead config) and (b) live-populated in `golf_player_standing`, computed each player's `(player_value > S&W_benchmark)` vs. `(player_value > gender-correct tiered_benchmark)` and flagged a mismatch — this is exactly the sign S&W's own `strokeImpact` computation uses (`strokes-gained.ts:394,455,595,614`: `strokeImpact` sign = sign of `playerValue − benchmark`), so it's a faithful proxy for "would this metric be classified as a strength on one screen and a weakness on the other."

| Metric | Player-metric pairs | Sign flips |
|---|---|---|
| `putts_made_3_5ft_pct` | 22 | 4 |
| `putts_made_5_10ft_pct` | 22 | 1 |
| `putts_made_10_15ft_pct` | 22 | 2 |
| `scrambling_pct_sand` | 22 | 1 |
| **Total** | **88** | **8 (9%)** |

**6 of 22 distinct players (27%)** have at least one flip across these 4 metrics.

Two concrete examples that clear S&W's own `|strokeImpact| > 0.05` display threshold (i.e., these would genuinely surface as a "strength" candidate on the S&W screen, not just theoretically):

- **Larsen Gallimore** (Men's Golf, Guilford), `putts_made_3_5ft_pct = 87.5%`. S&W: `87.5 > 75` → strength candidate, `strokeImpact = +0.31 strokes/round`. Standing: `87.5 < 90.5` (men's Tour anchor) → below-benchmark bar.
- **Grace Saunders** (Women's Golf, Lynchburg), `putts_made_3_5ft_pct = 77.8%`. S&W: `77.8 > 75` → strength candidate, `strokeImpact = +0.07 strokes/round`. Standing (gender-corrected): `77.8 < 84.0` (women's cohort anchor) → below-benchmark bar.

The remaining 6 flips are sub-threshold on the S&W side (e.g., Connor Lynde `putts_made_10_15ft_pct = 26.9%` vs. S&W benchmark 25 → `strokeImpact = 0.038`, below the 0.05 cutoff, so S&W shows *nothing* for this metric while Standing shows it as below the 35.7% men's-Tour anchor — a milder but still real contradiction: one screen is silent where the other is red.

Penalties/round (men's only, no women's cohort anchor): checked separately with the correct "lower is better" direction — 0 flips among 20 men's players today. Not a live problem currently, but has zero coverage for the 2 women's players (marker suppressed, `pga_omitted:true`).

**Caveat:** `golf_player_standing` only covers 22-26 of the 61 total players (cold-start players with `rounds_played < 5` in the refresh RPC's `WHERE` clause never get a row). The 27%/9% figures are relative to the *covered* population, not all 61 players.

---

## 5. Which source should win

**Recommendation: for the ~9 metrics where a genuine, currently-computed, gender-correct equivalent exists (putts 3-5/5-10/10-15ft, sand-save, GIR — once re-wired, see below), point S&W's candidate generation at the Standing/cohort-anchor values instead of `COLLEGE_BENCHMARKS`.** Gender-awareness is more correct in principle and it's already built, tested, and live for these metrics — no need to invent a new system.

**But this covers roughly one-third of S&W's ~20 live comparisons.** The tiered system has real gaps that would need to be accepted, not silently papered over, if S&W fully deferred to it:

- **No SG-by-category anchor** in `COHORT_ANCHORS` — not a problem per §3a (both already agree at 0), but worth noting explicitly rather than assuming it's covered.
- **No driving accuracy (`fairwayPct`)** metric at all in the Standing pipeline.
- **No GIR-by-distance** (8 bands) or **GIR-by-lie** (fairway/rough) — Standing's closest analog (approach proximity in feet) is a different metric entirely, not a drop-in replacement.
- **No putt efficiency, birdies/round, three-putts/round, doubles+/round** — Standing's `big_number_rate` is a differently-defined proxy (rate of holes, not count/round) for doubles+, not an exact substitute.
- **Scrambling (overall) and scrambling-from-rough have anchors defined in `COHORT_ANCHORS` for nothing** — `scrambling_pct_rough`/`scrambling_pct_fairway` are on `STANDING_REFRESH_DEFERRED_METRIC_IDS` (`refresh.ts:97-98`) and never populated. Pointing S&W at these would resolve to nulls.
- **`practice_tournament_delta` (qualifying-vs-practice gap) has essentially no data** — 1 row in the entire production DB. Even though the anchor exists, deferring to it would make this metric go dark for nearly every player.
- **Band mismatch on 15-20ft putting** — Standing's nearest band is 15-25ft. Pointing S&W here means either accepting an inexact reference (as `StatsBento.tsx` already does, with a code comment admitting it) or leaving this one metric on the flat benchmark.

For everything outside the ~9-metric overlap, S&W's flat benchmark is the only number that exists — the honest move is to keep it but stop presenting it as equivalent to the Tour/cohort-anchored numbers next to it (see §7).

**D3/women's-specific correctness check (the brief's actual customer, Guilford + the two women's teams):** confirmed no division data flows anywhere (§2), so a D3 team is compared to the same benchmark as a D1 team on both screens today — this is a real accuracy gap for the target customer, but it's a gap in *both* systems equally, not something switching from one to the other fixes. Building true division-awareness needs a new `golf_teams.division` field plus wiring through `refresh_player_standing()` and `stats-leak-maps.ts` — out of scope for "stop the contradiction," in scope for a real accuracy fix later.

---

## 6. Cost of unifying

**No stored grade exists anywhere — this is a pure code change, not a migration.** Verified directly via `information_schema.columns`:

- `golf_player_stats_cache` (89 columns) — all raw numeric facts (`gir_percentage`, `putt_make_pct_5_10ft`, `strokes_gained_putting`, etc.) or counts/dates. No grade, bucket, or label column.
- `golf_player_standing` (12 columns: `player_id, metric_id, player_value, team_avg, team_n, team_pct, level_avg, level_n, level_pct, pga_value, pga_delta, computed_at`) — numeric only, re-diffed live on every read via `applyGenderAnchor()`. Repo-wide grep for `*_grade`/`*_letter`/`strength_weakness`/`sw_grade`/`benchmark_grade` found nothing.
- S&W's `strengths`/`weaknesses` arrays are computed fresh on every page load (`getPlayerStrengthsWeaknessesImpl`, `stats-data.ts:2473`) — never written to a DB table.

Changing either benchmark table takes effect on the next read for every player; there is nothing to backfill.

**Known call sites that would be touched or need to stay consistent** (repo-wide grep, not exhaustive beyond what's cited — a fuller sweep is still running as a background check and can be appended):

- `generateStatisticalStrengthsWeaknesses` — single call site, `stats-data.ts:2493`, feeding `StatsSpineStage.tsx` → `StatsBento.tsx` (home tab, the "Standing" card collision described in the TL;DR) and `PuttingDrill` (putting drill-down, same `weaknesses` + `standingByMetric` props pattern, `StatsSpineStage.tsx:280-290`).
- `StandingBar`/`StandingStrip`/`StandingTrack` components (the Standing pipeline's render layer) have a much wider footprint than the Stats page alone — repo grep shows them imported by `InsightsDrill.tsx`, `DiagnosisPanel.tsx`, `PlayerCoachHelmHome.tsx`, `EvidencePanel.tsx`, `PlayerSpine.tsx`, `FilmstripReview.tsx`, `GoalCreationModal/index.tsx`, `GoalCard/index.tsx` — i.e., the **CoachHelm AI insight-narrative engine** (`loadPlayerStandingMap`'s own docblock: "Used by: W14+ generator base class (`evidence.standing` injection)") also runs on the gender-aware tiered numbers. Unifying S&W into this system means the AI-generated insight prose and the Stats page would finally agree; leaving S&W as-is means the AI narrative and the Stats S&W widget can already disagree with each other today, independent of this ticket.

---

## 7. Smallest honest first step

Full unification (rewriting S&W's candidate generation to consume gender-corrected anchors for every metric it touches, deciding what to do about the ~two-thirds gap in §5, and deciding whether to build division-awareness) is a multi-week effort with real product decisions embedded in it (what benchmark to show for scrambling-from-rough when it isn't computed; whether to fabricate a 15-20ft anchor or accept the 15-25ft proxy; whether GIR-by-distance needs its own cohort-anchor project).

**The smallest change that stops a user seeing two silently-contradicting numbers, without waiting on any of that:**

1. **Fix the concrete collision first:** in `StatsBento.tsx:253-262`, the "Standing" card's headline (`worstCategory.label`, from flat S&W) sits directly on top of a body chart (`StandingPinPreview`, from gender-aware Standing). Re-label the headline source, or move the S&W best/worst summary into its own card titled something other than "Standing" so a coach doesn't read one card as one coherent computation. This is a render-layer fix (one file), not a benchmark-logic change.
2. **For the ~9 metrics with a genuine live overlap** (§5's first list), swap `COLLEGE_BENCHMARKS` for the gender-corrected `cohortAnchor()`/`golf_pga_standards` value in `strokes-gained.ts`'s candidate functions — these are the only ones with real production evidence of disagreement (§4) and the only ones with a trustworthy replacement number ready to go.
3. **For everything else, don't touch the number — label it.** Add "(college average, not gender/division-adjusted)" or similar to the S&W detail string for the ~two-thirds of metrics with no tiered equivalent, so the two numbers stop looking like the same kind of claim even though they can't be unified yet.

This closes the loudest, most visible contradiction (the one-card collision) and the highest-confidence numeric disagreements (§4's 8 real flips) without committing to the larger, still-undecided design questions in §5's gap list.

---

## Appendix: file:line index

| Claim | File:line |
|---|---|
| S&W engine | `src/lib/golf/strokes-gained.ts:259-309` |
| `COLLEGE_BENCHMARKS` table | `src/lib/golf/strokes-gained.ts:176-235` |
| `COLLEGE_BENCHMARKS.girPct`/`girPctPar3`/`girPctPar4` unused | grep confirmed no reference outside the table declaration |
| S&W top-3 threshold classification | `src/lib/golf/strokes-gained.ts:296-306` |
| S&W call site, no gender/division param | `src/app/golf/actions/stats-data.ts:2473-2498` |
| Real file for "stats-leak-maps" (brief cited a nonexistent path) | `src/app/golf/actions/stats-leak-maps.ts` (not `src/lib/golf/stats-leak-maps.ts`) |
| `loadPgaRefs` gender routing | `src/app/golf/actions/stats-leak-maps.ts:168-220` |
| `div1_avg_value` hardcoded regardless of division | `src/app/golf/actions/stats-leak-maps.ts:140-144,323-327,392-396` |
| Standing loader + gender application | `src/lib/coachhelm/v3/standing/loader.ts:61-189` |
| `applyGenderAnchor` | `src/lib/coachhelm/v3/standing/gender-anchor.ts:57-91` |
| `COHORT_ANCHORS` table | `src/lib/coachhelm/v3/counterfactual/cohort-baselines.ts:45-66` |
| `refresh_player_standing()` SQL (live DB function, migration file absent from worktree) | pulled via `pg_get_functiondef` against the connected Supabase project |
| `STANDING_REFRESH_DEFERRED_METRIC_IDS` (scrambling rough/fairway never populated) | `src/lib/coachhelm/v3/standing/refresh.ts:82-99` |
| `golf_teams` has no division column | `information_schema.columns` for `golf_teams`, connected Supabase project |
| `golf_pga_standards` division columns populated but unread | `information_schema.columns` + direct `SELECT` against `golf_pga_standards`, same project |
| RailBars tick rendering | `src/components/fairway/modules/RailBars.tsx:48-52` |
| StatsBento "Standing" card collision | `src/components/golf/stats/spine-stage/StatsBento.tsx:52-55,68-107,134-135,250-263` |
| StatsSpineStage wiring both props into StatsBento/PuttingDrill | `src/components/golf/stats/spine-stage/StatsSpineStage.tsx:82-114,263-292` |
| WOMENS_SG_SCALE (SG pre-corrected at computation, not comparison, layer) | `src/lib/golf/sg-benchmarks.ts:136-166` |
| Real SG values, women's team, prod data | `golf_player_standing` query against connected Supabase project, 2026-07-25 |
| Disagreement counts (§4) | ad hoc read-only SQL against connected Supabase project, 2026-07-25, joining `golf_player_standing`, `golf_players`, `golf_team_members`, `golf_teams` |

**Latent landmine, not live today — flag before anyone wires it up:** `COHORT_ANCHORS`' `approach_proximity_50_125ft`/`125_175ft`/`175_plus_ft` entries (`cohort-baselines.ts:54-57`, values 80/70, 65/56, 50/42) are commented as green-hit **percentages**, but `metric-config.ts:55-57` declares those same metric_ids as `unit: 'feet'`, and the values don't match `golf_pga_standards.pga_tour_value` for the same metric_id (verified: PGA 50-125yd reference is 18 **feet**, not 80). This mismatch is inert today because the live approach-proximity path (`SHOT_REFRESH_METRIC_IDS` → `loadStandardsForGender`) doesn't call `cohortAnchor()` at all — but if a future change routes proximity through the cohort-anchor path, it will silently apply a "percent" value where a "feet" value is expected.

**Checked after first draft:** `src/lib/coachhelm/v3/standing/metric-config.ts:33-79` — confirmed 28 canonical metric IDs, each with only `direction`/`unit`/`display_label`/bar `default_scale`. No letter grade, bucket, or threshold logic beyond what's already described in §1b/§5. Doesn't change the recommendation.

**UNVERIFIED / not settled by this investigation:**
- Whether a fuller repo grep would surface additional S&W or Standing call sites beyond those cited in §6 — the components search was broad (`StandingBar|StandingStrip|StandingTrack`) but not exhaustively traced hop-by-hop to every terminal route the way §6 implies is still useful to do before writing code.
- **Scope note, not investigated further here:** `EvidencePanel.tsx:28-33,344-345` references a **third, older benchmark system** ("legacy BenchmarkScale") that CoachHelm insight cards fall back to when `evidence.standing` isn't populated. The brief scoped this investigation to S&W vs. Standing; a third system existing alongside them is a related finding worth its own look before any unification work ships, since "unify the two" could still leave a third, older number in play on some insight cards.
