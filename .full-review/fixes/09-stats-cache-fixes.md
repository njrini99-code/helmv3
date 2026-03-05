# Fix Plan: Stats Cache Invalidation & 9/18-Hole Score Normalization

## Bug #22 (P1): Stats cache invalidation does not mark DB cache stale or trigger recalculation

### Root Cause

`invalidateOnRoundComplete()` in `src/lib/cache/golf-stats-calculator.ts` (lines 297-323) only:
1. Invalidates the Redis layer (`invalidateGolf.playerStats(playerId)`)
2. Calls SG RPCs (`recalculate_round_strokes_gained`, `update_player_stats_strokes_gained`)

It does **NOT**:
- Call `markStatsStale(playerId)` to set `is_stale = true` in the `golf_player_stats_cache` DB table
- Call `refreshStatsCache(playerId)` to trigger a full recalculation

### Impact

When a round is completed/deleted, `getStatsFromCache()` (line 228) checks `stats.isStale` to decide whether to trigger a background refresh. Since `invalidateOnRoundComplete()` never marks the DB row stale, the `isStale` flag stays `false`. After the Redis TTL expires and the cache is re-fetched from the database, the stale DB data is returned as if it were fresh.

### Flow Analysis

```
Round completed -> invalidateOnRoundComplete(playerId, roundId)
  -> invalidateGolf.playerStats(playerId)    [Redis only]
  -> recalculate_round_strokes_gained(roundId) [SG only]
  -> update_player_stats_strokes_gained(playerId) [SG only]
  -> MISSING: markStatsStale(playerId)        [DB is_stale flag]
  -> MISSING: refreshStatsCache(playerId)     [Full recalc]

Later:
  getStatsFromCache(playerId)
    -> getPlayerStatsSummary(playerId)        [Redis miss -> DB hit]
    -> stats.isStale === false                [DB was never marked stale!]
    -> returns old data without triggering refresh
```

### Fix

**File:** `src/lib/cache/golf-stats-calculator.ts`, function `invalidateOnRoundComplete` (lines 297-323)

Add `await markStatsStale(playerId)` after the Redis invalidation, and fire-and-forget `refreshStatsCache(playerId)` at the end of the function.

#### Current code (lines 297-323):

```typescript
export async function invalidateOnRoundComplete(playerId: string, roundId: string): Promise<void> {
  const supabase = await createClient();

  // 1. Invalidate the Redis layer
  await invalidateGolf.playerStats(playerId);

  // 2. Trigger strokes gained recalculation for the round (if function exists)
  // The database trigger should handle this automatically when status='completed',
  // but we call it explicitly to ensure SG is calculated for manual updates
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgRoundError } = await (supabase as any).rpc('recalculate_round_strokes_gained', { p_round_id: roundId });
    if (sgRoundError) console.error('[Stats] recalculate_round_strokes_gained failed:', roundId, sgRoundError);
  } catch (e) {
    console.error('[Stats] recalculate_round_strokes_gained threw:', roundId, e);
  }

  // 3. Update player stats cache with aggregated SG values
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgPlayerError } = await (supabase as any).rpc('update_player_stats_strokes_gained', { p_player_id: playerId });
    if (sgPlayerError) console.error('[Stats] update_player_stats_strokes_gained failed:', playerId, sgPlayerError);
  } catch (e) {
    console.error('[Stats] update_player_stats_strokes_gained threw:', playerId, e);
  }

}
```

#### Fixed code:

```typescript
export async function invalidateOnRoundComplete(playerId: string, roundId: string): Promise<void> {
  const supabase = await createClient();

  // 1. Invalidate the Redis layer
  await invalidateGolf.playerStats(playerId);

  // 2. Mark DB cache as stale so getStatsFromCache() knows to refresh
  await markStatsStale(playerId);

  // 3. Trigger strokes gained recalculation for the round (if function exists)
  // The database trigger should handle this automatically when status='completed',
  // but we call it explicitly to ensure SG is calculated for manual updates
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgRoundError } = await (supabase as any).rpc('recalculate_round_strokes_gained', { p_round_id: roundId });
    if (sgRoundError) console.error('[Stats] recalculate_round_strokes_gained failed:', roundId, sgRoundError);
  } catch (e) {
    console.error('[Stats] recalculate_round_strokes_gained threw:', roundId, e);
  }

  // 4. Update player stats cache with aggregated SG values
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgPlayerError } = await (supabase as any).rpc('update_player_stats_strokes_gained', { p_player_id: playerId });
    if (sgPlayerError) console.error('[Stats] update_player_stats_strokes_gained failed:', playerId, sgPlayerError);
  } catch (e) {
    console.error('[Stats] update_player_stats_strokes_gained threw:', playerId, e);
  }

  // 5. Trigger full stats recalculation in background (non-blocking)
  // This ensures the cache is rebuilt with the new round data
  refreshStatsCache(playerId).catch((err) => {
    console.error('[Stats] Background refreshStatsCache failed:', playerId, err);
  });
}
```

