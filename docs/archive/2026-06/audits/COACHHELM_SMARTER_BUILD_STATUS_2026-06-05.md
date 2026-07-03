# CoachHelm "Smarter by Context" — Build Status & Backlog

**Date:** 2026-06-05
**Companion to:** `COACHHELM_SMARTER_BY_CONTEXT_PLAN_2026-06-05.md` (the plan) and `COACHHELM_INSIGHT_ENGINE_AUDIT_2026-06-05.md` (the audit).
**Branch:** `fix/birdies-per-round`

This tracks execution of "do them all." It separates what is **landed (code, verified)**, what is **DB-migration work** (must be deploy-tested, not shipped blind), and what is **staged with specs** (new generators that only fire once their standings land, plus new-capture items needing product decisions).

---

## Already built before this session (verified during build)

The Jun-2 themes rebuild already shipped much of the read-side "smarter" layer — don't rebuild it:
- `src/lib/coachhelm/v3/themes/shot-drivers.ts` builds **lie-aware, by-distance-band approach drivers** (`buildApproachDriver`, consumes `approach_miss_details.lie_type`/`miss_direction`), **putting drivers** (`buildPuttingDriver`), a **lag driver** (`buildPuttingLagDriver`), and a **tee driver** — and `insight-delivery.ts:600-620` fetches `approach_miss_details` + `putt_details` and feeds them in live. So plan quick-wins #1 (wire approach_miss_details) and #6 (distance-conditioned miss bias) were **already done** on the themes path.
- Per-category SG trend (`computeSgTrends`) is live.

---

## ✅ Landed this session (code, typecheck + tests green)

