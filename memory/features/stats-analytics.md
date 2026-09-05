# Feature: Stats And Analytics

<!-- schema-drift-banner -->
> **⚠️ 1 identifier named below does not exist in the database.**
> Verified 2026-08-19 against production. `golf_putting_tendencies`
>
> It is described here as if live. Do not query, type, or build on it —
> check `src/lib/types/database.ts` (or `memory/glossary.md`'s AUTOGEN blocks)
> before trusting any table name in this file. Tracked in
> `.doc-schema-baseline.json`; `npm run docs:schema-drift` fails on new ones.
> Removing this is a ratchet-down — re-run
> `node scripts/check-doc-schema-drift.mjs --update` after.

## Status

- active

## Current State

Stats and analytics aggregate round and shot data into player, team, and profile surfaces. They power GolfHelm stats pages, coach roster views, CoachHelm pattern mining, and development planning.

The current architecture uses cached stats for performance. Cache invalidation marks player stats stale after round completion, and refresh happens lazily on read.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/stats/page.tsx`
- `src/app/golf/(dashboard)/dashboard/stats/team/page.tsx`
- Roster player profile stats surfaces under `src/app/golf/(dashboard)/dashboard/roster/**`

### Components

- `src/components/golf/stats/**`
- `src/components/golf/stats/sections/**`
- `src/app/golf/(dashboard)/dashboard/stats/page.tsx`
- `src/app/golf/(dashboard)/dashboard/stats/team/page.tsx`

### Actions And Services

- `src/app/golf/actions/stats.ts`
- `src/app/golf/actions/stats-data.ts`
- `src/app/golf/actions/stats-data-types.ts`
- `src/app/golf/actions/stats-intelligence.ts`
- `src/app/golf/actions/player-profile-stats.ts`
- `src/lib/cache/golf-stats-calculator.ts`
- `src/lib/coachhelm/v2/stats/**`

## Core Data

- `golf_player_stats_cache`
- `golf_round_stats_cache`
- `golf_putting_tendencies`
- Source data from `golf_rounds`, `golf_holes`, and `golf_shots`.

## Data Flow

```txt
Round completion
  -> invalidateOnRoundComplete()
  -> mark golf_player_stats_cache stale
  -> trusted SG recalculation refreshes only derived strokes-gained columns
  -> next stats read refreshes cache lazily
  -> player stats, team stats, roster profile, CoachHelm reads consume cache/source data
```

## Business Rules

- Round and shot data remain the source of truth; cached stats are derived.
- `recalculate_round_strokes_gained` is the protected derived-write path for
  completed rounds. It may change only the five stored strokes-gained fields;
  it must never require a general exception to completed-round immutability.
- A completed round's score, identity, status, holes, and shots are immutable;
  only the server-side strokes-gained recalculation may refresh its five derived
  strokes-gained columns.
- Stats shown to coaches must be scoped to their team/player access.
- Player stats pages should show only the authenticated player's allowed data.
- Strokes-gained and putting tendency gaps should be called out rather than silently treated as complete.
- Team analytics should not mix players across teams or organizations.
- CoachHelm can consume stats but should not own stat calculation truth.

## UI Contract

- Stats pages should clearly separate scoring, driving, approach, putting, scrambling, strokes-gained, and analysis sections.
- Empty states should distinguish no rounds from no detailed shot data.
- Loading states should use skeletons and keep chart/table dimensions stable.
- Mobile stats views should be dense and scannable; avoid oversized decorative panels.
- Export/share actions must not imply metrics exist when source data is absent.

## Known Risk Areas

- Strokes-gained columns exist but are generally null.
- `golf_putting_tendencies` has schema/RLS but no active app write path.
- Lazy-refresh cache behavior can surprise agents expecting stats to update synchronously.
- Some stat calculations rely on detailed shot data; rounds without shot detail need explicit fallback behavior.
- **`golf_shots.distance_unit` is legacy — always `'yards'`, even for putts.
  `distance_unit_before` is the correct unit column** (`'feet'` for putts,
  `'yards'` otherwise); `putt_distance_feet` stores putt distance in feet.
  `golf-stats-calculator-shots.ts` already reads `distance_unit_before`
  correctly. CoachHelm insight generation enforces minimum-sample floors below
  which an insight must not fire: short putt (0-3ft) needs 10 first putts;
  break-type weakness needs 15 putts per break type AND 8 per distance bucket;
  GIR-by-lie gap needs 20 approach attempts from each lie; root-cause chains
  need 20 fairway + 15 rough approach samples. Owning files: the stats
  calculator (`src/lib/utils/golf-stats-calculator-shots.ts`), the insight
  generator (`src/lib/coachhelm/v2/mining/stats-insight-generator.ts`), the
  orchestrator (`src/lib/coachhelm/v2/orchestrator.ts`), and the two actions
  (`src/app/golf/actions/stats-data.ts`,
  `src/app/golf/actions/shot-analytics.ts`). (STU, source:
  `golf-shot-schema-and-insight-thresholds.md` dated 2026-08-17; verified
  2026-09-05 against `src/lib/types/database.ts` — `golf_shots.distance_unit`,
  `.distance_unit_before` and `.putt_distance_feet` all present — and the five
  files above, all present.)
- **`GolfStats`'s rate fields are null-honest; its raw integer counters are
  not.** Rates (`safePercent`/`safeAverage`) return `null` on a zero
  denominator. Raw counters (`totalBirdies`, `totalPars`, `totalPutts`,
  `threePuttsTotal`, `onePuttsTotal`, `totalPenalties`, `girTotal`,
  `fairwaysHit`, `scrambleAttempts`, …) are plain numbers initialised to 0, so
  0 means both "none happened" and "nothing was logged" — rendering one
  directly for a scorecard-only round (no shot detail) fabricates a zero.
  Gate each counter on something having actually been observed
  (`holesPlayed > 0` for scoring, `totalPutts > 0` for putting) before
  rendering it; `holesPlayed` comes from hole rows, not shots, so it is the
  wrong gate for anything shot-derived. (STU, source:
  `golfstats-raw-counters-fabricate-zeros.md` dated 2026-08-17.)
- **The naive level-vs-downhill putting gap is a distance confound, not a
  slope effect.** Level putts average far shorter than downhill putts in this
  data, so the roster-wide make-rate gap is mostly explained by distance. A
  real, smaller slope effect survives once you control for a distance bucket
  (largest inside 3ft), but it fires for essentially every player, so
  per-player "downhill is your weakness" is only an insight when compared
  against the squad's own spread, never against zero. Any putting insight
  built on the unbucketed split repeats the "basic, not root" mistake.
  (STU, source: `putt-slope-gap-is-a-distance-confound.md` dated 2026-08-18,
  re-verified in source 2026-08-18.)
- **A lookup table or threshold in the CoachHelm insight engine is only as
  good as the distribution it was checked against.** Constants authored
  against an *expected* shape of the data — a metric-name key list, a
  proximity-in-feet gate — can go green in CI forever if the tests share the
  same imagined vocabulary, while the rule silently never fires (or fires
  backwards) in production. Before trusting a threshold or key list under
  `src/lib/coachhelm/`, query the live distribution it selects on
  (`select evidence->>'metric', count(*) from golf_coach_insights group by 1`
  takes seconds) and prefer keying on a closed, populated vocabulary —
  `golf_coach_insights.category` is non-null and maps 1:1 onto
  strokes-gained families, `evidence.metric` is dozens of free-form strings
  and drifts. When a fix changes what a value MEANS (a unit conversion, a
  bug in the underlying measurement), re-derive every constant compared
  against it — a threshold calibrated against the old, wrong values can
  silently stop matching anything once the measurement is corrected, and
  nothing fails loudly. (STU, source:
  `lookup-tables-calibrated-against-imagined-values.md` dated 2026-08-17 and
  `thresholds-outlive-the-bug-they-calibrated-against.md` dated 2026-08-16;
  verified 2026-09-05 that `golf_coach_insights.category` exists in
  `src/lib/types/database.ts`.)
- **`pga-standards.ts` (gender-aware LPGA/PGA tour benchmarks, migration-backed)
  had zero production callers** as of the source note — the live pipeline read
  `cohort-baselines.ts` instead, a smaller hardcoded 12-metric estimate table,
  so women's teams were shown approximated benchmarks while real measured LPGA
  data sat unused. The gap was wiring, not missing domain modelling — SG
  computation, leak-map benchmarks and multi-level tour comparisons already
  exist. Re-verify before relying on this: unverified since 2026-08-15. (STU,
  source: `lpga-standards-loader-is-unwired.md`; verified 2026-09-05 only that
  `src/lib/coachhelm/v3/standing/pga-standards.ts` exists and that the
  hardcoded table lives at `src/lib/coachhelm/v3/counterfactual/cohort-baselines.ts`
  — not that the wiring gap itself still holds.)

## Tests To Prefer

- `src/app/golf/actions/__tests__/stats-data.test.ts`
- `src/test/coachhelm/v2/stats/**`
- `src/test/coachhelm/v2/shot-analysis/**`
- Browser check for changed stats pages and mobile table/chart behavior.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/features/SHOT_TRACKING_DATA_FLOW.md`
- `docs/features/SHOT_TRACKING_VERIFICATION.md`
- `docs/v3-research-golf-domain.md`