#### Exact diff for the edit:

Replace lines 297-323 in `src/lib/cache/golf-stats-calculator.ts`:

**old_string:**
```
export async function invalidateOnRoundComplete(playerId: string, roundId: string): Promise<void> {
  const supabase = await createClient();

  // 1. Invalidate the Redis layer
  await invalidateGolf.playerStats(playerId);

  // 2. Trigger strokes gained recalculation for the round (if function exists)
```

**new_string:**
```
export async function invalidateOnRoundComplete(playerId: string, roundId: string): Promise<void> {
  const supabase = await createClient();

  // 1. Invalidate the Redis layer
  await invalidateGolf.playerStats(playerId);

  // 2. Mark DB cache as stale so getStatsFromCache() knows to refresh
  await markStatsStale(playerId);

  // 3. Trigger strokes gained recalculation for the round (if function exists)
```

Then replace the comment numbering and add the trailing call:

**old_string:**
```
  // 3. Update player stats cache with aggregated SG values
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgPlayerError } = await (supabase as any).rpc('update_player_stats_strokes_gained', { p_player_id: playerId });
    if (sgPlayerError) console.error('[Stats] update_player_stats_strokes_gained failed:', playerId, sgPlayerError);
  } catch (e) {
    console.error('[Stats] update_player_stats_strokes_gained threw:', playerId, e);
  }

}
```

**new_string:**
```
  // 4. Update player stats cache with aggregated SG values
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgPlayerError } = await (supabase as any).rpc('update_player_stats_strokes_gained', { p_player_id: playerId });
    if (sgPlayerError) console.error('[Stats] update_player_stats_strokes_gained failed:', playerId, sgPlayerError);
  } catch (e) {
    console.error('[Stats] update_player_stats_strokes_gained threw:', playerId, e);
  }

  // 5. Trigger full stats recalculation in background (non-blocking)
  // This ensures the cache is rebuilt with the new round data
  refreshStatsCache(playerId).catch((err) => {
    console.error('[Stats] Background refreshStatsCache failed:', playerId, err);
  });
}
```

### Why this is safe

- `markStatsStale()` already exists and is used elsewhere. It sets `is_stale = true` on the DB row and invalidates Redis. The Redis invalidation is idempotent with the one already called above.
- `refreshStatsCache()` is fire-and-forget (non-blocking). If it fails, `getStatsFromCache()` will still see `isStale = true` and retry the refresh on the next read.
- The `supabase` variable created at line 298 is still used by the SG RPCs; the new calls use their own internal clients.

---

## Bug #23 (P1): 9-hole and 18-hole scores averaged without normalization

### Root Cause

In `src/app/golf/actions/stats-data.ts`, the `getStatsSummary()` function (lines 282-325):

1. **`scoringAverage`** (lines 310-311): Averages raw `total_score` values across all rounds. A 9-hole score of 38 is averaged directly with 18-hole scores of 74-80, dragging the average down incorrectly.

2. **`bestRound`** (line 313): Uses `Math.min(...scores)` on raw scores. A 9-hole score of 35 would appear as the "best round" even though it's only half a round.

3. **`worstRound`** (line 314): Uses `Math.max(...scores)` on raw scores. This is less impacted (18-hole scores are inherently higher) but is still conceptually wrong when comparing across different round lengths.

### Data Availability

The `golf_rounds` table has a `holes_played` column (`number | null`) that is set during round creation:
- `golf.ts` line 805: `holes_played: data.holes.length`
- `golf.ts` line 1116: `holes_played: validatedData.holes.length`
- `golf.ts` line 2809: `holes_played: data.holesToPlay || 18`

The query in `getStatsSummary()` already selects `holes_played` (line 240) and uses it for `holesPlayed` total (line 309):
```typescript
holesPlayed: filteredRounds.reduce((sum, r) => sum + (r.holes_played ?? 18), 0),
```

But `scoringAverage`, `bestRound`, and `worstRound` ignore it completely.

### Fix Strategy

**Approach: Compute per-hole scoring average and normalize best/worst to 18-hole equivalents.**

This is the most robust approach because:
- It correctly weights 9-hole and 18-hole rounds
- It doesn't discard 9-hole data (which would lose information)
- The per-hole average is the most statistically meaningful metric
- Best/worst are normalized to 18-hole equivalent so they remain comparable

