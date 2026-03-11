# Enhanced Diagnostics Query Design

> Database query strategy for the admin Data Quality tab upgrade.
> No schema changes. Queries only.
> Target file: `src/app/golf/actions/admin-tracer-data.ts`

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [New Queries Needed](#2-new-queries-needed)
3. [Per-Hole Data Fetch Strategy](#3-per-hole-data-fetch-strategy)
4. [Statistical Baseline Computation (IQR)](#4-statistical-baseline-computation-iqr)
5. [Cache Divergence Tracing](#5-cache-divergence-tracing)
6. [9-Hole Handling](#6-9-hole-handling)
7. [Computation Placement (SQL vs Server vs Client)](#7-computation-placement-sql-vs-server-vs-client)
8. [Performance Considerations](#8-performance-considerations)
9. [Implementation Plan](#9-implementation-plan)

---

## 1. Current State Analysis

### What `getTracerData()` fetches today

| Data | Source Table | What it gets | What it misses |
|------|-------------|-------------|----------------|
| Players | `golf_players` | id, first_name, last_name | -- |
| Rounds | `golf_rounds` | Full round-level fields | No `holes_played` in completeness logic |
| Hole counts | `golf_holes` | `COUNT(*)` per round_id | No actual hole-level data (par, score, putts) |
| Shot counts | `golf_shots` | `COUNT(*)` per round_id | No shot-level detail |
| Putt details | `golf_shots` + `putt_details` | `COUNT(*)` per round_id | -- |
| Stats cache | `golf_player_stats_cache` | Core cached metrics | No `round_ids_included` array |
| Round stats cache | `golf_round_stats_cache` | Just `round_id` set membership | No per-round cached values for comparison |
| Error logs | `error_logs` | Full error rows | -- |

### What the current `detectOutliers()` does (client-side)

Uses **fixed thresholds** only: `total_score > 120` and `total_shots > 150`. No per-player IQR. No per-hole validation at all.

### What the current `computeCompleteness()` does (client-side)

Checks boolean flags (`has_putts`, `has_fairways`, `has_gir`, etc.) that are derived from round-level totals being non-null/non-zero. Does not validate hole-level data completeness.

### Key gaps

1. **No hole-level data** in the main fetch -- cannot detect per-hole anomalies, score/putt mismatches, or round-total vs hole-sum discrepancies.
2. **No per-player statistical baselines** -- outlier detection uses absolute thresholds, not player-relative IQR.
3. **No round-level cache comparison** -- cache divergence is detected at the player aggregate level, not traceable to individual rounds.
4. **No 9-hole awareness** -- validation treats all rounds as 18-hole rounds.

---

## 2. New Queries Needed

### Query 2A: Hole-Level Aggregates Per Round

**Purpose**: Power per-hole anomaly detection and round-total vs hole-sum validation without fetching every individual hole row.

```sql
-- Supabase JS equivalent shown below; this is the logical SQL
SELECT
  round_id,
  COUNT(*)                            AS hole_count,
  SUM(score)                          AS sum_scores,
  SUM(putts)                          AS sum_putts,
  SUM(CASE WHEN fairway_hit THEN 1 ELSE 0 END) AS sum_fairways_hit,
  COUNT(CASE WHEN par > 3 THEN 1 END)          AS sum_fairway_holes,
  SUM(CASE WHEN gir THEN 1 ELSE 0 END)         AS sum_gir,
  COUNT(*)                            AS sum_gir_possible,
  -- Anomaly detection signals
  COUNT(CASE WHEN score IS NULL THEN 1 END)     AS null_score_count,
  COUNT(CASE WHEN putts IS NULL THEN 1 END)     AS null_putts_count,
  COUNT(CASE WHEN score < par - 1 THEN 1 END)   AS eagle_or_better_count,
  COUNT(CASE WHEN score > par + 4 THEN 1 END)   AS blow_up_hole_count,
  MIN(score)                          AS min_hole_score,
  MAX(score)                          AS max_hole_score,
  -- Putts vs score mismatch detection
  COUNT(CASE WHEN putts IS NOT NULL AND score IS NOT NULL
             AND putts >= score THEN 1 END)      AS putts_gte_score_count
FROM golf_holes
WHERE round_id = ANY($1)
GROUP BY round_id;
```

**Supabase client approach**: Since Supabase JS does not support `GROUP BY` aggregations natively, this must use one of:

- **Option A (Recommended)**: Postgres function via `rpc()` call
- **Option B**: Fetch all hole rows and aggregate in the server action

Given that we need aggregates per round and potentially have hundreds of rounds, Option A is strongly preferred. See section 3 for the full strategy.

### Query 2B: Per-Player Statistical Baselines

**Purpose**: Compute mean and standard deviation per player for IQR-based outlier detection.

```sql
SELECT
  player_id,
  COUNT(*)            AS n_rounds,
  AVG(total_score)    AS mean_score,
  STDDEV(total_score) AS stddev_score,
  AVG(total_putts)    AS mean_putts,
  STDDEV(total_putts) AS stddev_putts,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_score) AS q1_score,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_score) AS q3_score,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_putts) AS q1_putts,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_putts) AS q3_putts
FROM golf_rounds
WHERE status = 'completed'
  AND total_score IS NOT NULL
GROUP BY player_id
HAVING COUNT(*) >= 3;
```

**Implementation**: Postgres RPC function. `PERCENTILE_CONT` is a standard PostgreSQL ordered-set aggregate -- no extensions needed.

### Query 2C: Round-Level Cache Divergence Detail

**Purpose**: Compare `golf_rounds` live values vs `golf_round_stats_cache` cached values, per round. This identifies exactly which rounds cause the aggregate cache to diverge.

```sql
SELECT
  r.id                AS round_id,
  r.player_id,
  r.total_score       AS live_score,
  r.total_putts       AS live_putts,
  r.total_fairways_hit AS live_fw_hit,
  r.total_fairways    AS live_fw_total,
  r.total_gir         AS live_gir,
  r.total_gir_possible AS live_gir_possible,
  r.strokes_gained_total AS live_sg,
  r.holes_played,
  r.round_date,
  r.course_name,
  rsc.total_score     AS cached_score,
  rsc.total_putts     AS cached_putts,
  rsc.fairways_hit    AS cached_fw_hit,
  rsc.fairways_total  AS cached_fw_total,
  rsc.greens_hit      AS cached_gir,
  rsc.greens_total    AS cached_gir_possible,
  rsc.strokes_gained_total AS cached_sg,
  -- Divergence flags (computed in SQL for filtering)
  (r.total_score IS DISTINCT FROM rsc.total_score)   AS score_diverges,
  (r.total_putts IS DISTINCT FROM rsc.total_putts)   AS putts_diverges
FROM golf_rounds r
LEFT JOIN golf_round_stats_cache rsc ON rsc.round_id = r.id
WHERE r.status = 'completed'
  AND r.player_id = ANY($1)
ORDER BY r.round_date DESC;
```

**Supabase approach**: This requires a JOIN which Supabase JS handles poorly across tables. Use an RPC function or separate queries that are joined in the server action.

### Query 2D: Flagged Holes (Per-Hole Anomalies -- Lazy Loaded)

**Purpose**: When drilling into a specific round, fetch individual hole rows with anomaly flags. This extends the existing `getTracerRoundDiagnostic()`.

```sql
SELECT
  hole_number,
  par,
  score,
  putts,
  fairway_hit,
  gir,
  yardage,
  penalty_strokes,
  -- Computed anomaly flags
  (score IS NULL)                           AS missing_score,
  (putts IS NULL AND score IS NOT NULL)     AS missing_putts,
  (putts >= score)                          AS putts_impossible,
  (score = 1)                               AS hole_in_one,
  (score > par + 4)                         AS blow_up_hole,
  (par > 3 AND fairway_hit IS NULL)         AS missing_fairway,
  (gir IS NULL)                             AS missing_gir
FROM golf_holes
WHERE round_id = $1
ORDER BY hole_number;
```

This can stay as a direct Supabase query (already similar to the existing `getTracerRoundDiagnostic` pattern), just with additional columns selected.

### Query 2E: Player Stats Cache with `round_ids_included`

**Purpose**: Fetch the `round_ids_included` array from the cache so we can identify which rounds the cache was built from vs which rounds actually exist.

```sql
-- Add round_ids_included to the existing stats cache query
SELECT
  player_id,
  rounds_played,
  scoring_average,
  putts_per_round,
  driving_accuracy_percentage,
  gir_percentage,
  is_stale,
  updated_at,
  round_ids_included   -- NEW: array of UUIDs
FROM golf_player_stats_cache;
```

This is a trivial column addition to the existing `getTracerData()` stats cache fetch.

---

## 3. Per-Hole Data Fetch Strategy

### The problem

With N rounds * up to 18 holes each, fetching all hole rows could mean 5,000+ rows for a team with a full season. The Supabase JS client has practical limits on `.in()` filter sizes and response payload.

### Strategy: Two-tier approach

#### Tier 1: Aggregate fetch (always loaded)

A single Postgres RPC function that returns per-round hole aggregates. This is the workhorse for the main Data Quality tab.

```sql
CREATE OR REPLACE FUNCTION admin_get_round_hole_aggregates(p_round_ids UUID[])
RETURNS TABLE (
  round_id         UUID,
  hole_count       INTEGER,
  sum_scores       INTEGER,
  sum_putts        INTEGER,
  sum_fairways_hit INTEGER,
  sum_fairway_holes INTEGER,
  sum_gir          INTEGER,
  null_score_count INTEGER,
  null_putts_count INTEGER,
  putts_gte_score_count INTEGER,
  blow_up_hole_count    INTEGER,
  min_hole_score   INTEGER,
  max_hole_score   INTEGER
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql STABLE
AS $$
  SELECT
    h.round_id,
    COUNT(*)::INTEGER,
    SUM(h.score)::INTEGER,
    SUM(h.putts)::INTEGER,
    SUM(CASE WHEN h.fairway_hit THEN 1 ELSE 0 END)::INTEGER,
    COUNT(CASE WHEN h.par > 3 THEN 1 END)::INTEGER,
    SUM(CASE WHEN h.gir THEN 1 ELSE 0 END)::INTEGER,
    COUNT(CASE WHEN h.score IS NULL THEN 1 END)::INTEGER,
    COUNT(CASE WHEN h.putts IS NULL THEN 1 END)::INTEGER,
    COUNT(CASE WHEN h.putts IS NOT NULL AND h.score IS NOT NULL
               AND h.putts >= h.score THEN 1 END)::INTEGER,
    COUNT(CASE WHEN h.score > h.par + 4 THEN 1 END)::INTEGER,
    MIN(h.score)::INTEGER,
    MAX(h.score)::INTEGER
  FROM golf_holes h
  WHERE h.round_id = ANY(p_round_ids)
  GROUP BY h.round_id;
$$;
```

**Call pattern** (in admin-tracer-data.ts):

```typescript
const { data: holeAggregates } = await adminDb.rpc(
  'admin_get_round_hole_aggregates',
  { p_round_ids: roundIds }
);
```

**Payload size**: One row per round. If there are 300 rounds, this returns 300 rows with 13 small integer columns -- roughly 10 KB. Negligible.

#### Tier 2: Full hole detail (lazy-loaded per round)

When the admin clicks into a specific round via the diagnostic modal, `getTracerRoundDiagnostic()` already fetches individual holes. Extend it with the anomaly columns from Query 2D. This is the existing pattern -- no change to the loading strategy, just richer columns.

### Batching strategy for the `p_round_ids` parameter

If the system has more than ~1,000 rounds, the UUID array parameter could become large. Mitigation:

1. **Scope to completed rounds only** in the caller: filter `roundIds` to only rounds where `status === 'completed'` before passing to the RPC.
2. **If >1,000 completed rounds**: batch into chunks of 500 and make parallel RPC calls. Combine results client-side. This is a defensive measure -- most teams will have far fewer than 1,000 completed rounds.

---

## 4. Statistical Baseline Computation (IQR)

### Why IQR over standard deviation

Golf scoring is not normally distributed -- players have occasional blow-up rounds. The Interquartile Range (IQR) method is robust against these outliers by definition, making it the right choice for detecting them.

### The IQR method

For each player's completed rounds:
- Q1 = 25th percentile of total_score
- Q3 = 75th percentile of total_score
- IQR = Q3 - Q1
- Lower fence = Q1 - 1.5 * IQR
- Upper fence = Q3 + 1.5 * IQR

Any round with `total_score` outside [lower_fence, upper_fence] is flagged as an outlier.

### Postgres RPC function

```sql
CREATE OR REPLACE FUNCTION admin_get_player_baselines(p_player_ids UUID[])
RETURNS TABLE (
  player_id        UUID,
  n_rounds         INTEGER,
  -- Score baselines
  mean_score       NUMERIC,
  stddev_score     NUMERIC,
  q1_score         NUMERIC,
  q3_score         NUMERIC,
  iqr_score        NUMERIC,
  lower_fence_score NUMERIC,
  upper_fence_score NUMERIC,
  -- Putts baselines
  mean_putts       NUMERIC,
  stddev_putts     NUMERIC,
  q1_putts         NUMERIC,
  q3_putts         NUMERIC,
  iqr_putts        NUMERIC,
  lower_fence_putts NUMERIC,
  upper_fence_putts NUMERIC,
  -- Strokes gained baseline
  mean_sg          NUMERIC,
  stddev_sg        NUMERIC
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql STABLE
AS $$
  WITH player_stats AS (
    SELECT
      r.player_id,
      COUNT(*)::INTEGER AS n_rounds,
      AVG(r.total_score)      AS mean_score,
      STDDEV(r.total_score)   AS stddev_score,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY r.total_score) AS q1_score,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY r.total_score) AS q3_score,
      AVG(r.total_putts)      AS mean_putts,
      STDDEV(r.total_putts)   AS stddev_putts,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY r.total_putts) AS q1_putts,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY r.total_putts) AS q3_putts,
      AVG(r.strokes_gained_total)  AS mean_sg,
      STDDEV(r.strokes_gained_total) AS stddev_sg
    FROM golf_rounds r
    WHERE r.player_id = ANY(p_player_ids)
      AND r.status = 'completed'
      AND r.total_score IS NOT NULL
    GROUP BY r.player_id
    HAVING COUNT(*) >= 3
  )
  SELECT
    ps.player_id,
    ps.n_rounds,
    ROUND(ps.mean_score, 1),
    ROUND(ps.stddev_score, 2),
    ROUND(ps.q1_score, 1),
    ROUND(ps.q3_score, 1),
    ROUND(ps.q3_score - ps.q1_score, 1) AS iqr_score,
    ROUND(ps.q1_score - 1.5 * (ps.q3_score - ps.q1_score), 1) AS lower_fence_score,
    ROUND(ps.q3_score + 1.5 * (ps.q3_score - ps.q1_score), 1) AS upper_fence_score,
    ROUND(ps.mean_putts, 1),
    ROUND(ps.stddev_putts, 2),
    ROUND(ps.q1_putts, 1),
    ROUND(ps.q3_putts, 1),
    ROUND(ps.q3_putts - ps.q1_putts, 1) AS iqr_putts,
    ROUND(ps.q1_putts - 1.5 * (ps.q3_putts - ps.q1_putts), 1) AS lower_fence_putts,
    ROUND(ps.q3_putts + 1.5 * (ps.q3_putts - ps.q1_putts), 1) AS upper_fence_putts,
    ROUND(ps.mean_sg, 2),
    ROUND(ps.stddev_sg, 2)
  FROM player_stats ps;
$$;
```

### 9-hole adjustment

The baselines must be computed separately for 9-hole and 18-hole rounds. A single player might have a mix. The function should accept a `p_holes_played` filter or internally partition:

```sql
-- Alternative: separate baselines by holes_played
WHERE r.holes_played = 18  -- for 18-hole baseline
WHERE r.holes_played = 9   -- for 9-hole baseline
```

**Recommendation**: Compute 18-hole baselines only in the RPC (the common case), and handle 9-hole rounds via a separate threshold set defined in the server action (see section 6).

### Using the baselines in the server action

```typescript
// In getTracerData() or a new getDiagnosticData()
const { data: baselines } = await adminDb.rpc(
  'admin_get_player_baselines',
  { p_player_ids: playerIds }
);

const baselineMap = new Map(
  baselines.map(b => [b.player_id, b])
);

// Then in outlier detection:
for (const round of completedRounds) {
  const baseline = baselineMap.get(round.player_id);
  if (!baseline) continue; // Not enough rounds for IQR

  if (round.total_score < baseline.lower_fence_score ||
      round.total_score > baseline.upper_fence_score) {
    outliers.push({
      player_id: round.player_id,
      round_id: round.round_id,
      field: 'Score (IQR outlier)',
      value: round.total_score,
      threshold: round.total_score > baseline.upper_fence_score
        ? baseline.upper_fence_score
        : baseline.lower_fence_score,
      // ...
    });
  }
}
```

---

## 5. Cache Divergence Tracing

### Current limitation

Today, `TracerStatsAccuracy` shows aggregate cache vs live divergence per player: "cached_scoring_avg is 78.4 but live is 79.1". The admin cannot tell **which rounds** are responsible for the drift.

### Strategy: Three-level divergence detection

#### Level 1: Round count divergence (already implemented)

`cached_rounds !== live_rounds` -- the cache includes a different number of rounds than exist as completed in `golf_rounds`.

**Root cause identification** (NEW): Compare `round_ids_included` from `golf_player_stats_cache` against the actual set of completed round IDs. The difference reveals:

```typescript
// Server action logic
const cachedRoundIds = new Set(playerCache.round_ids_included || []);
const liveRoundIds = new Set(
  completedRounds
    .filter(r => r.player_id === playerId)
    .map(r => r.id)
);

const missingFromCache = [...liveRoundIds].filter(id => !cachedRoundIds.has(id));
const extraInCache = [...cachedRoundIds].filter(id => !liveRoundIds.has(id));
```

This tells the admin: "Round X from Jan 15 at Pinehurst is completed but not in the cache" or "Round Y is in the cache but no longer marked completed."

#### Level 2: Round-level value divergence

Fetch both `golf_rounds` and `golf_round_stats_cache` values for the same round and compare.

**Implementation**: Two parallel Supabase queries (not a JOIN, to keep it Supabase-JS friendly):

```typescript
// Query 1: Already have all rounds from getTracerData()
// Query 2: Fetch full round stats cache (not just round_id existence)
const { data: roundStatsCache } = await adminDb
  .from('golf_round_stats_cache')
  .select(`
    round_id,
    player_id,
    total_score,
    total_putts,
    fairways_hit,
    fairways_total,
    greens_hit,
    greens_total,
    strokes_gained_total
  `)
  .in('round_id', completedRoundIds);
```

Then compare in the server action:

```typescript
interface RoundDivergence {
  round_id: string;
  player_id: string;
  round_date: string;
  course_name: string | null;
  fields: {
    field: string;
    live_value: number | null;
    cached_value: number | null;
    delta: number;
  }[];
}

function findRoundDivergences(
  rounds: TracerRoundDetail[],
  cacheMap: Map<string, RoundStatsCache>
): RoundDivergence[] {
  const divergences: RoundDivergence[] = [];

  for (const round of rounds) {
    const cached = cacheMap.get(round.round_id);
    if (!cached) continue; // No cache entry -- already flagged as missing

    const fields: RoundDivergence['fields'] = [];

    // Compare each field
    if (round.total_score !== cached.total_score) {
      fields.push({
        field: 'total_score',
        live_value: round.total_score,
        cached_value: cached.total_score,
        delta: (round.total_score ?? 0) - (cached.total_score ?? 0),
      });
    }
    // ... repeat for total_putts, fairways, GIR, SG ...

    if (fields.length > 0) {
      divergences.push({
        round_id: round.round_id,
        player_id: round.player_id,
        round_date: round.round_date,
        course_name: round.course_name,
        fields,
      });
    }
  }

  return divergences;
}
```

#### Level 3: Hole-sum vs round-total divergence

Using the Tier 1 hole aggregates from Query 2A:

```typescript
// For each round with hole aggregates:
const holeAgg = holeAggMap.get(round.round_id);
if (holeAgg && round.total_score !== null) {
  if (holeAgg.sum_scores !== round.total_score) {
    // Round-level total_score doesn't match sum of hole scores
    // This is the ROOT CAUSE of many cache divergences
  }
  if (holeAgg.sum_putts !== round.total_putts) {
    // Round-level total_putts doesn't match sum of hole putts
  }
}
```

This three-level approach traces divergence from "player aggregate is wrong" down to "this specific round's holes don't sum to the round total."

---

## 6. 9-Hole Handling

### Production schema context

`golf_rounds.holes_played` defaults to 18 but can be 9. The `golf_holes` table has a CHECK constraint `hole_number >= 1 AND hole_number <= 18`.

### Validation threshold differences

| Check | 18-hole threshold | 9-hole threshold |
|-------|-------------------|------------------|
| Expected hole count | 18 | 9 |
| Score absolute max (hard reject) | 150 | 80 |
| Putts absolute max | 54 (3 per hole) | 27 |
| IQR baseline | Computed from 18-hole rounds only | Computed from 9-hole rounds only (if >=3 exist, else skip) |
| Fairway holes expected | ~14 (par 4s and 5s) | ~7 |
| GIR possible | 18 | 9 |
| Score missing hole threshold | Any null score on completed round | Same |

### Implementation

```typescript
const THRESHOLDS = {
  18: {
    maxScore: 150,
    maxPutts: 54,
    maxPuttsPerHole: 5,
    minScorePerHole: 1,
    expectedHoles: 18,
  },
  9: {
    maxScore: 80,
    maxPutts: 27,
    maxPuttsPerHole: 5,
    minScorePerHole: 1,
    expectedHoles: 9,
  },
} as const;

function getThreshold(holesPlayed: number) {
  return holesPlayed === 9 ? THRESHOLDS[9] : THRESHOLDS[18];
}
```

### Hole number validation for 9-hole rounds

For `holes_played = 9`, valid `hole_number` values should be either 1-9 (front nine) or 10-18 (back nine). The diagnostic should flag rounds where `holes_played = 9` but holes span both nines (e.g., holes 1, 2, 3, 10, 11, 12 -- this suggests a data entry error).

This check runs in the server action:

```typescript
if (round.holes_played === 9 && holeAgg) {
  // Check if holes are on a single nine
  // This requires min/max hole_number, which we should add to the aggregate
}
```

**Addition to the RPC aggregate function**:

```sql
MIN(h.hole_number) AS min_hole_number,
MAX(h.hole_number) AS max_hole_number
```

Then: if `max_hole_number - min_hole_number > 8`, the holes span both nines -- flag as anomaly.

---

## 7. Computation Placement (SQL vs Server vs Client)

### Decision matrix

| Computation | Where | Why |
|-------------|-------|-----|
| Per-round hole aggregates (sum, count, anomaly flags) | **SQL (RPC)** | Avoids transferring thousands of hole rows. GROUP BY is what SQL is built for. |
| Per-player IQR baselines (percentiles, fences) | **SQL (RPC)** | `PERCENTILE_CONT` is a native Postgres aggregate. Doing this in JS would require sorting all rounds per player. |
| Round-level cache divergence comparison | **Server action** | Requires comparing data from two different tables (rounds vs cache). Simple field-by-field comparison is trivial in TS. |
| Hole-sum vs round-total mismatch | **Server action** | Combines hole aggregate data (from SQL) with round data (already loaded). One-pass comparison. |
| IQR-based outlier flagging | **Server action** | Takes the baselines (from SQL) and applies them to each round. Loop + comparison. |
| 9-hole threshold selection | **Server action** | Simple conditional logic based on `holes_played`. |
| Per-hole anomaly detection (drill-down) | **Server action** | Runs on the fly when a specific round is opened. Small dataset (9 or 18 rows). |
| Sort, filter, search of results | **Client** | User interactivity (sort columns, filter by player, search). Already the pattern in `TracerDataQuality.tsx`. |
| Completeness heatmap computation | **Client** | Already implemented client-side. With richer data from the server, the `computeCompleteness()` function just needs more input fields. |
| Outlier table rendering + severity coloring | **Client** | Pure presentation. |

### What NOT to compute in SQL

- Complex business logic that changes frequently (threshold tuning, severity classification)
- Anything requiring cross-table JOINs that Supabase RLS would complicate (the RPC functions use `SECURITY DEFINER` to bypass this for admin use)
- UI-specific transformations (flattening for table display, formatting)

---

## 8. Performance Considerations

### Query budget

The current `getTracerData()` makes ~10 parallel queries. The enhanced version should target no more than ~15 total queries in the initial load, staying within the same 2-3 second budget.

### Parallel execution plan

```
Batch 1 (parallel):
  [1] golf_players.select(...)                       -- existing
  [2] golf_rounds.select(...)                        -- existing
  [3] golf_player_stats_cache.select(...)            -- existing, add round_ids_included

Batch 2 (parallel, depends on Batch 1 for round_ids):
  [4] rpc('admin_get_round_hole_aggregates', ...)    -- NEW
  [5] rpc('admin_get_player_baselines', ...)         -- NEW
  [6] golf_round_stats_cache.select(full fields)     -- ENHANCED (was just round_id)
  [7] golf_shots.select('round_id').in(...)          -- existing (shot counts)
  [8] golf_shots + putt_details join                 -- existing
  [9] golf_shots + approach_miss_details join        -- existing
  [10] error_logs queries (3 parallel)               -- existing

Server-side computation (after all queries return):
  - Build hole aggregate map
  - Build baseline map
  - Build round cache divergence map
  - Run outlier detection (IQR-based)
  - Run round-total vs hole-sum checks
  - Run per-hole anomaly summary
  - Compute completeness (enhanced)
  - Generate alerts
```

### Index coverage

All new queries are covered by existing indexes:

| Query | Index used |
|-------|-----------|
| Hole aggregates by round_id | `idx_golf_holes_round` (btree on round_id) |
| Player baselines (grouped by player_id, filtered by status) | `idx_golf_rounds_player_status_date` (composite) |
| Round stats cache by round_id | `idx_golf_round_stats_cache_round` (btree on round_id) |

No new indexes needed.

### Payload size estimates

| Data | Rows (typical team, full season) | Estimated payload |
|------|----------------------------------|-------------------|
| Players | 15 | 2 KB |
| Rounds | 200-400 | 30-50 KB |
| Hole aggregates (RPC) | 200-400 (one per round) | 15-30 KB |
| Player baselines (RPC) | 15 (one per player) | 3 KB |
| Round stats cache | 200-400 | 25-40 KB |
| Error logs | 100 (capped) | 15 KB |
| **Total** | | **~100-150 KB** |

This is well within acceptable limits for a server action response.

### Caching and staleness

The diagnostic data is point-in-time and does not need real-time updates. The existing 60-second auto-refresh interval in `TracerTab` is appropriate. No additional caching layer is needed.

### Guardrails for very large datasets

If a deployment has >1,000 completed rounds (unlikely for a single college golf team, but possible for a multi-team instance):

1. **Scope to recent season**: Add an optional date filter (default: current season, Aug 1 - present). The `admin_get_player_baselines` RPC already scopes to completed rounds, so adding a date range is a simple `WHERE` clause.
2. **Batch the UUID array**: If `round_ids` exceeds 1,000 entries, split into batches of 500 for the hole aggregate RPC.
3. **Pagination in the UI**: The client-side table already supports sorting; add optional pagination if >100 rows.

---

## 9. Implementation Plan

### Phase 1: RPC functions (migration file)

Create a single migration file with both RPC functions:

- `admin_get_round_hole_aggregates(UUID[])` -- Tier 1 hole aggregates
- `admin_get_player_baselines(UUID[])` -- IQR baselines

Both are `SECURITY DEFINER` (admin only, bypasses RLS).

**File**: `supabase/migrations/YYYYMMDD_admin_diagnostic_rpcs.sql`

### Phase 2: Enhanced server action

Modify `src/app/golf/actions/admin-tracer-data.ts`:

1. **Extend `TracerRoundDetail`** interface with new fields:
   - `holes_played: number` (already mapped as `expected_holes`)
   - `sum_hole_scores: number | null`
   - `sum_hole_putts: number | null`
   - `score_hole_mismatch: boolean`
   - `putts_hole_mismatch: boolean`
   - `null_hole_scores: number`
   - `null_hole_putts: number`
   - `putts_gte_score_holes: number`
   - `blow_up_holes: number`

2. **Add new types**:
   - `PlayerBaseline` (IQR data)
   - `RoundDivergence` (cache divergence detail)
   - `DiagnosticSummary` (counts of each issue type)

3. **Add to `TracerData`** return type:
   - `playerBaselines: Record<string, PlayerBaseline>`
   - `roundDivergences: RoundDivergence[]`
   - `diagnosticSummary: DiagnosticSummary`

4. **Integrate new RPC calls** into the existing parallel batch structure.

5. **Enhance `getTracerRoundDiagnostic()`** to return per-hole anomaly flags.

### Phase 3: Enhanced client utilities

Modify `src/app/golf/admin/components/tracer/tracer-utils.ts`:

1. **Replace `detectOutliers()`** with IQR-based version using server-provided baselines.
2. **Enhance `computeCompleteness()`** with hole-level data (null scores, null putts per round).
3. **Add `computeRoundIntegrityIssues()`** for round-total vs hole-sum mismatches.
4. **Add `generateDivergenceAlerts()`** for cache divergence root cause alerts.

### Phase 4: Enhanced UI components

Modify `src/app/golf/admin/components/tracer/TracerDataQuality.tsx`:

1. Add "Round Integrity" section (score/putt mismatches).
2. Enhance outlier table with IQR context (show player mean, fence values).
3. Add "Cache Divergence" section with per-round drill-down.
4. Add 9-hole badge/filter to round lists.

---

## Appendix: New Types

```typescript
// --- Player Baselines (from RPC) ---

export interface PlayerBaseline {
  player_id: string;
  n_rounds: number;
  mean_score: number;
  stddev_score: number;
  q1_score: number;
  q3_score: number;
  iqr_score: number;
  lower_fence_score: number;
  upper_fence_score: number;
  mean_putts: number;
  stddev_putts: number;
  q1_putts: number;
  q3_putts: number;
  iqr_putts: number;
  lower_fence_putts: number;
  upper_fence_putts: number;
  mean_sg: number | null;
  stddev_sg: number | null;
}

// --- Hole Aggregates (from RPC) ---

export interface RoundHoleAggregate {
  round_id: string;
  hole_count: number;
  sum_scores: number | null;
  sum_putts: number | null;
  sum_fairways_hit: number;
  sum_fairway_holes: number;
  sum_gir: number;
  null_score_count: number;
  null_putts_count: number;
  putts_gte_score_count: number;
  blow_up_hole_count: number;
  min_hole_score: number | null;
  max_hole_score: number | null;
  min_hole_number: number;
  max_hole_number: number;
}

// --- Round Divergence ---

export interface RoundDivergence {
  round_id: string;
  player_id: string;
  round_date: string | null;
  course_name: string | null;
  holes_played: number;
  fields: {
    field: string;
    live_value: number | null;
    cached_value: number | null;
    delta: number;
  }[];
}

// --- Diagnostic Summary ---

export interface DiagnosticSummary {
  totalCompletedRounds: number;
  roundsWithHoleMismatch: number;       // score sum != total_score
  roundsWithMissingHoleData: number;    // null scores or putts on holes
  roundsWithImpossibleHoles: number;    // putts >= score
  roundsWithCacheDivergence: number;    // round cache != live round
  iqrOutlierCount: number;             // rounds outside IQR fences
  nineHoleRoundCount: number;
  playersWithNoBaseline: number;       // < 3 rounds, can't compute IQR
}

// --- Enhanced Outlier (replaces current) ---

export interface EnhancedOutlier {
  player_id: string;
  player_name: string;
  round_id: string;
  round_date: string | null;
  course_name: string | null;
  holes_played: number;
  category: 'iqr_score' | 'iqr_putts' | 'absolute' | 'hole_anomaly' | 'integrity';
  field: string;
  value: number;
  // For IQR outliers, shows the fence; for absolute, shows the threshold
  threshold: number;
  // Context for IQR outliers
  player_mean?: number;
  player_q1?: number;
  player_q3?: number;
  severity: 'warning' | 'critical';
}
```

---

## Appendix: Complete RPC Migration SQL

```sql
-- ============================================================================
-- Migration: admin_diagnostic_rpcs.sql
-- Purpose: RPC functions for enhanced admin diagnostics (Data Quality tab)
-- Note: SECURITY DEFINER -- admin use only, bypasses RLS
-- ============================================================================

-- ============================================================================
-- 1. Per-round hole aggregates
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_get_round_hole_aggregates(p_round_ids UUID[])
RETURNS TABLE (
  round_id              UUID,
  hole_count            INTEGER,
  sum_scores            INTEGER,
  sum_putts             INTEGER,
  sum_fairways_hit      INTEGER,
  sum_fairway_holes     INTEGER,
  sum_gir               INTEGER,
  null_score_count      INTEGER,
  null_putts_count      INTEGER,
  putts_gte_score_count INTEGER,
  blow_up_hole_count    INTEGER,
  min_hole_score        INTEGER,
  max_hole_score        INTEGER,
  min_hole_number       INTEGER,
  max_hole_number       INTEGER
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql STABLE
AS $$
  SELECT
    h.round_id,
    COUNT(*)::INTEGER                                                         AS hole_count,
    SUM(h.score)::INTEGER                                                     AS sum_scores,
    SUM(h.putts)::INTEGER                                                     AS sum_putts,
    SUM(CASE WHEN h.fairway_hit THEN 1 ELSE 0 END)::INTEGER                 AS sum_fairways_hit,
    COUNT(CASE WHEN h.par > 3 THEN 1 END)::INTEGER                          AS sum_fairway_holes,
    SUM(CASE WHEN h.gir THEN 1 ELSE 0 END)::INTEGER                         AS sum_gir,
    COUNT(CASE WHEN h.score IS NULL THEN 1 END)::INTEGER                     AS null_score_count,
    COUNT(CASE WHEN h.putts IS NULL THEN 1 END)::INTEGER                     AS null_putts_count,
    COUNT(CASE WHEN h.putts IS NOT NULL AND h.score IS NOT NULL
               AND h.putts >= h.score THEN 1 END)::INTEGER                  AS putts_gte_score_count,
    COUNT(CASE WHEN h.par IS NOT NULL AND h.score IS NOT NULL
               AND h.score > h.par + 4 THEN 1 END)::INTEGER                 AS blow_up_hole_count,
    MIN(h.score)::INTEGER                                                     AS min_hole_score,
    MAX(h.score)::INTEGER                                                     AS max_hole_score,
    MIN(h.hole_number)::INTEGER                                               AS min_hole_number,
    MAX(h.hole_number)::INTEGER                                               AS max_hole_number
  FROM golf_holes h
  WHERE h.round_id = ANY(p_round_ids)
  GROUP BY h.round_id;
$$;

COMMENT ON FUNCTION admin_get_round_hole_aggregates(UUID[]) IS
  'Returns per-round hole aggregates for admin diagnostics. Includes anomaly detection signals.';

-- ============================================================================
-- 2. Per-player IQR baselines (18-hole rounds only)
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_get_player_baselines(p_player_ids UUID[])
RETURNS TABLE (
  player_id          UUID,
  n_rounds           INTEGER,
  mean_score         NUMERIC,
  stddev_score       NUMERIC,
  q1_score           NUMERIC,
  q3_score           NUMERIC,
  iqr_score          NUMERIC,
  lower_fence_score  NUMERIC,
  upper_fence_score  NUMERIC,
  mean_putts         NUMERIC,
  stddev_putts       NUMERIC,
  q1_putts           NUMERIC,
  q3_putts           NUMERIC,
  iqr_putts          NUMERIC,
  lower_fence_putts  NUMERIC,
  upper_fence_putts  NUMERIC,
  mean_sg            NUMERIC,
  stddev_sg          NUMERIC
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql STABLE
AS $$
  WITH player_stats AS (
    SELECT
      r.player_id,
      COUNT(*)::INTEGER                                                        AS n_rounds,
      AVG(r.total_score)                                                       AS mean_score,
      STDDEV(r.total_score)                                                    AS stddev_score,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY r.total_score)             AS q1_score,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY r.total_score)             AS q3_score,
      AVG(r.total_putts)                                                       AS mean_putts,
      STDDEV(r.total_putts)                                                    AS stddev_putts,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY r.total_putts)             AS q1_putts,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY r.total_putts)             AS q3_putts,
      AVG(r.strokes_gained_total)                                              AS mean_sg,
      STDDEV(r.strokes_gained_total)                                           AS stddev_sg
    FROM golf_rounds r
    WHERE r.player_id = ANY(p_player_ids)
      AND r.status = 'completed'
      AND r.total_score IS NOT NULL
      AND COALESCE(r.holes_played, 18) = 18
    GROUP BY r.player_id
    HAVING COUNT(*) >= 3
  )
  SELECT
    ps.player_id,
    ps.n_rounds,
    ROUND(ps.mean_score, 1),
    ROUND(ps.stddev_score, 2),
    ROUND(ps.q1_score, 1),
    ROUND(ps.q3_score, 1),
    ROUND(ps.q3_score - ps.q1_score, 1),
    ROUND(ps.q1_score - 1.5 * (ps.q3_score - ps.q1_score), 1),
    ROUND(ps.q3_score + 1.5 * (ps.q3_score - ps.q1_score), 1),
    ROUND(ps.mean_putts, 1),
    ROUND(ps.stddev_putts, 2),
    ROUND(ps.q1_putts, 1),
    ROUND(ps.q3_putts, 1),
    ROUND(ps.q3_putts - ps.q1_putts, 1),
    ROUND(ps.q1_putts - 1.5 * (ps.q3_putts - ps.q1_putts), 1),
    ROUND(ps.q3_putts + 1.5 * (ps.q3_putts - ps.q1_putts), 1),
    ROUND(ps.mean_sg, 2),
    ROUND(ps.stddev_sg, 2)
  FROM player_stats ps;
$$;

COMMENT ON FUNCTION admin_get_player_baselines(UUID[]) IS
  'Returns per-player IQR baselines for outlier detection. Requires >= 3 completed 18-hole rounds.';
```
