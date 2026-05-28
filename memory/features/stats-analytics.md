# Feature: Stats And Analytics

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
- `src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx`
- `src/app/golf/(dashboard)/dashboard/stats/team/team-stats-table.tsx`

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
  -> attempt non-critical SG recalculation RPCs
  -> next stats read refreshes cache lazily
  -> player stats, team stats, roster profile, CoachHelm reads consume cache/source data
```

## Business Rules

- Round and shot data remain the source of truth; cached stats are derived.
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