The `puttsPerRound` calculation (line 321-322) also needs normalization since a 9-hole round will have roughly half the putts of an 18-hole round. We should normalize this to a per-18-hole equivalent as well.

### Fix

**File:** `src/app/golf/actions/stats-data.ts`, lines 282-325

#### Current code (lines 282-325):

```typescript
  // Calculate summary stats from filtered rounds
  const scores = filteredRounds.map(r => r.total_score).filter((s): s is number => s !== null);
  const roundsPlayed = scores.length;

  // Calculate aggregates
  let totalFairwaysHit = 0;
  let totalFairwayOpp = 0;
  let totalGir = 0;
  let totalGirOpp = 0;
  let totalPutts = 0;

  for (const round of filteredRounds) {
    if (round.total_fairways_hit !== null && round.total_fairways !== null) {
      totalFairwaysHit += round.total_fairways_hit;
      totalFairwayOpp += round.total_fairways;
    }
    if (round.total_gir !== null && round.total_gir_possible !== null) {
      totalGir += round.total_gir;
      totalGirOpp += round.total_gir_possible;
    }
    if (round.total_putts !== null) {
      totalPutts += round.total_putts;
    }
  }

  const summary: StatsSummary = {
    roundsPlayed,
    holesPlayed: filteredRounds.reduce((sum, r) => sum + (r.holes_played ?? 18), 0),
    scoringAverage: scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null,
    bestRound: scores.length > 0 ? Math.min(...scores) : null,
    worstRound: scores.length > 0 ? Math.max(...scores) : null,
    girPercentage: totalGirOpp > 0
      ? Math.round((totalGir / totalGirOpp) * 1000) / 10
      : null,
    fairwayPercentage: totalFairwayOpp > 0
      ? Math.round((totalFairwaysHit / totalFairwayOpp) * 1000) / 10
      : null,
    puttsPerRound: roundsPlayed > 0
      ? Math.round((totalPutts / roundsPlayed) * 10) / 10
      : null,
    scramblingPercentage: null, // Scrambling data not available in summary view
  };
```

#### Fixed code:

```typescript
  // Calculate summary stats from filtered rounds
  // Build score data with holes_played for normalization
  const roundScores = filteredRounds
    .filter((r): r is typeof r & { total_score: number } => r.total_score !== null)
    .map(r => ({
      score: r.total_score,
      holesPlayed: r.holes_played ?? 18,
    }));
  const roundsPlayed = roundScores.length;

  // Calculate aggregates
  let totalFairwaysHit = 0;
  let totalFairwayOpp = 0;
  let totalGir = 0;
  let totalGirOpp = 0;
  let totalPutts = 0;
  let totalPuttsHoles = 0;

  for (const round of filteredRounds) {
    if (round.total_fairways_hit !== null && round.total_fairways !== null) {
      totalFairwaysHit += round.total_fairways_hit;
      totalFairwayOpp += round.total_fairways;
    }
    if (round.total_gir !== null && round.total_gir_possible !== null) {
      totalGir += round.total_gir;
      totalGirOpp += round.total_gir_possible;
    }
    if (round.total_putts !== null) {
      totalPutts += round.total_putts;
      totalPuttsHoles += (round.holes_played ?? 18);
    }
  }

  // Compute per-hole scoring average, then express as 18-hole equivalent
  // This correctly handles mixed 9-hole and 18-hole rounds
  let scoringAverage: number | null = null;
  if (roundScores.length > 0) {
    const totalHolesScored = roundScores.reduce((sum, r) => sum + r.holesPlayed, 0);
    const totalStrokes = roundScores.reduce((sum, r) => sum + r.score, 0);
    const perHoleAvg = totalStrokes / totalHolesScored;
    scoringAverage = Math.round(perHoleAvg * 18 * 100) / 100;
  }

  // For best/worst round, normalize to 18-hole equivalent
  // A 9-hole score of 38 becomes 38 * (18/9) = 76
  let bestRound: number | null = null;
  let worstRound: number | null = null;
  if (roundScores.length > 0) {
    const normalized = roundScores.map(r => Math.round(r.score * (18 / r.holesPlayed)));
    bestRound = Math.min(...normalized);
    worstRound = Math.max(...normalized);
  }

  const summary: StatsSummary = {
    roundsPlayed,
    holesPlayed: filteredRounds.reduce((sum, r) => sum + (r.holes_played ?? 18), 0),
    scoringAverage,
    bestRound,
    worstRound,
    girPercentage: totalGirOpp > 0
      ? Math.round((totalGir / totalGirOpp) * 1000) / 10
      : null,
    fairwayPercentage: totalFairwayOpp > 0
      ? Math.round((totalFairwaysHit / totalFairwayOpp) * 1000) / 10
      : null,
    // Normalize putts to per-18-holes to handle mixed 9/18-hole rounds
    puttsPerRound: totalPuttsHoles > 0
      ? Math.round((totalPutts / totalPuttsHoles) * 18 * 10) / 10
      : null,
    scramblingPercentage: null, // Scrambling data not available in summary view
  };
```

