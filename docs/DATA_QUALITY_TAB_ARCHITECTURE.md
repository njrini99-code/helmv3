# Data Quality Tab -- Complete Architecture Design

> **Scope**: Upgrade the admin tracer's Data Quality tab from a basic 2-check outlier panel into the master diagnostic for stats accuracy across the entire platform.
>
> **Constraint**: No new database tables. Backward-compatible `TracerData` interface. Server actions for data, client-side for presentation. Glassmorphism/editorial aesthetic.

---

## Table of Contents

1. [Current State Summary](#1-current-state-summary)
2. [New Type System](#2-new-type-system)
3. [Backend Architecture](#3-backend-architecture)
4. [Frontend Architecture -- Diagnostic Engine](#4-frontend-architecture--diagnostic-engine)
5. [Frontend Architecture -- Component Design](#5-frontend-architecture--component-design)
6. [Auto-Fix System](#6-auto-fix-system)
7. [Per-Player Quality Score](#7-per-player-quality-score)
8. [Cross-Cutting Concerns](#8-cross-cutting-concerns)
9. [Implementation Phases](#9-implementation-phases)
10. [File Change Manifest](#10-file-change-manifest)

---

## 1. Current State Summary

### What exists today

| Layer | File | Responsibility |
|-------|------|----------------|
| Server action | `src/app/golf/actions/admin-tracer-data.ts` | `getTracerData()` fetches players, rounds, stats accuracy (cached vs live), error logs. `getTracerRoundDiagnostic(roundId)` lazy-loads per-hole/per-shot data for a single round. |
| Client utils | `src/app/golf/admin/components/tracer/tracer-utils.ts` | `detectOutliers()` runs 2 checks: score > 120, shots > 150. `computeCompleteness()` builds a per-player heatmap. `computeHealthScore()` gives a weighted composite. `generateAlerts()` creates global alerts. |
| Types | `src/app/golf/admin/components/tracer/tracer-types.ts` | `Outlier` (player, round, field, value, threshold). `PlayerCompleteness` (6 categories as percentages). `TracerAlert` (severity, title, detail). |
| UI component | `src/app/golf/admin/components/tracer/TracerDataQuality.tsx` | Three glass-card sections: Stats Accuracy table (sortable, cached/live comparison), Data Completeness heatmap (`DataCompletenessGrid`), Outlier Detection panel (simple table). |

### What is missing

1. Only 2 outlier checks -- need 15+.
2. No detection of completed rounds with null/zero putts, fairways, GIR, or strokes gained.
3. No root-cause tracing: when cached stats diverge from live, no way to see WHICH rounds caused it.
4. No auto-fix actions (recalculate round totals from hole data, refresh stats cache).
5. No per-player data quality score.
6. No severity classification (critical/warning/info) on individual issues.
7. No filtering or grouping of issues by type, player, round, or severity.

---

## 2. New Type System

All new types go in **`src/app/golf/admin/components/tracer/tracer-types.ts`** to keep the single source of truth. Existing types remain untouched for backward compatibility.

### 2.1 `DataQualityIssue` -- The Core Diagnostic Unit

Every diagnostic check produces zero or more `DataQualityIssue` objects. This is the universal currency of the system.

```typescript
// ============================================================================
// DATA QUALITY ISSUE -- The universal diagnostic result
// ============================================================================

export type IssueSeverity = 'critical' | 'warning' | 'info';

export type IssueCategory =
  | 'missing_data'       // null/zero fields that should have values
  | 'outlier'            // values outside statistical thresholds
  | 'integrity'          // hole data vs round totals mismatch
  | 'cache_divergence'   // cached stats != live-computed stats
  | 'completeness'       // incomplete round data (missing holes, shots)
  | 'stuck_round';       // in_progress for too long

export interface DataQualityIssue {
  /** Stable unique ID for React keys and dedup: `${checkId}-${round_id || player_id}` */
  id: string;

  /** Which diagnostic check produced this issue */
  checkId: string;

  /** Human-readable short title, e.g. "Missing Putts Data" */
  title: string;

  /** Detailed explanation for the admin */
  description: string;

  /** Triage priority */
  severity: IssueSeverity;

  /** Grouping bucket */
  category: IssueCategory;

  /** Affected player (always present) */
  player_id: string;
  player_name: string;

  /** Affected round (null for player-level issues like cache staleness) */
  round_id: string | null;
  course_name: string | null;
  round_date: string | null;

  /** The problematic value and what was expected */
  actual_value: string | number | null;
  expected_value: string | number | null;

  /** Can this be auto-fixed? Determines whether the Fix button appears */
  fixable: boolean;

  /** Which fix action to invoke, if fixable */
  fix_type: FixType | null;
}
```

### 2.2 `FixType` -- Auto-Fix Action Enum

```typescript
export type FixType =
  | 'recalculate_round_totals'    // Re-sum hole data into round totals
  | 'recalculate_round_gir'       // Recompute GIR from score/putts/par
  | 'refresh_player_stats_cache'  // Trigger refresh_player_stats_cache RPC
  | 'recalculate_strokes_gained'; // Trigger recalculate_round_strokes_gained RPC
```

### 2.3 `FixResult` -- Auto-Fix Response

```typescript
export interface FixResult {
  success: boolean;
  fix_type: FixType;
  round_id: string | null;
  player_id: string | null;
  message: string;
  /** Fields that were updated, for display */
  changes?: Record<string, { before: string | number | null; after: string | number | null }>;
}
```

### 2.4 `PlayerQualityScore` -- Per-Player Health

```typescript
export interface PlayerQualityScore {
  player_id: string;
  player_name: string;

  /** Composite 0-100 score */
  overall_score: number;

  /** Breakdown by category */
  category_scores: Record<IssueCategory, number>;

  /** Summary counts */
  critical_count: number;
  warning_count: number;
  info_count: number;
  total_issues: number;

  /** Number of fixable issues */
  fixable_count: number;
}
```

### 2.5 `DataQualityFilterState` -- UI Filter/Group Controls

```typescript
export type GroupByOption = 'none' | 'category' | 'player' | 'severity' | 'round';

export interface DataQualityFilterState {
  severity: IssueSeverity | 'all';
  category: IssueCategory | 'all';
  player_id: string | 'all';
  fixable_only: boolean;
  search: string;
  group_by: GroupByOption;
  sort_by: 'severity' | 'player' | 'date' | 'category';
  sort_asc: boolean;
}
```

### 2.6 Enhanced `TracerData` -- Backward-Compatible Extension

Add an **optional** field to `TracerData` so existing consumers are unaffected:

```typescript
// In admin-tracer-data.ts, extend the existing TracerData interface:
export interface TracerData {
  // ... all existing fields unchanged ...

  /** NEW (optional) -- per-round aggregated totals from hole data for integrity checks */
  roundIntegrity?: Record<string, RoundIntegrityData>;
}

export interface RoundIntegrityData {
  round_id: string;
  /** Totals computed from SUM of golf_holes rows */
  holes_sum_score: number | null;
  holes_sum_putts: number | null;
  holes_sum_fairways_hit: number;   // count where fairway_hit = true
  holes_sum_fairways_total: number; // count where fairway_hit is not null (par 4 + par 5)
  holes_sum_gir: number;            // count where gir = true
  holes_sum_gir_total: number;      // count of non-null gir values
  hole_count: number;
}
```

The `roundIntegrity` field is populated by a **single new aggregation query** inside `getTracerData()`, added to the existing Batch 2 `Promise.all`.

---

## 3. Backend Architecture

### 3.1 Enhanced `getTracerData()` -- One New Query

The only change to `getTracerData()` is adding a single aggregation query to Batch 2 that computes per-round integrity data from `golf_holes`. This enables the client-side diagnostic engine to detect score/putt/fairway/GIR mismatches between round-level fields and hole-level data without a separate server call.

**New query added to the Batch 2 `Promise.all`:**

```typescript
// In the existing Batch 2 Promise.all array, add:
roundIds.length > 0
  ? adminDb
      .from('golf_holes')
      .select('round_id, score, putts, fairway_hit, gir, par')
      .in('round_id', roundIds)
  : Promise.resolve({ data: [] }),
```

**Post-processing** (added after the existing count maps):

```typescript
// Build round integrity map from raw hole data
const roundIntegrity: Record<string, RoundIntegrityData> = {};

for (const hole of (holeRawResult as { data: HoleRow[] | null }).data || []) {
  if (!roundIntegrity[hole.round_id]) {
    roundIntegrity[hole.round_id] = {
      round_id: hole.round_id,
      holes_sum_score: 0,
      holes_sum_putts: 0,
      holes_sum_fairways_hit: 0,
      holes_sum_fairways_total: 0,
      holes_sum_gir: 0,
      holes_sum_gir_total: 0,
      hole_count: 0,
    };
  }
  const ri = roundIntegrity[hole.round_id]!;
  ri.hole_count++;
  if (hole.score != null) ri.holes_sum_score = (ri.holes_sum_score || 0) + hole.score;
  if (hole.putts != null) ri.holes_sum_putts = (ri.holes_sum_putts || 0) + hole.putts;
  if (hole.fairway_hit != null) {
    ri.holes_sum_fairways_total++;
    if (hole.fairway_hit) ri.holes_sum_fairways_hit++;
  }
  if (hole.gir != null) {
    ri.holes_sum_gir_total++;
    if (hole.gir) ri.holes_sum_gir++;
  }
}
```

**Return statement** (add at the end):

```typescript
return {
  // ... all existing fields ...
  roundIntegrity,  // NEW -- optional, client ignores if absent
};
```

**Note**: The existing `golf_holes` query in Batch 2 currently only does `select('round_id')` for counting. We either modify that query to include score/putts/fairway_hit/gir/par columns (preferred, avoids a duplicate query), or add a separate query. The recommended approach is to **modify the existing holeCounts query** to select the needed columns and derive both the count and the integrity data from the same result set.

### 3.2 New Server Action: `fixRoundData()`

Add to **`src/app/golf/actions/admin-tracer-data.ts`**:

```typescript
// ============================================
// AUTO-FIX ACTIONS (admin only)
// ============================================

export interface FixResult {
  success: boolean;
  fix_type: string;
  round_id: string | null;
  player_id: string | null;
  message: string;
  changes?: Record<string, { before: string | number | null; after: string | number | null }>;
}

export async function fixRoundData(
  roundId: string,
  fixType: 'recalculate_round_totals' | 'recalculate_round_gir' | 'refresh_player_stats_cache' | 'recalculate_strokes_gained',
  playerId?: string
): Promise<FixResult> {
  // Auth check (admin only)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();

  switch (fixType) {
    case 'recalculate_round_totals': {
      // Step 1: Read current round values
      const { data: round } = await adminDb
        .from('golf_rounds')
        .select('total_score, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, player_id')
        .eq('id', roundId)
        .single();
      if (!round) return { success: false, fix_type: fixType, round_id: roundId, player_id: null, message: 'Round not found' };

      // Step 2: Recompute from hole data
      const { data: holes } = await adminDb
        .from('golf_holes')
        .select('score, putts, fairway_hit, gir, par')
        .eq('round_id', roundId);

      if (!holes || holes.length === 0) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: 'No hole data found for this round' };
      }

      const newTotalScore = holes.reduce((sum, h) => sum + (h.score || 0), 0);
      const newScoreToPar = holes.reduce((sum, h) => sum + ((h.score || 0) - (h.par || 0)), 0);
      const newTotalPutts = holes.reduce((sum, h) => sum + (h.putts || 0), 0);
      const newFairwaysHit = holes.filter(h => h.fairway_hit === true).length;
      const newFairwaysTotal = holes.filter(h => h.fairway_hit != null).length;
      const newGir = holes.filter(h => h.gir === true).length;
      const newGirTotal = holes.filter(h => h.gir != null).length;

      // Step 3: Update
      const { error } = await adminDb
        .from('golf_rounds')
        .update({
          total_score: newTotalScore,
          score_to_par: newScoreToPar,
          total_putts: newTotalPutts,
          total_fairways_hit: newFairwaysHit,
          total_fairways: newFairwaysTotal,
          total_gir: newGir,
          total_gir_possible: newGirTotal,
        })
        .eq('id', roundId);

      if (error) return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: `DB update failed: ${error.message}` };

      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: round.player_id,
        message: 'Round totals recalculated from hole data',
        changes: {
          total_score: { before: round.total_score, after: newTotalScore },
          score_to_par: { before: round.score_to_par, after: newScoreToPar },
          total_putts: { before: round.total_putts, after: newTotalPutts },
          total_fairways_hit: { before: round.total_fairways_hit, after: newFairwaysHit },
          total_gir: { before: round.total_gir, after: newGir },
        },
      };
    }

    case 'recalculate_round_gir': {
      // Recompute GIR on all holes: gir = true when (score - putts) <= (par - 2)
      const { data: holes } = await adminDb
        .from('golf_holes')
        .select('id, score, putts, par, gir')
        .eq('round_id', roundId);

      if (!holes || holes.length === 0) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: 'No hole data found' };
      }

      let fixedCount = 0;
      for (const hole of holes) {
        if (hole.score == null || hole.putts == null || hole.par == null) continue;
        const correctGir = (hole.score - hole.putts) <= (hole.par - 2);
        if (hole.gir !== correctGir) {
          await adminDb
            .from('golf_holes')
            .update({ gir: correctGir })
            .eq('id', hole.id);
          fixedCount++;
        }
      }

      // Also update round-level GIR totals
      const { data: updatedHoles } = await adminDb
        .from('golf_holes')
        .select('gir')
        .eq('round_id', roundId);
      const newGir = (updatedHoles || []).filter(h => h.gir === true).length;
      const newGirTotal = (updatedHoles || []).filter(h => h.gir != null).length;
      await adminDb
        .from('golf_rounds')
        .update({ total_gir: newGir, total_gir_possible: newGirTotal })
        .eq('id', roundId);

      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: playerId || null,
        message: `Recalculated GIR for ${holes.length} holes, fixed ${fixedCount}`,
        changes: { gir_holes_fixed: { before: null, after: fixedCount } },
      };
    }

    case 'refresh_player_stats_cache': {
      if (!playerId) return { success: false, fix_type: fixType, round_id: null, player_id: null, message: 'playerId required' };

      // Use the existing RPC function
      const { error } = await (adminDb as any)
        .rpc('refresh_player_stats_cache', { p_player_id: playerId });

      if (error) return { success: false, fix_type: fixType, round_id: null, player_id: playerId, message: `Cache refresh failed: ${error.message}` };

      return {
        success: true,
        fix_type: fixType,
        round_id: null,
        player_id: playerId,
        message: 'Stats cache refreshed successfully',
      };
    }

    case 'recalculate_strokes_gained': {
      const { error } = await (adminDb as any)
        .rpc('recalculate_round_strokes_gained', { p_round_id: roundId });

      if (error) return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: `SG recalc failed: ${error.message}` };

      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: playerId || null,
        message: 'Strokes gained recalculated for round',
      };
    }

    default:
      return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: `Unknown fix type: ${fixType}` };
  }
}
```

### 3.3 Computation Strategy -- Server vs Client

| Concern | Where | Why |
|---------|-------|-----|
| Fetching all rounds, holes, stats cache | **Server** (`getTracerData`) | DB access, auth, RLS bypass via admin client |
| Aggregating hole data into `roundIntegrity` | **Server** (`getTracerData`) | Runs alongside existing queries in a single batch |
| Running 15+ diagnostic checks | **Client** (`detectDataQualityIssues`) | Pure computation on already-fetched data. No additional DB calls. Enables instant re-filtering without server round-trips. |
| Computing per-player quality scores | **Client** (`computePlayerQualityScores`) | Derived from diagnostic issues array |
| Filtering / grouping / sorting issues | **Client** (component state + `useMemo`) | Instant interactivity |
| Executing auto-fix actions | **Server** (`fixRoundData`) | DB writes require admin client |
| Lazy-loading per-hole drill-down | **Server** (`getTracerRoundDiagnostic`) | Already exists, no changes needed |

---

## 4. Frontend Architecture -- Diagnostic Engine

### 4.1 Enhanced `detectDataQualityIssues()` -- 18 Checks

Replace the current `detectOutliers()` with a comprehensive engine. This function lives in **`tracer-utils.ts`** and returns `DataQualityIssue[]`.

The existing `detectOutliers()` is preserved (not deleted) for backward compatibility but internally calls the new function and maps the output.

```typescript
export function detectDataQualityIssues(data: TracerData): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  for (const player of data.playerSummaries) {
    const playerRounds = data.roundDetails[player.player_id] || [];
    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';
    const completedRounds = playerRounds.filter(r => r.status === 'completed');

    for (const round of completedRounds) {
      const ri = data.roundIntegrity?.[round.round_id];

      // ---- CATEGORY: missing_data ----

      // Check 1: Completed round with null/zero putts
      // Check 2: Completed round with null/zero fairways
      // Check 3: Completed round with null/zero GIR
      // Check 4: Completed round with no strokes gained
      // Check 5: Completed round with null total_score

      // ---- CATEGORY: outlier ----

      // Check 6: Score > 120 (existing check, now with severity)
      // Check 7: Shots > 150 (existing check, now with severity)
      // Check 8: Putts per round > 45
      // Check 9: Score < 55 (suspiciously low)
      // Check 10: Putts per round < 18 (suspicious)
      // Check 11: Hole score > 12 (per-hole outlier, if integrity data available)

      // ---- CATEGORY: integrity ----

      // Check 12: Round total_score != SUM(hole scores)
      // Check 13: Round total_putts != SUM(hole putts)
      // Check 14: Round total_fairways_hit != count(fairway_hit=true in holes)
      // Check 15: Round total_gir != count(gir=true in holes)
      // Check 16: Expected holes != actual hole count

      // ---- CATEGORY: completeness ----

      // Check 17: Completed round with 0 hole records
      // Check 18: Completed round with < expected_holes hole records
    }

    // ---- CATEGORY: stuck_round (non-completed rounds) ----

    for (const round of playerRounds.filter(r => r.status === 'in_progress')) {
      // Check 19: In-progress round for > 2 hours
    }

    // ---- CATEGORY: cache_divergence (player-level) ----

    const statsRow = data.statsAccuracy.find(s => s.player_id === player.player_id);
    if (statsRow) {
      // Check 20: Cached scoring avg diverges from live by > 0.5
      // Check 21: Cached putts/round diverges from live by > 0.5
      // Check 22: Cached fairway % diverges from live by > 1%
      // Check 23: Cached GIR % diverges from live by > 1%
      // Check 24: Cached round count != live round count
      // Check 25: Cache is stale (is_stale = true)
    }
  }

  return issues;
}
```

### 4.2 Full Check Catalog

Below is the complete specification for every diagnostic check. Each row defines the check ID, what it detects, severity, category, whether it is fixable, and the fix type.

| # | `checkId` | Title | Condition | Severity | Category | Fixable | `fix_type` |
|---|-----------|-------|-----------|----------|----------|---------|------------|
| 1 | `missing-putts` | Missing Putts Data | Completed round: `has_putts === false` (null or 0 total_putts) | **critical** | `missing_data` | Yes | `recalculate_round_totals` |
| 2 | `missing-fairways` | Missing Fairway Data | Completed round: `has_fairways === false` | **critical** | `missing_data` | Yes | `recalculate_round_totals` |
| 3 | `missing-gir` | Missing GIR Data | Completed round: `has_gir === false` | **critical** | `missing_data` | Yes | `recalculate_round_totals` |
| 4 | `missing-sg` | Missing Strokes Gained | Completed round: `has_strokes_gained === false` | **warning** | `missing_data` | Yes | `recalculate_strokes_gained` |
| 5 | `missing-score` | Missing Total Score | Completed round: `total_score === null` | **critical** | `missing_data` | Yes | `recalculate_round_totals` |
| 6 | `outlier-score-high` | Unusually High Score | `total_score > 120` | **warning** | `outlier` | No | -- |
| 7 | `outlier-shots-high` | Unusually High Shot Count | `total_shots > 150` | **warning** | `outlier` | No | -- |
| 8 | `outlier-putts-high` | Unusually High Putts | `total_putts > 45` (from round data) | **warning** | `outlier` | No | -- |
| 9 | `outlier-score-low` | Suspiciously Low Score | `total_score < 55` and `total_score > 0` | **warning** | `outlier` | No | -- |
| 10 | `outlier-putts-low` | Suspiciously Low Putts | `total_putts < 18` and `total_putts > 0` | **info** | `outlier` | No | -- |
| 11 | `outlier-hole-score` | Extreme Hole Score | Any hole with `score > 12` (via `roundIntegrity` raw data -- requires enhancement, see note) | **info** | `outlier` | No | -- |
| 12 | `integrity-score-mismatch` | Score Mismatch (Holes vs Round) | `round.total_score !== roundIntegrity.holes_sum_score` | **critical** | `integrity` | Yes | `recalculate_round_totals` |
| 13 | `integrity-putts-mismatch` | Putts Mismatch (Holes vs Round) | `round total_putts !== roundIntegrity.holes_sum_putts` | **critical** | `integrity` | Yes | `recalculate_round_totals` |
| 14 | `integrity-fw-mismatch` | Fairway Mismatch (Holes vs Round) | `round.total_fairways_hit !== roundIntegrity.holes_sum_fairways_hit` | **warning** | `integrity` | Yes | `recalculate_round_totals` |
| 15 | `integrity-gir-mismatch` | GIR Mismatch (Holes vs Round) | `round.total_gir !== roundIntegrity.holes_sum_gir` | **warning** | `integrity` | Yes | `recalculate_round_gir` |
| 16 | `integrity-hole-count` | Missing Holes | `round.actual_holes < round.expected_holes` | **warning** | `completeness` | No | -- |
| 17 | `completeness-no-holes` | No Hole Data | Completed round: `actual_holes === 0` | **critical** | `completeness` | No | -- |
| 18 | `completeness-partial-holes` | Partial Hole Data | `0 < actual_holes < expected_holes` | **warning** | `completeness` | No | -- |
| 19 | `stuck-round` | Stuck Round | `status === 'in_progress'` and `updated_at < 2 hours ago` | **warning** | `stuck_round` | No | -- |
| 20 | `cache-scoring-diverge` | Cache Scoring Mismatch | `\|cached_scoring_avg - live_scoring_avg\| > 0.5` | **warning** | `cache_divergence` | Yes | `refresh_player_stats_cache` |
| 21 | `cache-putts-diverge` | Cache Putts Mismatch | `\|cached_putts_per_round - live_putts_per_round\| > 0.5` | **warning** | `cache_divergence` | Yes | `refresh_player_stats_cache` |
| 22 | `cache-fw-diverge` | Cache Fairway % Mismatch | `\|cached_fairway_pct - live_fairway_pct\| > 1` | **warning** | `cache_divergence` | Yes | `refresh_player_stats_cache` |
| 23 | `cache-gir-diverge` | Cache GIR % Mismatch | `\|cached_gir_pct - live_gir_pct\| > 1` | **warning** | `cache_divergence` | Yes | `refresh_player_stats_cache` |
| 24 | `cache-rounds-diverge` | Cache Round Count Mismatch | `cached_rounds !== live_rounds` | **info** | `cache_divergence` | Yes | `refresh_player_stats_cache` |
| 25 | `cache-stale` | Stale Stats Cache | `is_stale === true` | **info** | `cache_divergence` | Yes | `refresh_player_stats_cache` |

**Note on Check 11 (per-hole outlier)**: The current `roundIntegrity` aggregation gives us round-level sums, not individual hole scores. To detect per-hole outliers without a full hole-data download, we would need to either (a) track max-hole-score in the aggregation, or (b) defer this check to the drill-down modal. **Recommendation**: Add `max_hole_score` to the `RoundIntegrityData` aggregation (one additional field tracked during the same loop), and trigger the check when `max_hole_score > 12`. This avoids needing individual hole data at the list level.

### 4.3 Root-Cause Tracing for Cache Divergence

When a cache divergence issue is detected (checks 20-24), the admin needs to know WHICH rounds caused it. The approach:

1. The `DataQualityIssue` for cache divergence includes the `player_id`.
2. When the admin clicks "Trace Root Cause" on a cache divergence issue, the UI filters the existing `roundDetails[player_id]` to show all completed rounds for that player, sorted by most recent.
3. For each round, the existing `roundIntegrity` data shows whether that round's totals are correct.
4. Rounds where `roundIntegrity` shows a mismatch are highlighted as probable root causes.
5. If deeper investigation is needed, the admin clicks a round to invoke the existing `getTracerRoundDiagnostic(roundId)` for hole-by-hole analysis.

**No new server action needed.** The root-cause trace is a client-side view that cross-references already-fetched data.

### 4.4 Backward-Compatible `detectOutliers()` Wrapper

```typescript
// Keep the existing function signature working
export function detectOutliers(data: TracerData): Outlier[] {
  const issues = detectDataQualityIssues(data);
  return issues
    .filter(i => i.category === 'outlier')
    .map(i => ({
      player_id: i.player_id,
      player_name: i.player_name,
      round_id: i.round_id || '',
      field: i.title,
      value: typeof i.actual_value === 'number' ? i.actual_value : 0,
      threshold: typeof i.expected_value === 'number' ? i.expected_value : 0,
      course_name: i.course_name,
    }));
}
```

---

## 5. Frontend Architecture -- Component Design

### 5.1 Upgraded `TracerDataQuality.tsx` -- Section Layout

The component evolves from 3 sections to 5 sections, with a new top-level filter/summary bar. The existing props interface gains new optional fields so existing call sites don't break.

```
+-----------------------------------------------------------------------+
|  DATA QUALITY DASHBOARD                                               |
|  [Summary Bar: X critical / Y warning / Z info] [Filter Controls]    |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  Section 1: ISSUE OVERVIEW (NEW)                                      |
|  - Grouped/filtered list of all DataQualityIssue items                |
|  - Each row: severity badge, title, player, round, Fix button         |
|  - Group-by toggle: category / player / severity / round              |
|  - Expandable groups with count badges                                |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  Section 2: PER-PLAYER QUALITY SCORES (NEW)                          |
|  - Horizontal bar cards, one per player                               |
|  - Overall score (0-100) with color coding                            |
|  - Breakdown: critical/warning/info counts + fixable count            |
|  - Click to filter issues list to that player                         |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  Section 3: STATS ACCURACY TABLE (EXISTING - enhanced)                |
|  - Same cached/live comparison table                                  |
|  - NEW: "Trace" button per mismatched row (opens root-cause panel)    |
|  - NEW: "Fix All" button to batch-refresh caches                     |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  Section 4: DATA COMPLETENESS HEATMAP (EXISTING - unchanged)          |
|  - DataCompletenessGrid component, no changes needed                  |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
|  Section 5: OUTLIER & INTEGRITY PANEL (EXISTING - enhanced)           |
|  - Replaces the simple outlier table                                  |
|  - Now shows all non-cache-divergence issues in a richer format       |
|  - Severity badges (colored dots: red/amber/blue)                     |
|  - Fix buttons inline where applicable                                |
+-----------------------------------------------------------------------+
```

### 5.2 New Props Interface

```typescript
interface TracerDataQualityProps {
  // Existing (unchanged)
  statsAccuracy: TracerStatsAccuracy[];
  completeness: PlayerCompleteness[];
  outliers: Outlier[];
  onRefreshCache?: (playerId: string) => void;

  // New (all optional for backward compat)
  issues?: DataQualityIssue[];
  playerScores?: PlayerQualityScore[];
  onFixIssue?: (issue: DataQualityIssue) => Promise<FixResult>;
  onTraceRootCause?: (playerId: string) => void;
  roundDetails?: Record<string, TracerRoundDetail[]>;
  roundIntegrity?: Record<string, RoundIntegrityData>;
}
```

### 5.3 Filter/Group Controls Component

A new sub-component `DataQualityFilterBar` renders above the issues list:

```
[Severity: All | Critical | Warning | Info]
[Category: All | Missing Data | Outlier | Integrity | Cache | Completeness | Stuck]
[Player: All | dropdown of players with issue counts]
[x] Fixable Only
[Group By: None | Category | Player | Severity]
[Sort: Severity | Player | Date]
```

Implementation: a `useReducer` managing `DataQualityFilterState`, passed down as context. Filtering and grouping happen in a `useMemo` that transforms `DataQualityIssue[]` into grouped sections.

### 5.4 Issue Row Component

Each `DataQualityIssue` renders as a row in the issues list:

```
[CRITICAL]  Missing Putts Data                   John Smith    Round abc123 @ Pine Valley   2026-03-08    [FIX]
            "Completed round has null putts..."                                                           [DRILL DOWN]
```

- Severity badge: colored pill (`bg-red-50 text-red-700` for critical, `bg-amber-50 text-amber-700` for warning, `bg-blue-50 text-blue-700` for info)
- Fix button: only rendered when `issue.fixable === true`
- Drill-down button: navigates to the round diagnostic modal (existing `getTracerRoundDiagnostic`)

### 5.5 Root-Cause Trace Panel

When the admin clicks "Trace" on a cache divergence issue, a slide-over panel appears showing:

1. Player name and the specific stat that diverged
2. All completed rounds for that player (from `roundDetails`)
3. Each round annotated with whether its `roundIntegrity` matches its stored totals
4. Mismatched rounds highlighted in red with a "Fix" button
5. A "Refresh Cache" button at the bottom that calls `fixRoundData` with `refresh_player_stats_cache`

This panel is a **client-side view only** -- no additional data fetching. It reads from the already-loaded `roundDetails` and `roundIntegrity`.

### 5.6 Auto-Fix UI

**Button placement**: Inline on each fixable issue row, and as batch actions in group headers.

**Loading states**:
1. Click "Fix" on an issue row.
2. Button enters loading state (spinner icon, disabled).
3. Server action `fixRoundData()` is called.
4. On success: toast notification with change details, issue row fades out or gets a green checkmark.
5. On failure: toast notification with error message, button returns to normal state.
6. After any fix: the parent re-fetches `getTracerData()` to refresh all data.

**Batch fix**: The "Fix All" button in a group header iterates through fixable issues sequentially (not in parallel, to avoid overwhelming the database), showing a progress indicator ("Fixing 3 of 7...").

**Confirmation dialog**: Only for batch operations involving more than 3 issues. Single-issue fixes execute immediately (they are idempotent and safe).

```typescript
// In the parent component that manages TracerDataQuality
const [fixingIssues, setFixingIssues] = useState<Set<string>>(new Set());

async function handleFixIssue(issue: DataQualityIssue): Promise<FixResult> {
  setFixingIssues(prev => new Set(prev).add(issue.id));
  try {
    const result = await fixRoundData(
      issue.round_id || '',
      issue.fix_type!,
      issue.player_id
    );
    if (result.success) {
      // Trigger full data refresh
      await refreshTracerData();
    }
    return result;
  } finally {
    setFixingIssues(prev => {
      const next = new Set(prev);
      next.delete(issue.id);
      return next;
    });
  }
}
```

---

## 6. Auto-Fix System

### 6.1 Fix Type Behavior Matrix

| Fix Type | What It Does | Idempotent? | Side Effects | Affected Tables |
|----------|-------------|-------------|--------------|-----------------|
| `recalculate_round_totals` | Reads all `golf_holes` for the round, re-sums score/putts/fairways/GIR, writes to `golf_rounds` | Yes | Triggers stats cache staleness via DB trigger | `golf_rounds` |
| `recalculate_round_gir` | Recomputes `gir` on each `golf_holes` row using formula `(score - putts) <= (par - 2)`, then updates round totals | Yes | Same as above | `golf_holes`, `golf_rounds` |
| `refresh_player_stats_cache` | Calls existing `refresh_player_stats_cache` RPC | Yes | Invalidates Redis cache | `golf_player_stats_cache` |
| `recalculate_strokes_gained` | Calls existing `recalculate_round_strokes_gained` RPC | Yes | None | `golf_round_stats_cache`, `golf_rounds` |

### 6.2 Safety Guarantees

1. **Admin-only**: Every `fixRoundData()` call verifies `role === 'admin'`.
2. **Idempotent**: Running any fix twice produces the same result.
3. **Auditable**: The `FixResult` includes before/after values for every changed field.
4. **Non-destructive**: Fixes recalculate from source-of-truth data (hole records). They never delete data.
5. **Atomic per-round**: Each fix operates on a single round. Batch fixes are sequential, so a failure on round N does not affect rounds 1..N-1.

---

## 7. Per-Player Quality Score

### 7.1 Computation: `computePlayerQualityScores()`

Lives in **`tracer-utils.ts`**. Takes the full issues list and produces a score per player.

```typescript
export function computePlayerQualityScores(
  issues: DataQualityIssue[],
  players: TracerPlayerSummary[]
): PlayerQualityScore[] {
  const scores: PlayerQualityScore[] = [];

  for (const player of players) {
    const playerIssues = issues.filter(i => i.player_id === player.player_id);
    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';

    // Severity weights
    const criticalCount = playerIssues.filter(i => i.severity === 'critical').length;
    const warningCount = playerIssues.filter(i => i.severity === 'warning').length;
    const infoCount = playerIssues.filter(i => i.severity === 'info').length;

    // Penalty-based scoring (start at 100, deduct per issue)
    // Critical: -15 points each (capped contribution at 60)
    // Warning:  -5 points each (capped contribution at 30)
    // Info:     -1 point each (capped contribution at 10)
    const criticalPenalty = Math.min(criticalCount * 15, 60);
    const warningPenalty = Math.min(warningCount * 5, 30);
    const infoPenalty = Math.min(infoCount * 1, 10);
    const overallScore = Math.max(0, 100 - criticalPenalty - warningPenalty - infoPenalty);

    // Category breakdown: percentage of "clean" per category
    const categoryScores: Record<IssueCategory, number> = {
      missing_data: 100,
      outlier: 100,
      integrity: 100,
      cache_divergence: 100,
      completeness: 100,
      stuck_round: 100,
    };

    // For each category, deduct based on number of issues relative to total rounds
    const totalRounds = Math.max(player.completed_rounds, 1);
    for (const cat of Object.keys(categoryScores) as IssueCategory[]) {
      const catIssues = playerIssues.filter(i => i.category === cat);
      const ratio = catIssues.length / totalRounds;
      categoryScores[cat] = Math.max(0, Math.round(100 - ratio * 100));
    }

    scores.push({
      player_id: player.player_id,
      player_name: playerName,
      overall_score: overallScore,
      category_scores: categoryScores,
      critical_count: criticalCount,
      warning_count: warningCount,
      info_count: infoCount,
      total_issues: playerIssues.length,
      fixable_count: playerIssues.filter(i => i.fixable).length,
    });
  }

  // Sort: worst scores first
  return scores.sort((a, b) => a.overall_score - b.overall_score);
}
```

### 7.2 Score Display

Each player renders as a glass card:

```
+------------------------------------------------------------------+
|  [85] John Smith          3 critical  2 warning  1 info          |
|  ████████████████████████████░░░░░░░░░░░░░░░                     |
|  [Fix 4 issues]                                                   |
+------------------------------------------------------------------+
```

- Score circle: `>= 90` green, `70-89` amber, `< 70` red
- Progress bar: filled based on score
- "Fix N issues" button: triggers batch fix for all fixable issues for that player

---

## 8. Cross-Cutting Concerns

### 8.1 Error Handling

| Scenario | Handling |
|----------|----------|
| `fixRoundData()` throws (network/auth error) | Catch in client, show error toast, button returns to normal. Issue remains in list. |
| `fixRoundData()` returns `{ success: false }` | Show warning toast with `result.message`. Button returns to normal. Issue remains. |
| Batch fix: one round fails in a sequence | Continue with remaining rounds. Show summary toast: "Fixed 5/7 rounds. 2 failed." Failed issues remain. |
| `getTracerData()` fails on refresh after fix | Show error toast. Existing issues list remains stale but visible. Retry button appears. |
| Race condition: admin fixes issue while data is being refetched | Fixes are idempotent, so double-fixing is safe. Dedup on refresh. |

### 8.2 Performance

| Concern | Strategy |
|---------|----------|
| Initial load: `getTracerData()` adds one column expansion to the existing `golf_holes` query | Marginal cost (~same number of rows, 5 extra columns). The existing query already fetches all hole rows for counting. |
| Client-side diagnostic engine: 25 checks across all rounds | O(players * rounds) -- typically < 500 total rounds. Runs in < 50ms. Wrapped in `useMemo` keyed on `data`. |
| Filter/group/sort interactivity | All in `useMemo`. No server calls for filter changes. |
| Root-cause trace panel | Client-side cross-reference of already-loaded data. No server call. |
| Per-hole drill-down | Existing `getTracerRoundDiagnostic()` -- lazy-loaded on click. No change needed. |
| Auto-fix refresh | After each fix, full `getTracerData()` refresh. Could optimize with surgical state updates, but full refresh ensures consistency and keeps code simple. |

### 8.3 UX Flow: Discover -> Investigate -> Fix

```
STEP 1: DISCOVER
  Admin opens Data Quality tab
  -> Sees summary bar: "12 critical, 5 warning, 3 info"
  -> Sees per-player quality scores sorted worst-first
  -> Sees issue list grouped by category

STEP 2: INVESTIGATE
  Admin clicks a critical issue (e.g., "Score Mismatch: Holes vs Round")
  -> Issue row expands to show details:
     Round abc123 at Pine Valley on 2026-03-08
     Stored total_score: 78  |  Sum of hole scores: 82
     "This round's total_score does not match the sum of individual hole scores."
  -> Admin can click "Drill Down" to open the existing round diagnostic modal
     which shows hole-by-hole and shot-by-shot data

  For cache divergence issues:
  Admin clicks "Trace Root Cause" on a cache mismatch
  -> Root-cause panel slides in
  -> Shows all completed rounds for the player
  -> Highlights rounds with integrity mismatches as probable causes
  -> Admin can fix individual rounds, then refresh the cache

STEP 3: FIX
  Admin clicks "Fix" on an issue
  -> Confirmation (only for batch operations)
  -> Loading state on button
  -> Server action executes
  -> Success toast with change details
  -> Data refreshes automatically
  -> Fixed issue disappears from the list
  -> Quality scores update in real time

  Admin can also use batch operations:
  -> "Fix All Missing Data" button in the Missing Data group header
  -> "Fix All" button on a player's quality score card
  -> Progress indicator: "Fixing 3 of 7..."
```

---

## 9. Implementation Phases

### Phase 1: Types + Diagnostic Engine (no UI changes)
- Add new types to `tracer-types.ts`
- Implement `detectDataQualityIssues()` in `tracer-utils.ts`
- Implement `computePlayerQualityScores()` in `tracer-utils.ts`
- Wrap existing `detectOutliers()` to use new engine
- **Estimated effort**: 1-2 hours

### Phase 2: Backend Enhancement
- Modify `getTracerData()` to include `roundIntegrity` data
- Add `fixRoundData()` server action
- Add `FixResult` type to server action file
- **Estimated effort**: 1-2 hours

### Phase 3: UI -- Issue List + Filters
- Add `DataQualityFilterBar` component
- Add `DataQualityIssueRow` component
- Add Section 1 (Issue Overview) to `TracerDataQuality.tsx`
- Wire up filter state with `useReducer`
- **Estimated effort**: 2-3 hours

### Phase 4: UI -- Player Quality Scores
- Add `PlayerQualityScoreCard` component
- Add Section 2 (Per-Player Scores) to `TracerDataQuality.tsx`
- **Estimated effort**: 1 hour

### Phase 5: UI -- Auto-Fix + Root-Cause Trace
- Wire up `fixRoundData` calls with loading states
- Add fix buttons to issue rows and batch headers
- Build root-cause trace slide-over panel
- Add confirmation dialog for batch operations
- **Estimated effort**: 2-3 hours

### Phase 6: Polish
- Toast notifications for fix results
- Empty states for "no issues" (celebrate with green checkmark)
- Keyboard navigation for filter controls
- Responsive design for narrower viewports
- **Estimated effort**: 1 hour

**Total estimated effort**: 8-12 hours

---

## 10. File Change Manifest

| File | Change Type | Description |
|------|-------------|-------------|
| `src/app/golf/admin/components/tracer/tracer-types.ts` | **Edit** | Add `DataQualityIssue`, `IssueSeverity`, `IssueCategory`, `FixType`, `FixResult`, `PlayerQualityScore`, `DataQualityFilterState`, `GroupByOption`, `RoundIntegrityData` types |
| `src/app/golf/actions/admin-tracer-data.ts` | **Edit** | (1) Add `RoundIntegrityData` interface and `roundIntegrity` optional field to `TracerData`. (2) Modify Batch 2 `golf_holes` query to include score/putts/fairway_hit/gir/par columns. (3) Add aggregation loop to build `roundIntegrity` map. (4) Add `fixRoundData()` server action with `FixResult` return type. |
| `src/app/golf/admin/components/tracer/tracer-utils.ts` | **Edit** | (1) Add `detectDataQualityIssues()` with 25 checks. (2) Add `computePlayerQualityScores()`. (3) Refactor existing `detectOutliers()` to delegate to `detectDataQualityIssues()` internally. |
| `src/app/golf/admin/components/tracer/TracerDataQuality.tsx` | **Edit** | (1) Extend props with optional `issues`, `playerScores`, `onFixIssue`, etc. (2) Add summary bar. (3) Add Issue Overview section with filter/group controls. (4) Add Per-Player Quality Scores section. (5) Enhance Stats Accuracy table with Trace button. (6) Replace simple outlier table with richer panel. |
| `src/app/golf/admin/components/tracer/DataQualityFilterBar.tsx` | **New** | Filter/group control bar for the issues list |
| `src/app/golf/admin/components/tracer/DataQualityIssueRow.tsx` | **New** | Single issue row component with severity badge, details, fix button |
| `src/app/golf/admin/components/tracer/PlayerQualityScoreCard.tsx` | **New** | Per-player quality score card with breakdown and batch-fix button |
| `src/app/golf/admin/components/tracer/RootCauseTracePanel.tsx` | **New** | Slide-over panel for cache divergence root-cause investigation |

**No new database tables. No schema migrations. No new RPC functions.** All fixes leverage existing Supabase RPCs (`refresh_player_stats_cache`, `recalculate_round_strokes_gained`) and direct table updates via the admin client.