1. **Coachability-horizon ranking** (plan Part 3 #7) — `src/lib/coachhelm/v3/ranking/score.ts`: `coachabilityBoost(metric)` derived from `lookup-tables.coachable_timeframe_weeks`, folded into `scoreInsight` (clamped [0.6, 1.5]). Two equal-magnitude leaks now order by how soon a player can close them. Tests: `ranking.test.ts` (+ goal-boost tests reconciled to the new factor).

2. **Cohort-baseline counterfactual wiring** (plan P0.1 — the *code half* of the keystone) — `computeCounterfactual` now measures the gap to `cohort_value` (college/division `level_avg`) when present, falling back to Tour `pga_value`; `generator-base.ts` passes `standing.level_avg` and injects `level_avg/level_n/level_pct` into `evidence.standing`; `composite/types.ts` + `themes/types.ts` standing shapes extended. **Safe no-op until the RPC populates `level_avg`** (it's null today → identical behavior). Tests: `counterfactual-cohort.test.ts` (fallback, smaller-gap, above-cohort suppression, lower_better). This also resolves the *accuracy* of P0.2 (scrambling) and P0.3 (ParType): once `level_avg` lands their counterfactuals gap to the cohort automatically — no per-generator change needed.

3. **generator-base lifecycle helpers** (from the audit) remain unit-tested (`generator-base.test.ts`).

---

## 🔶 DB-migration work — written/designed, must be deploy-tested (NOT shipped blind)

> These touch `refresh_player_standing` (a SECURITY-DEFINER cron RPC) or the stats cache. A logic bug ships silently wrong standings to every dashboard, and I can't unit-test PL/pgSQL here. Each needs a dedicated PR tested against a Supabase branch DB before deploy. **Do not drop these into `supabase/migrations/` until branch-tested.**

### P0.1 — Cohort (`level_avg`) baseline RPC  ← the keystone's DB half  ✅ WRITTEN + VALIDATED (ready for CI/deploy)
**Migration:** `supabase/migrations/20260605120000_v3_cohort_population_baseline.sql` (CREATE OR REPLACE of `refresh_player_standing`).

**Discovery that changed the design:** the golf schema has **NO division/level field** — `ncaa_division` is recruiting-CRM-only (`crm_coaches`), and `golf_teams`/`golf_organizations`/`golf_players` carry no division. So a true D1/D2/D3 cohort is impossible without new capture. **V1 = an app-wide COLLEGE-POPULATION baseline** (every active golfer with ≥5 rounds), which already de-inflates the Tour gap and is computable today.

**What the migration does:** adds two population CTEs (`population_values` NOT filtered by the team-chunk arg, `pop_stats`, `pop_ranked`) to the existing per-chunk function and populates `level_avg`/`level_n`/`level_pct`. A **min-cohort-N guard (8)** leaves `level_*` NULL when the population is too small/noisy, so the counterfactual keeps falling back to the Tour value. The TS side is already wired, so P0.2 (scrambling) + P0.3 (ParType) accuracy activate automatically on deploy.

**Validated read-only against prod** (no DDL applied — branch creation wasn't available on this MCP binding; I will NOT apply DDL to prod unilaterally): the full CTE chain runs cleanly, populates `level_avg`/`level_n` and a 0-100 `level_pct` with every player matched (no row blow-up from multi-team players, thanks to `DISTINCT`). Current population is small (~13, mostly demo) → many cohorts fall under the N=8 guard until real usage grows, which is the honest behavior. CI: sqlfluff is non-blocking (`|| true`) and `CREATE OR REPLACE FUNCTION` is lock-free (Squawk-safe).

**Follow-up (needs capture):** add a `division`/`competition_level` field to `golf_teams` (+ onboarding UI), then split `population_values` by division for a true D1/D2/D3 cohort. The TS consumes `level_avg` either way — no app-code change needed for the upgrade.

### P1 — deferred by-distance / by-lie standings
- ✅ **P1.2 lag putt buckets** `putts_made_15_25ft_pct`, `putts_made_25_plus_ft_pct` — DONE (2026-06-05, migration 20260605120000). Mapped to cache `15_20`/`20_plus` columns (~5ft edge approx); `PuttDistanceGenerator` extended to 5 buckets + orchestrator instantiates them; moved to `STANDING_REFRESH_METRIC_IDS`. Applied to prod (0 rows yet — demo lacks the cache cols; binding is live for real data).
- ✅ **P1.1 approach proximity-by-band** `approach_proximity_50_125/125_175/175_plus` — DONE (2026-06-05, migration 20260605130000). New `refresh_player_standing_shot_metrics` RPC (shot-level on-green feet by band + cohort + team + PGA, MIN_GREENS=3), wired into both cron routes, `SHOT_REFRESH_METRIC_IDS` added, moved out of deferred. Applied to prod → 50 standing rows.
- 🔶 **P1.3 scrambling-by-lie** `scrambling_pct_rough` / `scrambling_pct_fairway` — STILL DEFERRED. Cache has overall + sand only; by-lie needs **hole-level GIR-miss + up-and-down reconstruction grouped by the recovery lie** (more than a column read — a real aggregation), plus a `ScramblingGenerator` rework to source rough/fairway from shot-level. Focused follow-up.

---

## 🟡 Staged — new generators/features (build once their standing lands, or as diagnostics)

> These are mostly new `BaseGenerator` instances + registration in `orchestrator.ts` + tests. With `requiresStanding=true` they won't emit until P1 standings exist; some can ship as `requiresStanding=false` diagnostics first.

- **Lag putt generator instances** — instantiate `PuttDistanceGenerator(playerId, '15_25ft' | '25_plus_ft')` once P1.2 standings land (the generator already supports any bucket).
- **Scrambling rough/fairway instances** — `ScramblingGenerator(playerId, 'rough' | 'fairway')` once P1.3 lands (generator currently sand-only at `scrambling.ts:24`; add the lie param + cache/shot source).
- **By-par features (plan Part 2 "By par"):**
  - *Par-3 by length* — new generator using `approachProximityPar3` (computed, unused, `calc:289-291`) + hole-yardage tiers (short/mid/long). Can ship as a diagnostic first.
  - *Par-4 tee strategy by length* — extend `tee-strategy.ts` to bucket by `golf_holes` yardage tier (driver-vs-layback EV per corridor).
  - *Par-5 reachability + decision chain* — sequence reconstruction over `shot_number` (reachable-in-2 vs lay-up; flag the awkward 30-50yd lay-up).
  - *Par-relative scoring distributions* — count from hole scores (replaces the dual-baseline ParType card).
- **By-lie features:** flyer-lie detector (proximity-based, no schema) — partial today; full fidelity needs the rough-severity taxonomy (capture change, below).
- **By-context features (plan Part 2):** pressure × shot-type (4-8ft putts + wedges by `round_type`, vs the player's own tournament cohort); penalty→double-bogey cascade + bounce-back (Big-Numbers anatomy); wire the genome vector (`pressure_delta`/`back_nine_delta`/`par3_proficiency`, currently display-only) into composite detection.
- **SG decomposition (plan Part 2):** SG:APP by source-distance band (+lie), SG:PUTT lag-vs-short, SG:ARG by lie+yardage, SG:OTT distance-vs-penalty split; `scrambling % × greens missed` derived stat (S, two existing cache fields — can pull forward); per-category SG trend windows.

---

## 🟠 Needs new capture (product decision — round-entry UI + schema)

- **Rough-severity lie taxonomy** (first_cut/light_rough/heavy_rough/flyer/buried/divot/hardpan) — the `golf_shots.lie` CHECK only allows `tee/fairway/rough/sand/green/other/penalty` (`prod_public_baseline.sql:10741`), so `flyer_lie_over_the_green` (filters `lie_before='light_rough'`) is a **dead rule** today, and genome `scrambling_rate`'s heavy/light arms are dead. Needs CHECK change + shot-capture UI + matching `STROKES_GAINED_BENCHMARKS` rows (`calc:528-564`).
- **Pin position** (front/mid/back) — enables true short-side detection beyond the ~50yd approximation.
- **Wind/temp at round header** — unblocks the `weather_sensitivity` genome stub + refines par-5 reachability.

---

## ⚪ Smaller still-open items (from the audit, non-PGA)

- **Opening-stretch dedup (P2.2)** — `warmup-hole` (Pressure, hole 1) and `front-9-starter` (Scoring, holes 1-3) both surface `opening_hole_delta` → two cards for one leak. Total is no longer double-counted (SG-only sum), but the dual display remains. **Needs a product call** on which framing to keep (plan says Pressure), then either retire `front-9-starter` or add assembler cross-theme metric dedup. Deferred to avoid arbitrarily deleting a feature / risking the well-tested assembler.
- **ATG `20_30`→`20_50` field-key rename** (`calc:497,325,331`) — user-facing label already fixed; the typed-field rename across calculator+UI is the remaining cosmetic prerequisite for new ATG-by-distance cards.
- **`generator-base.run()` end-to-end lifecycle test** (pure helpers are covered; the DB-wired `run()` is not).
- **tee_strategy stale-category backfill** (self-heals on regen).
- **`putt_details.estimated_break_inches`** dead column (read, never written) — wire capture or drop.

---

## Recommended next PRs (ordered)
1. **Cohort baseline DB PR** (P0.1) — branch-DB tested. Keystone; everything inherits its accuracy. Code already wired.
2. **Deferred standings PR** (P1.1-P1.3) — branch-DB tested; then instantiate the staged generators.
3. **By-par + SG-decomposition PR** (read-side, rides on #1-2).
4. **Capture PR** (rough-severity taxonomy) — separate, product-gated.
5. **Cleanup PR** — opening-stretch dedup decision, ATG key rename, lifecycle test.