### Exact edit operations

**Edit 1** - Replace score extraction and add `totalPuttsHoles`:

**old_string:**
```
  // Calculate summary stats from filtered rounds
  const scores = filteredRounds.map(r => r.total_score).filter((s): s is number => s !== null);
  const roundsPlayed = scores.length;

  // Calculate aggregates
  let totalFairwaysHit = 0;
  let totalFairwayOpp = 0;
  let totalGir = 0;
  let totalGirOpp = 0;
  let totalPutts = 0;

  for (const round of filteredRounds) {
    if (round.total_fairways_hit !== null && round.total_fairways !== null) {
      totalFairwaysHit += round.total_fairways_hit;
      totalFairwayOpp += round.total_fairways;
    }
    if (round.total_gir !== null && round.total_gir_possible !== null) {
      totalGir += round.total_gir;
      totalGirOpp += round.total_gir_possible;
    }
    if (round.total_putts !== null) {
      totalPutts += round.total_putts;
    }
  }
```

**new_string:**
```
  // Calculate summary stats from filtered rounds
  // Build score data with holes_played for normalization
  const roundScores = filteredRounds
    .filter((r): r is typeof r & { total_score: number } => r.total_score !== null)
    .map(r => ({
      score: r.total_score,
      holesPlayed: r.holes_played ?? 18,
    }));
  const roundsPlayed = roundScores.length;

  // Calculate aggregates
  let totalFairwaysHit = 0;
  let totalFairwayOpp = 0;
  let totalGir = 0;
  let totalGirOpp = 0;
  let totalPutts = 0;
  let totalPuttsHoles = 0;

  for (const round of filteredRounds) {
    if (round.total_fairways_hit !== null && round.total_fairways !== null) {
      totalFairwaysHit += round.total_fairways_hit;
      totalFairwayOpp += round.total_fairways;
    }
    if (round.total_gir !== null && round.total_gir_possible !== null) {
      totalGir += round.total_gir;
      totalGirOpp += round.total_gir_possible;
    }
    if (round.total_putts !== null) {
      totalPutts += round.total_putts;
      totalPuttsHoles += (round.holes_played ?? 18);
    }
  }
```

**Edit 2** - Replace the summary object construction:

**old_string:**
```
  const summary: StatsSummary = {
    roundsPlayed,
    holesPlayed: filteredRounds.reduce((sum, r) => sum + (r.holes_played ?? 18), 0),
    scoringAverage: scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null,
    bestRound: scores.length > 0 ? Math.min(...scores) : null,
    worstRound: scores.length > 0 ? Math.max(...scores) : null,
    girPercentage: totalGirOpp > 0
      ? Math.round((totalGir / totalGirOpp) * 1000) / 10
      : null,
    fairwayPercentage: totalFairwayOpp > 0
      ? Math.round((totalFairwaysHit / totalFairwayOpp) * 1000) / 10
      : null,
    puttsPerRound: roundsPlayed > 0
      ? Math.round((totalPutts / roundsPlayed) * 10) / 10
      : null,
    scramblingPercentage: null, // Scrambling data not available in summary view
  };
```

**new_string:**
```
  // Compute per-hole scoring average, then express as 18-hole equivalent
  // This correctly handles mixed 9-hole and 18-hole rounds
  let scoringAverage: number | null = null;
  if (roundScores.length > 0) {
    const totalHolesScored = roundScores.reduce((sum, r) => sum + r.holesPlayed, 0);
    const totalStrokes = roundScores.reduce((sum, r) => sum + r.score, 0);
    const perHoleAvg = totalStrokes / totalHolesScored;
    scoringAverage = Math.round(perHoleAvg * 18 * 100) / 100;
  }

  // For best/worst round, normalize to 18-hole equivalent
  // A 9-hole score of 38 becomes 38 * (18/9) = 76
  let bestRound: number | null = null;
  let worstRound: number | null = null;
  if (roundScores.length > 0) {
    const normalized = roundScores.map(r => Math.round(r.score * (18 / r.holesPlayed)));
    bestRound = Math.min(...normalized);
    worstRound = Math.max(...normalized);
  }

  const summary: StatsSummary = {
    roundsPlayed,
    holesPlayed: filteredRounds.reduce((sum, r) => sum + (r.holes_played ?? 18), 0),
    scoringAverage,
    bestRound,
    worstRound,
    girPercentage: totalGirOpp > 0
      ? Math.round((totalGir / totalGirOpp) * 1000) / 10
      : null,
    fairwayPercentage: totalFairwayOpp > 0
      ? Math.round((totalFairwaysHit / totalFairwayOpp) * 1000) / 10
      : null,
    // Normalize putts to per-18-holes to handle mixed 9/18-hole rounds
    puttsPerRound: totalPuttsHoles > 0
      ? Math.round((totalPutts / totalPuttsHoles) * 18 * 10) / 10
      : null,
    scramblingPercentage: null, // Scrambling data not available in summary view
  };
```

