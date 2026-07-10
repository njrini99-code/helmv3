<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Self-declared: render-only wins #1 (putts/hole) and #4 (scrambling toggle) are already SHIPPED separately. Only the still-unshipped line items in this doc remain an active plan; the shipped items are historical.
KEPT FOR HISTORY -- do not delete this file.
-->

# Fairway Comprehensive Stats — Redesign Plan

_Status: PLAN — awaiting approval before engine edits. Drafted 2026-06-01._
_Render-only wins #1 (putts/hole) + #4 (scrambling toggle) already SHIPPED separately._

## Goal (from Codex thread + partner list)

Rebuild the Fairway comprehensive stats so both roles get the FULL legacy stat set,
better organized and more premium than legacy:

- **Coach:** a key-stats + trends **overview**, then click a player → **drill into that
  player's full stats page** (the same surface the player sees).
- **Player:** all legacy stats, organized by category, with high-level visuals — spray
  charts, putting heatmap, GIR-by-distance + scrambling conversion boards, and miss
  tendencies by range (e.g. "from 50–75 yds, misses short 60%").
- Brand: helm-green contrast, by-category navigation, trend indicators, premium feel,
  honest empties (em-dash, never fabricated).

The player's own surface is **FairwayStatsCockpit** (via FairwayPlayerStats). The coach
drill-in reuses the same cockpit body. The roster **FairwayStatsTabs** is the lighter
coach-side variant.

## What's ALREADY done (shipped this session, render-only)

1. **Putts per hole** — `puttsPerHole` field existed + calculated; now displayed beside
   Putts/round in the cockpit.
4. **Scrambling toggle (lie ↔ distance)** — both cuts already rendered statically; now a
   single toggled view (By lie: Fairway/Rough/Sand · By distance: 0–10/10–20/20–30 ft),
   reusing the existing `ToggleChip`.

## The 4 partner items that need ENGINE work — and exactly how hard

GOOD NEWS: the raw per-hole data for ALL of these is ALREADY captured in
`golf-stats-calculator-shots.ts` (`usedDriver`, `driveMissDirection`,
`firstPuttDistance`, `approachDistance`, `approachMissDirection`, lie/distance). So these
are **aggregation additions** (new summary fields computed from existing per-shot data),
NOT new shot-tracking. Risk is moderate, not high — but it IS the shared engine
(legacy + Fairway both read `GolfStats`), so additive-only, no changes to existing fields.

| # | Stat | New `GolfStats` field(s) | Source data (exists) | Calc |
|---|------|--------------------------|----------------------|------|
| 2 | Putting approach distance — total avg | `firstPuttDistanceAvg` | per-hole `firstPuttDistance` (`:659`) | average over holes w/ a first putt |
| 3 | Putting approach distance — by band | `firstPuttDistanceBand{0_10,10_20,...}` or reuse putt buckets | same | bucket the same per-hole values |
| 5 | Driving distance — Non-Driver | `drivingDistanceNonDriverOnly` | tee `shot_distance` + `usedDriver=false` (`:749`,`:648`) | new accumulator beside driver-only (`:1467`) |
| 6 | Miss L/R by Driver/Non-Driver | `missLeftPctDriver/NonDriver`, `missRightPctDriver/NonDriver` (4 fields) | `driveMissDirection` + `usedDriver` per hole (`:747-750`) | split the existing miss accumulator by `usedDriver` |

All additive: new optional fields default null; existing legacy display untouched
(legacy simply won't read the new fields). Engine has no DB migration — these compute
from already-stored `golf_shots`/`golf_holes`. `engine_version` bump optional.

## The premium-visuals layer (Codex vision — bigger, the "redo")

These are the high-value visual upgrades, built with Fairway primitives:

- **GIR by distance + miss tendency** — per distance band (50–75, 75–100, …): GIR%
  conversion bar + the dominant miss direction for that band ("Short 60%"). Miss-by-band
  needs a small engine add: bucket `approachMissDirection` by `approachDistance` band
  (data exists at `:653`,`:656`; existing aggregate `approachMissShort/Long/Left/Right`
  at `:182-190` is currently overall-only). NEW field: `approachMissByBand[band] = {short,long,left,right}`.
- **Scrambling conversion boards** — visual conversion (not plain rows) by lie + recovery
  distance. Data exists; this is a visual upgrade of the toggle shipped in #4.
- **Driving spray chart** — needs `getSprayChartData` (already an action; legacy
  DispersionStats uses it). Thread it into the cockpit's data fetch. Render as a premium
  point-cloud / directional dispersion in Fairway style.
- **Putting heatmap** — legacy `PuttHeatmap` reads raw `golf_shots`; thread that fetch in,
  re-skin the heatmap to Fairway (green ramp, matte).
- **Approach miss map** — short/long/left/right + corner misses as a premium target map.

## Coach overview + drill-in (Codex vision)

- **Coach team stats** (`FairwayTeamStats`): premium summary band (team SG, key trends) +
  player cards that are clear **drill-in** links → the player's full stats page (the
  cockpit). Mostly already has the data; needs the summary band + clarified drill-in CTA.
- **Drill-in** = render the SAME `FairwayStatsCockpit` body under a roster identity header
  (already the architecture). Ensure the coach path passes the selected `playerId`.

## Proposed phasing (each phase = its own verify + deploy)

- **Phase A (engine, additive):** add fields #2,#3,#5,#6 + `approachMissByBand` to
  `golf-stats-calculator-shots.ts`. Pure aggregation from existing per-hole data. Unit-
  verify a couple of values against a known player. tsc + full `next build`.
- **Phase B (cockpit render):** render #2,#3,#5,#6 + GIR-by-distance-with-miss +
  scrambling conversion boards, organized by category with the existing tab nav. Honest
  guards throughout.
- **Phase C (premium viz):** thread `getSprayChartData` + putting-heatmap raw fetch into
  the cockpit; build Fairway spray chart, putting heatmap, approach miss map.
- **Phase D (coach):** team summary band + drill-in polish on `FairwayTeamStats`.

## Risk + guardrails

- Engine edits are ADDITIVE ONLY — no existing field changed, legacy display unaffected.
- No DB migration; all new stats compute from already-stored shots/holes.
- Honest data: any new stat null-guards to em-dash / "awaiting"; never fabricated.
- Each phase gated on tsc 0 + full `next build` green (CI gate) before deploy.
- Spray/heatmap (Phase C) add data fetches to the cockpit `loadAll` — the only non-additive
  plumbing; isolate + verify perf (the Signals scroll-perf lesson: no per-row heavy viz).

## Recommendation

Phase A + B together is the meat of the partner's list and is low-moderate risk (additive
engine aggregation + render). Phase C (spray/heatmap) is the premium "wow" but heavier
(new fetches, custom viz) — worth its own focused pass. Phase D is small.
