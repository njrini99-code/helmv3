# Shot Tracking System — Deep Scrub Report

> Compiled from live production database queries + full codebase trace. March 14, 2026.

---

## Production Data Summary

| Table | Rows | Columns | Purpose |
|-------|------|---------|---------|
| `golf_rounds` | 28 | 37 | Round headers (27 completed, 1 in_progress) |
| `golf_holes` | 477 | 14 | Hole-level scoring data |
| `golf_shots` | 1,924 | 27 | Shot-level tracking data |
| `putt_details` | 637 | 8 | Extended putt analytics |
| `approach_miss_details` | 143 | 7 | Approach miss patterns |
| `golf_round_stats_cache` | 27 | 34 | Per-round computed stats |
| `golf_player_stats_cache` | 9 | 77 | Per-player aggregated stats |
| `golf_courses` | 15 | 10 | Course metadata |
| `golf_course_holes` | 0 | 7 | Hole-level course config (EMPTY) |
| `golf_round_reviews` | 19 | 39 | AI-generated round reviews |

---

## 1. Complete Round Lifecycle

### Phase 1: New Round Creation

**UI**: `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx` (2549 lines)

**Steps**:
1. Player selects course (name, city, state, rating, slope, tees)
2. Selects round type: `practice` | `tournament` | `qualifier`
3. Configures holes (9 or 18), sets par/yardage per hole
4. Can load saved course via `getPlayerSavedCourses()` from `golf.ts`

**Round created**: On first auto-save, round inserted into `golf_rounds` with `status='in_progress'`

### Phase 2: Shot Tracking (In-Progress)

**UI**: `ShotTrackingComprehensive` component (2001 lines) — handles one hole at a time

**Per shot captured**:
- `shot_type`: tee | approach | around_green | putting
- `club_type`: driver | non_driver | putter
- `lie_before` / `lie_after`: tee | fairway | rough | sand | green | other | recovery | hazard
- `distance_to_hole_before` / `distance_to_hole_after` (with units: yards or feet)
- `result`: fairway | rough | green | sand | hole | other
- `miss_direction`: left | right | short | long | short_left | short_right | long_left | long_right
- Putts: `putt_made`, `putt_distance_feet`, `putt_break`, `putt_slope`
- Penalties: `is_penalty`, `penalty_type`

**Per hole captured**:
- `par`, `score`, `putts`, `yardage`
- `fairway_hit` (null on par 3s), `gir`, `up_and_down`, `sand_save`
- `penalty_strokes`

### Phase 3: Auto-Save (Continuous)

**Hook**: `src/hooks/golf/use-auto-save-round.ts` (445 lines)

| Parameter | Value |
|-----------|-------|
| Debounce delay | 1.5 seconds |
| Periodic interval | 10 seconds |
| Offline fallback | localStorage + IndexedDB |
| Conflict detection | Optimistic locking via `updated_at` |

**Save targets (priority order)**:
1. **Database** via RPC `save_partial_round_atomic()` — deletes all holes/shots, re-inserts current state
2. **localStorage** — backup if DB fails
3. **IndexedDB** — offline sync queue

**RPC `save_partial_round_atomic()`** (SECURITY DEFINER, 20s timeout):
- Validates player ownership and round not completed
- Optimistic locking: rejects if `updated_at > expected_updated_at`
- DELETE all existing holes/shots for round, then re-inserts current state
- Inserts `putt_details` and `approach_miss_details` with sanitization
- Returns `{ success, round_id, updated_at, warnings[] }`

### Phase 4: Round Submission

**Action**: `submitGolfRoundComprehensive()` in `src/app/golf/actions/golf.ts` (lines 912-1704)

**Validation**:
- Zod schema validation on all input
- All holes must have score and putts (no nulls)
- Score must be >= hole count
- At least 1 putt across all holes
- Round not already completed
- Player owns the round

**Calculations performed client-side before RPC**:
- `totalScore`, `scoreToPar`, `frontNine`, `backNine`
- `totalFairwaysHit` / `totalFairways`
- GIR computed from shots: `calculateGirFromShots(hole.shots, hole.par)`
- `totalPenalties`