### Correctness Verification

**Scoring average example:**
- Round 1: 18 holes, score 74
- Round 2: 9 holes, score 38
- Old: `(74 + 38) / 2 = 56.0` (WRONG)
- New: total strokes = 112, total holes = 27, per-hole = 4.148, x18 = `74.67` (CORRECT)

**Best round example:**
- Round 1: 18 holes, score 74
- Round 2: 9 holes, score 35
- Old: `Math.min(74, 35) = 35` (WRONG -- 35 is a 9-hole score)
- New: normalize 35 to `35 * (18/9) = 70`, then `Math.min(74, 70) = 70` (CORRECT)

**Putts per round example:**
- Round 1: 18 holes, 30 putts
- Round 2: 9 holes, 14 putts
- Old: `(30 + 14) / 2 = 22.0` (WRONG -- drags average down)
- New: per-hole putts = `44 / 27 = 1.630`, x18 = `29.3` (CORRECT)

### Why GIR% and Fairway% do NOT need this fix

GIR and fairway stats are computed as ratios (`totalGir / totalGirOpp`, `totalFairwaysHit / totalFairwayOpp`). The denominators (`total_gir_possible`, `total_fairways`) already reflect the actual number of holes/opportunities in each round. A 9-hole round with 5/9 GIR and an 18-hole round with 10/18 GIR correctly average to `15/27 = 55.6%`. No normalization needed.

### Additional affected locations (out of scope but noted)

The same 9/18-hole mixing bug exists in these locations but is lower priority and not in the assigned scope:

1. **`getTrendAnalysis()`** (same file, line 636): `calculateRollingAvg()` operates on raw `r.score` values. Trend charts would show 9-hole scores as artificially low points. A future fix should normalize scores in the `rounds` data before computing rolling averages.

2. **`getCourseBreakdown()`** (same file, line 1074): Same pattern -- `scores.reduce((a, b) => a + b, 0) / scores.length` and `Math.min(...scores)` on raw scores without normalization.

3. **`getTeamComparison()`** (same file, line 870): Same pattern for team-wide stats.

4. **`calculatePeriodStats()`** (same file, line 700): Helper used by `getTrendAnalysis()` for 30-day comparisons.

These are all lower severity since trend analysis and course breakdowns are secondary views, but should be addressed in a follow-up pass.

---

## Files Modified

| File | Lines | Change |
|------|-------|--------|
| `src/lib/cache/golf-stats-calculator.ts` | 297-323 | Add `markStatsStale()` call and non-blocking `refreshStatsCache()` call to `invalidateOnRoundComplete()` |
| `src/app/golf/actions/stats-data.ts` | 282-325 | Normalize 9-hole scores to 18-hole equivalents for `scoringAverage`, `bestRound`, `worstRound`, and `puttsPerRound` |

## Testing Plan

### Bug #22 tests:
1. Complete a new round and verify `golf_player_stats_cache.is_stale` is set to `true` immediately after
2. Verify that within a few seconds, `is_stale` returns to `false` (background refresh completed)
3. Verify `getStatsFromCache()` returns updated data reflecting the new round
4. Delete a round and verify the same invalidation/refresh cycle occurs

### Bug #23 tests:
1. Create a player with only 18-hole rounds (e.g., scores 72, 74, 76). Verify `scoringAverage = 74.0`, `bestRound = 72`, `worstRound = 76`
2. Add a 9-hole round with score 38 (4.22 per hole). Verify `scoringAverage` is approximately `74.67` (not `65.0`)
3. Add a 9-hole round with score 35. Verify `bestRound` shows `70` (normalized), not `35`
4. Verify `puttsPerRound` is normalized correctly for mixed 9/18-hole datasets
5. Verify GIR% and fairway% remain unchanged (they use ratio-based aggregation)