**RPC `submit_round_atomic()`** (SECURITY DEFINER, 30s timeout):
- Additional server-side validation:
  - Hole count matches `holes_played`
  - Continuous hole numbers (1 to N)
  - No null scores or putts
  - Score sum matches `total_score`
  - Putt sum matches `total_putts`
- Sets `status = 'completed'`, clears `draft_data`
- DELETE + re-insert all holes, shots, putt_details, approach_miss_details
- Non-critical detail inserts wrapped in savepoints (won't fail the round)

**Fallback**: `submitRoundDirectFallback()` — direct SQL if RPC fails

### Phase 5: Post-Submission Pipeline (Fire-and-Forget)

Three async operations triggered after successful submission:

#### A. Stats Cache Invalidation
**Function**: `invalidateOnRoundComplete()` in `src/lib/cache/golf-stats-calculator.ts`

```
1. Invalidate Redis cache for player
2. RPC: mark_player_stats_stale(player_id)
3. RPC: recalculate_round_strokes_gained(round_id)
4. RPC: update_player_stats_strokes_gained(player_id)
5. RPC: refresh_player_stats_cache(player_id)
6. Validate cache matches live data
7. Retry once on failure
```

#### B. CoachHelm AI Insights
**Function**: `triggerPlayerInsightsAfterRound()` in `src/app/golf/actions/insights.ts`

```
1. Check CoachHelm enabled for player/team
2. Load coach philosophy (priority weights, confidence threshold)
3. Run V2 engine: analyzePlayer() with patterns, causal, predictions
4. Filter insights by confidence threshold
5. Insert into golf_coach_insights
6. Log in golf_insight_generation_log
```

#### C. Next.js Cache Revalidation
```
revalidatePath('/golf/dashboard')
revalidatePath('/golf/dashboard/rounds')
revalidatePath('/golf/dashboard/stats')
```

### Phase 6: Round Review (On Demand)

**Action**: `generateAndStoreRoundReview()` in `src/app/golf/actions/round-review-system.ts`

Auto-triggered when user opens review page if no review exists.

```
1. Fetch all shots + holes for round
2. Build rule-based review content (scoring, putting, driving, short game analysis)
3. If CoachHelm V2 enabled: run generateRoundReview() for AI enhancement
4. Merge V2 into review content
5. Upsert into golf_round_reviews
```

---

## 2. Database Trigger Chain

When `golf_rounds.status` changes to `'completed'`:

```
TRIGGER 1: trg_calculate_strokes_gained (BEFORE UPDATE on status)
  → calculate_strokes_gained_on_round_complete()
    → calculate_round_strokes_gained(round_id)
      → Loops through all shots
      → Computes SG per shot using get_expected_strokes()
      → Writes SG totals back to golf_rounds row (BEFORE trigger modifies NEW)

TRIGGER 2: trg_update_round_stats_cache (AFTER INSERT/UPDATE on completed rounds)
  → update_round_stats_cache()
    → Aggregates from golf_holes: eagles, birdies, pars, bogeys, etc.
    → Computes front/back nine, one-putts, three-putts
    → Calculates driving distance from golf_shots
    → Upserts into golf_round_stats_cache

When golf_round_stats_cache is modified:

TRIGGER 3: trg_update_player_stats_cache (AFTER INSERT/UPDATE/DELETE)
  → update_player_stats_cache()
    → Aggregates ALL round_stats_cache rows for player
    → Computes scoring average (18-hole rounds only), percentages, totals
    → Upserts into golf_player_stats_cache

TRIGGER 4: trg_update_player_stats_cache_enhanced (AFTER INSERT/UPDATE/DELETE)
  → update_player_stats_cache_enhanced()
    → Computes last_5_average, last_10_average
    → Calculates improvement_trend and trend_direction
    → Updates season-specific fields (rounds_this_season, season_start_date)
    → Stores round_ids_included array

TRIGGER 5: trg_update_player_strokes_gained (AFTER INSERT/UPDATE/DELETE)
  → update_player_stats_strokes_gained()
    → Aggregates SG totals and per-round averages from round_stats_cache
    → Updates sg_total_per_round, sg_tee_per_round, etc. in player_stats_cache
```

---

## 3. Strokes Gained System

### Two SG calculation paths exist in the database:

**Path A: `calculate_round_strokes_gained(round_id)`** — Used by BEFORE trigger
- Simple loop through `golf_shots` joined via `golf_holes`
- Uses `get_expected_strokes(lie, distance, is_putting)` — lookup table with CASE statements
- Coarse distance buckets (25-50 yard ranges)
- Skips shots without `distance_to_hole_before`

**Path B: `recalculate_round_strokes_gained(round_id)`** — Used by post-submission invalidation
- More sophisticated: uses CTEs with window functions
- Uses `sg_expected_strokes(lie, distance_yards)` — interpolation with fine-grained arrays (30-38 data points per lie)
- Fallback to next shot's `distance_to_hole_before` via LEAD() window function
- Falls back to `sg_estimate_from_holes()` if no shot-level data available
- Uses `sg_normalize_lie()` for consistent lie mapping
- Upserts into `golf_round_stats_cache`

### Two SG expected strokes functions:

**`get_expected_strokes(lie, distance, is_putting)`** — Coarse, CASE-based
- Putting: 18 buckets (2ft to 60+ft)
- Fairway/tee: 14 buckets (100yd to 500+yd)
- Rough: 7 buckets
- Sand: 6 buckets

**`sg_expected_strokes(lie, distance_yards)`** — Fine-grained, interpolated
- Green: 30 data points (0-90ft), with LINEAR INTERPOLATION
- Tee: 18 data points (260-600yd)
- Fairway: 38 data points (20-275yd)
- Rough: 38 data points
- Sand: 18 data points (3-40yd)

### Client-side SG code:

**`src/lib/golf/strokes-gained.ts`** — NOT used for official calculation
- Has its own benchmark data in `sg-benchmarks.ts`
- Used for display/preview only; server is authoritative

---

## 4. Production Data Quality Audit

### Shot Data Completeness (1,924 total shots):

| Field | Has Data | % |
|-------|----------|---|
| `distance_to_hole_before` | 1,924 | 100% |
| `distance_to_hole_after` | 1,924 | 100% |
| `lie_before` | 1,924 | 100% |
| `lie_after` | 1,841 | 95.7% |
| `shot_type` | 1,924 | 100% |
| `club_type` | 1,924 | 100% |
| `shot_distance` | 1,619 | 84.1% |
| `miss_direction` | 670 | 34.8% |
| `club_used` | **0** | **0%** |
| Putting shots | 831 | 43.2% of all |
| Putts with `putt_distance_feet` | 831 | 100% of putts |
| Putts with `putt_break` | 702 | 84.5% of putts |

### Data Integrity Check:
- **Score/putt mismatches**: 0 (all completed rounds match hole sums)
- **Orphan shots**: 0 (all shots have valid round_id)
- **Orphan holes**: 0
- **Orphan round_stats_cache**: 0
- **Orphan player_stats_cache**: 0
- **Stuck rounds**: 1 (status='in_progress')

### Detail Tables:
- **putt_details**: 637 records (76.7% of putting shots have extended details)
- **approach_miss_details**: 143 records (13.1% of non-putting shots)

---

## 5. Bugs & Deficiencies Found

### BUG 1: SG = 0.00 on 7 Completed Rounds (CRITICAL)

**Affected rounds**: 7 of 28 completed rounds have `strokes_gained_total = 0.00`

| Round | Course | Score | Holes | SG Total | SG Breakdown | Shots w/Distance |
|-------|--------|-------|-------|----------|-------------|-----------------|
| 387d62d5 | Gg | 28 | 9 | 0.00 | 0/0/0/0 | 28 |
| 03b0ea5d | Forest Creek | 83 | 18 | 0.00 | 0/0/0/0 | 83 |
| 62eda8f8 | Demo National | 77 | 18 | 0.00 | NULL breakdown | 77 |
| a459e349 | Demo National | 77 | 18 | 0.00 | NULL breakdown | 77 |
| 1463e126 | Demo National | 74 | 18 | 0.00 | NULL breakdown | 74 |
| bc24381f | Demo National | 77 | 18 | 0.00 | NULL breakdown | 77 |
| 03c14dda | The Cardinal | 36 | 9 | 0.00 | 0/0/0/0 | 36 |

All have full shot data with distances. The "Demo National" rounds have `strokes_gained_total = 0.00` but SG breakdown columns are NULL — suggesting `calculate_round_strokes_gained()` returned zeros or was never triggered properly for these older rounds. The 2 "Forest Creek"/"Gg"/"Cardinal" rounds computed 0.00 for all categories (suggesting the trigger ran but calculated 0).

**Root cause hypothesis**: The BEFORE trigger `calculate_strokes_gained_on_round_complete()` uses the simpler `calculate_round_strokes_gained()` function, which may fail silently if shot data doesn't have the expected `hole_id` join path. The RPC joins `golf_shots s JOIN golf_holes h ON h.id = s.hole_id WHERE h.round_id = p_round_id` — but during `submit_round_atomic`, holes are deleted and re-inserted. The BEFORE trigger fires BEFORE the new holes are inserted, so the join finds no matching holes and returns 0.

**Impact**: These players' SG stats in `golf_player_stats_cache` are distorted by zero-SG rounds pulling averages toward 0. The post-submission `recalculate_round_strokes_gained()` should fix this, but may have also failed or not been called for older rounds.

### BUG 2: `club_used` Column Always NULL (DEAD COLUMN)

`golf_shots.club_used` has 0% population across all 1,924 shots. The system uses `club_type` instead (driver | non_driver | putter). The `club_used` column was intended for specific club names (e.g., "7-iron", "3-wood") but is never populated by the submission flow.

**Impact**: Low — `club_type` provides the needed categorization. But `club_used` is dead schema.

### BUG 3: `golf_course_holes` Table Empty (UNUSED)

The `golf_course_holes` table has 0 rows despite 15 courses existing in `golf_courses`. Course hole data (par, yardage) is stored in `golf_holes` per-round instead. The `golf_course_holes` table exists but is never populated — course templates use `golf_saved_courses` or similar.

**Impact**: No reusable hole configuration data. Each round stores its own pars/yardages.

### BUG 4: Dual SG Computation Systems (INCONSISTENCY)

Two independent SG expected-strokes lookup functions exist in the database:
- `get_expected_strokes()` — coarse, used by trigger
- `sg_expected_strokes()` — fine-grained with interpolation, used by `recalculate_round_strokes_gained()`

Plus a third in the codebase:
- `src/lib/golf/strokes-gained.ts` + `sg-benchmarks.ts` — client-side

These use **different benchmark data** and **different interpolation methods**, meaning SG values can differ depending on which path calculated them.

**Impact**: Inconsistent SG values. The trigger uses coarse buckets (can be off by 0.05-0.10 per shot), while the recalculation uses interpolation (more accurate).

### BUG 5: `save_partial_round_atomic` Deletes All Data on Every Save

The auto-save RPC (called every 10 seconds) does:
```sql
DELETE FROM golf_shots WHERE round_id = p_round_id;
DELETE FROM golf_holes WHERE round_id = p_round_id;
-- Then re-inserts everything
```

This is a DELETE-ALL + RE-INSERT pattern on every auto-save. For an 18-hole round with 72+ shots, this means:
- ~90 DELETE operations
- ~90 INSERT operations
- Every 10 seconds

**Impact**: Excessive write I/O. No real data integrity benefit since optimistic locking already prevents conflicts. Could cause transient data loss if the process crashes between DELETE and INSERT.

### BUG 6: Three Player Stats Triggers Fire on Same Event

When `golf_round_stats_cache` is modified, THREE triggers fire:
1. `trg_update_player_stats_cache` → `update_player_stats_cache()`
2. `trg_update_player_stats_cache_enhanced` → `update_player_stats_cache_enhanced()`
3. `trg_update_player_strokes_gained` → `update_player_stats_strokes_gained()`

All three update `golf_player_stats_cache` for the same player. This means 3 separate UPDATE operations on the same row, with potential race conditions if they run concurrently.

**Impact**: Redundant computation. The "enhanced" trigger recalculates fields that the base trigger already computed. The SG trigger only needs to run after the base trigger.

### DEFICIENCY 1: No `completed_at` Timestamp

`golf_rounds` has `created_at` and `updated_at` but no `completed_at`. When a round is submitted, `updated_at` gets set to now(), but there's no explicit completion timestamp. This makes it impossible to distinguish "round was edited after completion" from "round was just completed."

### DEFICIENCY 2: No Round Status History

There's no audit trail for round status changes. If a round goes from `in_progress` → `completed`, there's no record of when or what triggered it. The `updated_at` changes on every auto-save, obscuring the completion event.

### DEFICIENCY 3: Scoring Average Only Counts 18-Hole Rounds

In `update_player_stats_cache()`:
```sql
SELECT COUNT(*), SUM(r.total_score), SUM(r.score_to_par)
INTO v_rounds_18, v_total_score_18, v_score_to_par_18
FROM golf_rounds r
WHERE r.player_id = v_player_id
  AND r.status = 'completed'
  AND r.total_score IS NOT NULL
  AND COALESCE(r.holes_played, 18) = 18;
```

9-hole rounds are excluded from scoring average. For players who primarily play 9-hole rounds, their scoring average will be NULL or based on only their 18-hole rounds.

### DEFICIENCY 4: No Shot-Level Validation

Neither `submit_round_atomic` nor `save_partial_round_atomic` validates shot data consistency:
- No check that shot distances decrease toward the hole
- No check that lie_before matches previous shot's lie_after
- No check that shot_count matches hole score
- No check for impossible distances (e.g., 500-yard putt)

### DEFICIENCY 5: `miss_direction` Only 34.8% Populated

Over 65% of shots have no miss direction data. This limits the value of approach miss pattern analysis and the `approach_miss_details` table (only 143 records vs 1,093 non-putting shots).

---

## 6. RLS Policies Summary

All shot tracking tables have comprehensive RLS:

| Table | Player (own) | Coach (team) | Admin | Teammate |
|-------|-------------|-------------|-------|----------|
| `golf_rounds` | CRUD | CRUD (if team_id set) | SELECT | SELECT |
| `golf_holes` | CRUD | CRUD (if team_id set) | - | SELECT |
| `golf_shots` | CRUD | CRUD (if team_id set) | SELECT | SELECT |
| `putt_details` | CRUD | SELECT | - | - |
| `approach_miss_details` | CRUD | SELECT | - | - |
| `golf_round_stats_cache` | SELECT | ALL (manage) | - | - |
| `golf_player_stats_cache` | SELECT | ALL (manage) | SELECT | - |

**Note**: Both atomic RPCs use `SECURITY DEFINER` to bypass RLS during execution.

---

## 7. Index Coverage

### golf_rounds (16 indexes)
- PK: `id`
- Player queries: `player_id`, `player_id + round_date DESC` (completed), `player_id + round_type`
- Status: `status`
- Team: `team_id`, `team_id + created_at DESC`
- Course: `player_id + course_name` (completed)
- Qualifier: `qualifier_id`
- SG: `player_id + strokes_gained_total`

### golf_shots (12 indexes)
- PK: `id`
- Round lookup: `round_id`, `round_id + hole_number`, `round_id + hole_number + shot_number` (UNIQUE)
- Hole lookup: `hole_id`
- Analysis: `shot_type`, `lie_before`, `lie_after`, `result`, `putt_made`
- Putting analysis: composite `(shot_type, putt_made, putt_distance_feet)` WHERE putting
- Distance: `distance_to_hole_before`

### golf_holes (4 indexes)
- PK: `id`
- Round+hole: `round_id + hole_number` (UNIQUE)
- Round lookup: `round_id`

### golf_player_stats_cache (6 indexes)
- PK: `id`
- Player: `player_id` (UNIQUE)
- Refresh: `next_refresh_due` (partial)
- Stale: `is_stale` (partial WHERE true)
- Updated: `updated_at DESC`

---

## 8. Complete Function Registry

### Database RPC Functions (12)

| Function | Args | Returns | Purpose |
|----------|------|---------|---------|
| `submit_round_atomic` | round_id, round_data, holes, shots, putt_details, approach_details | jsonb | Complete round submission in single transaction |
| `save_partial_round_atomic` | round_id, round_data, holes, shots, putt_details, approach_details, expected_updated_at | jsonb | Auto-save in-progress round with optimistic locking |
| `calculate_round_strokes_gained` | round_id | TABLE(sg_total, sg_tee, sg_approach, sg_around_green, sg_putting) | Coarse SG calc (used by trigger) |
| `recalculate_round_strokes_gained` | round_id | void | Fine-grained SG calc + upsert to round_stats_cache |
| `get_expected_strokes` | lie, distance, is_putting | numeric | Coarse expected strokes lookup |
| `sg_expected_strokes` | lie, distance_yards | numeric | Fine-grained interpolated expected strokes |
| `sg_normalize_lie` | lie | text | Normalize lie string to standard set |
| `sg_estimate_from_holes` | round_id | TABLE(sg_off_tee, sg_approach, sg_around_green, sg_putting) | Hole-level SG estimation fallback |
| `refresh_player_stats_cache` | player_id | void | Full cache rebuild from completed rounds |
| `mark_player_stats_stale` | player_id | void | Set is_stale=true on player cache |
| `update_player_stats_strokes_gained` | player_id | void | Update SG aggregates in player cache |
| `get_player_stats_summary` | player_id | TABLE(14 fields) | Read player stats for display |

### Database Triggers (7)

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `trg_calculate_strokes_gained` | golf_rounds | BEFORE UPDATE OF status | `calculate_strokes_gained_on_round_complete()` |
| `trg_update_round_stats_cache` | golf_rounds | AFTER INSERT/UPDATE (completed) | `update_round_stats_cache()` |
| `update_golf_shots_updated_at` | golf_shots | BEFORE UPDATE | `update_updated_at_column()` |
| `trg_update_player_stats_cache` | golf_round_stats_cache | AFTER INSERT/UPDATE/DELETE | `update_player_stats_cache()` |
| `trg_update_player_stats_cache_enhanced` | golf_round_stats_cache | AFTER INSERT/UPDATE/DELETE | `update_player_stats_cache_enhanced()` |
| `trg_update_player_strokes_gained` | golf_round_stats_cache | AFTER INSERT/UPDATE/DELETE | `update_player_stats_strokes_gained()` |
| `update_golf_round_stats_cache_updated_at` | golf_round_stats_cache | BEFORE UPDATE | `update_updated_at_column()` |

### Server Actions (golf.ts — 14 functions)

| Function | Purpose |
|----------|---------|
| `submitGolfRoundComprehensive()` | Main round submission |
| `submitRoundDirectFallback()` | Fallback if RPC fails |
| `savePartialRound()` | Auto-save via RPC |
| `deleteInProgressRound()` | Delete draft round |
| `deleteShot()` | Delete single shot |
| `updateShot()` | Update shot fields |
| `getRoundShotDetails()` | Fetch shot breakdown |
| `getPlayerQualifiers()` | List qualifiers |
| `getNextQualifierRoundNumber()` | Get next round # |
| `getPlayerSavedCourses()` | List saved courses |
| `savePlayerCourse()` | Save course template |
| `touchSavedCourse()` | Update last-used |
| `calculateGirFromShots()` | Compute GIR from shot data |
| `checkRoundStaleness()` | Detect concurrent edits |

### Other Action Files

| File | Key Functions |
|------|--------------|
| `round-drafts.ts` | `saveRoundDraft()`, `loadRoundDraft()`, `clearRoundDraft()` |
| `round-review-system.ts` | `generateAndStoreRoundReview()` |
| `round-reviews.ts` | `createRoundReview()`, `updateRoundReview()` |
| `shot-analytics.ts` | `getPlayerShotAnalytics()` |
| `insights.ts` | `triggerPlayerInsightsAfterRound()` |

### Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useAutoSaveRound` | `src/hooks/golf/use-auto-save-round.ts` | Debounced + interval auto-save |
| `useOfflineSync` | `src/hooks/golf/use-offline-sync.ts` | IndexedDB offline persistence |

### Client Libraries

| File | Purpose |
|------|---------|
| `src/lib/golf/strokes-gained.ts` | Client-side SG preview (not authoritative) |
| `src/lib/golf/sg-benchmarks.ts` | PGA Tour benchmark data |
| `src/lib/cache/golf-stats-calculator.ts` | Cache invalidation + refresh orchestration |

---

## 9. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     ROUND LIFECYCLE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NEW ROUND ──→ IN-PROGRESS ──→ COMPLETED                       │
│     │              │                │                            │
│     │         Auto-Save (10s)       │                            │
│     │              │                │                            │
│     ▼              ▼                ▼                            │
│  golf_rounds   save_partial_    submit_round_                   │
│  (INSERT)      round_atomic     atomic (RPC)                    │
│                   (RPC)              │                            │
│                    │                 ├─→ golf_rounds (completed) │
│                    │                 ├─→ golf_holes (INSERT)     │
│                    │                 ├─→ golf_shots (INSERT)     │
│                    │                 ├─→ putt_details (INSERT)   │
│                    │                 └─→ approach_miss_details   │
│                    │                                             │
│                    ▼                                             │
│              DELETE + RE-INSERT                                  │
│              all holes/shots                                     │
│              (every 10 seconds)                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                TRIGGER CHAIN (on completion)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  golf_rounds.status = 'completed'                               │
│       │                                                         │
│       ├─→ BEFORE: trg_calculate_strokes_gained                  │
│       │     └─→ calculate_round_strokes_gained()                │
│       │          └─→ get_expected_strokes() [coarse]            │
│       │          └─→ Writes SG to golf_rounds.strokes_gained_*  │
│       │                                                         │
│       └─→ AFTER: trg_update_round_stats_cache                  │
│             └─→ update_round_stats_cache()                      │
│                  └─→ Aggregates holes → golf_round_stats_cache  │
│                       │                                         │
│                       ├─→ trg_update_player_stats_cache         │
│                       │    └─→ Full player stats recalc         │
│                       ├─→ trg_update_player_stats_cache_enhanced│
│                       │    └─→ Trends, last5/10, season         │
│                       └─→ trg_update_player_strokes_gained      │
│                            └─→ SG averages for player           │
│                                                                 │
│  POST-SUBMISSION (fire-and-forget from server action):          │
│       ├─→ invalidateOnRoundComplete()                           │
│       │    └─→ recalculate_round_strokes_gained() [fine SG]     │
│       │    └─→ refresh_player_stats_cache()                     │
│       ├─→ triggerPlayerInsightsAfterRound()                     │
│       │    └─→ CoachHelm V2 engine                              │
│       └─→ revalidatePath() [Next.js cache]                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Recommendations

### Critical Fixes
1. **Fix SG = 0 bug**: The BEFORE trigger fires before holes are re-inserted. Either change to AFTER trigger, or have `submit_round_atomic` call `recalculate_round_strokes_gained()` explicitly after all data is inserted.
2. **Consolidate SG functions**: Use only `sg_expected_strokes()` (the interpolated version). Remove `get_expected_strokes()`.
3. **Fix auto-save DELETE-ALL pattern**: Use UPSERT instead of DELETE+INSERT to reduce I/O and eliminate transient data loss risk.

### Important Improvements
4. **Merge 3 player stats triggers into 1**: Combine `update_player_stats_cache`, `enhanced`, and `strokes_gained` into a single trigger function.
5. **Add `completed_at` column** to `golf_rounds`.
6. **Normalize 9-hole scoring**: Include 9-hole rounds in scoring average (normalize to 18-hole equivalent).
7. **Drop `club_used` column** (dead schema) or wire it up to the UI.

### Data Quality
8. **Add shot validation**: Check distance progression, lie consistency, impossible values.
9. **Populate `golf_course_holes`**: Store reusable course configs.
10. **Improve miss_direction capture**: Currently only 34.8% — make it required or auto-derive from lie transitions.
