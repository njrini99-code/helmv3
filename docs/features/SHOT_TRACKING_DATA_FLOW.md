# Shot Tracking Data Flow Verification

> **Superseded (2026-09-01).** This document was last edited 2026-05-27 and is
> kept as historical narrative only. The current-state contract for shot
> tracking — routes, actions, the atomic RPCs, the save/submit result keys
> (`busy`, `retry`, `conflict`, `round_missing`, `invalid_snapshot`), salvage,
> recovery and the sanctioned DELETE-then-INSERT exception — lives in
> `memory/features/shot-tracking.md`. The `026_add_comprehensive_golf_stats.sql`
> migration and `supabase db push` instructions below are stale: migrations are
> applied through reviewed migration files, `supabase db push` is denied by
> `.claude/settings.json`, and the live schema is `src/lib/types/database.ts`.
> The `golf_shots` column list below was corrected against that file on
> 2026-09-01; nothing else in this document has been re-verified.

## ✅ Complete Flow: Shot Tracking → Database → Stats Calculation

### Overview
Every shot taken during a round is captured, stored, and used for comprehensive statistics calculation.

---

## 1. Data Capture (Shot Tracking Component)

**Component:** `/src/components/golf/ShotTrackingComprehensive.tsx`

> **One-Tap live round (2026-09-16).** For an eligible Peek'n Peak Upper round
> (`liveRound` on `FairwayShotTracking`), `OneTapLiveHole` replaces the entry
> screen on package-mapped holes and feeds this same flow: `toRoundShots`
> (`src/lib/golf/one-tap/to-round-shots.ts`) emits ordinary `ShotRecord`s with
> `source: 'one_tap_location'` and provenance, and `HoleStats` through
> `calculateHoleStats` only for a clean cup-marked close. Nothing below changes.

### Data Captured Per Shot
```typescript
{
  shotNumber: number;              // 1, 2, 3, etc.
  shotType: 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty';
  clubType: 'driver' | 'non_driver' | 'putter';
  lieBefore: 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other';
  distanceToHoleBefore: number;    // yards or feet
  distanceUnitBefore: 'yards' | 'feet';
  result: 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty';
  distanceToHoleAfter: number;
  distanceUnitAfter: 'yards' | 'feet';
  shotDistance: number;            // calculated
  missDirection?: string;          // for drives/approaches
  puttBreak?: 'right_to_left' | 'left_to_right' | 'straight';
  puttSlope?: 'uphill' | 'downhill' | 'level' | 'severe';
  isPenalty: boolean;
  penaltyType?: 'ob' | 'water' | 'unplayable' | 'lost';
}
```

### Data Captured Per Hole
```typescript
{
  holeNumber: number;
  par: number;
  yardage: number;
  score: number;
  putts: number;
  fairwayHit: boolean | null;
  greenInRegulation: boolean;

  // Driving stats
  drivingDistance: number | null;
  usedDriver: boolean | null;
  driveMissDirection: string | null;

  // Approach stats
  approachDistance: number | null;
  approachLie: string | null;
  approachProximity: number | null;
  approachMissDirection: string | null;

  // Short game stats
  scrambleAttempt: boolean;
  scrambleMade: boolean;
  sandSaveAttempt: boolean;
  sandSaveMade: boolean;

  // Putting stats
  firstPuttDistance: number | null;
  firstPuttLeave: number | null;
  firstPuttBreak: string | null;
  firstPuttSlope: string | null;
  firstPuttMissDirection: string | null;

  // Special shots
  holedOutDistance: number | null;
  holedOutType: string | null;
  penaltyStrokes: number;

  // All shots for this hole
  shots: ShotRecord[];
}
```

---

## 2. Data Storage (Database)

**Action:** `/src/app/golf/actions/golf.ts` → `submitGolfRoundComprehensive()`

### Table 1: `golf_rounds`
Stores round-level aggregated statistics.

```sql
-- Basic round info
player_id, qualifier_id, course_name, course_city, course_state
course_rating, course_slope, tees_played, round_type, round_date

-- Scoring totals
total_score, total_to_par, total_putts
fairways_hit, fairways_total, greens_in_regulation, greens_total
total_penalties

-- Comprehensive stats (from migration 026)
driving_distance_avg          -- Average drive distance
driving_accuracy              -- Fairway hit percentage
putts_per_gir                 -- Putts per green in regulation
scrambling_attempts           -- Missed GIR count
scrambles_made                -- Successful scrambles
sand_save_attempts            -- Bunker shots
sand_saves_made               -- Successful sand saves
penalty_strokes               -- Total penalties
three_putts                   -- Three-putt count
birdies, eagles, pars, bogeys, double_bogeys_plus
longest_drive                 -- Longest drive in round
longest_putt_made             -- Longest putt made
longest_hole_out              -- Longest hole-out from off green
```

### Table 2: `golf_holes`
Stores hole-by-hole statistics (18 rows per round).

```sql
-- Basic hole info
round_id, hole_number, par, yardage, score, score_to_par, putts
fairway_hit, green_in_regulation

-- Comprehensive stats (from migration 026)
driving_distance              -- Drive distance for this hole
used_driver                   -- Used driver vs 3-wood/hybrid
drive_miss_direction          -- Left/right/straight

approach_distance             -- Distance of approach shot
approach_lie                  -- Lie for approach (fairway/rough/sand)
approach_result               -- Where approach ended up
approach_miss_direction       -- Approach miss pattern
approach_proximity            -- Feet from hole after approach

scramble_attempt              -- Missed GIR
scramble_made                 -- Made par or better after missed GIR
sand_save_attempt             -- In bunker
sand_save_made                -- Up & down from sand
up_and_down_attempt           -- Chip/pitch opportunity
up_and_down_made              -- Successful up & down

penalty_strokes               -- Penalties on this hole

first_putt_distance           -- First putt length (feet)
first_putt_leave              -- Feet remaining after first putt
first_putt_break              -- Break direction
first_putt_slope              -- Uphill/downhill
first_putt_miss_direction     -- Miss pattern

holed_out_distance            -- Distance of hole-out shot (if applicable)
holed_out_type                -- Type of shot holed (chip/pitch/bunker)
```

### Table 3: `golf_shots`
Stores individual shot records (created in migration 026).

```sql
-- Verified against src/lib/types/database.ts on 2026-09-01.
-- Shot identification
id, round_id, hole_id, hole_number, shot_number, created_at, updated_at

-- Shot details
shot_type                     -- tee/approach/around_green/putting/penalty
club_type                     -- driver/non_driver/putter
lie_before                    -- Where shot was taken from ('sand', never 'bunker')
lie_after                     -- Where it lay after (derived server-side)
distance_to_hole_before       -- Distance before shot
distance_unit_before          -- yards/feet
result                        -- Where shot ended up
distance_to_hole_after        -- Distance after shot
distance_unit_after           -- yards/feet
distance_unit                 -- Legacy single unit column (nullable)
shot_distance                 -- How far the shot went

-- Shot characteristics
miss_direction                -- Left/right/straight
putt_break                    -- For putts only
putt_slope                    -- For putts only
putt_distance_feet            -- For putts only (derived when absent)
putt_made                     -- For putts only (derived when absent)
is_penalty                    -- True if penalty stroke
penalty_type                  -- OB/water/unplayable/lost
notes                         -- Free text (nullable)
```

---

## 3. Stats Calculation

**Calculator:** `/src/lib/utils/golf-stats-calculator.ts`

### Input Format
The stats calculator receives data in this format:
```typescript
RoundData[] = [
  {
    id: string;
    roundDate: string;
    courseName: string;
    roundType: 'practice' | 'qualifying' | 'tournament';
    totalScore: number;
    totalToPar: number;
    holes: HoleStats[];  // 18 holes with all captured data
  }
]
```

### Stats Calculated (50+ metrics)

#### Scoring Stats
- Scoring average (overall, by round type, by hole type)
- Best/worst rounds
- Birdies, eagles, pars, bogeys, double+
- Per-round averages
- Streaks (consecutive birdies, consecutive pars)

#### Driving Stats
- Average distance (all clubs, driver only)
- Fairway percentage (overall, by hole type, by club)
- Miss patterns (left vs right %)
- Longest drive

#### Approach Stats
- GIR percentage (overall, by hole type)
- GIR per round
- Proximity to hole (overall, by hole type, by lie, by distance)
- Approach efficiency (strokes to hole out from various distances)

#### Putting Stats
- Putts per round
- Putts per GIR
- Three-putts per round
- Make percentage by distance (9 distance buckets: 0-3', 3-5', 5-10', etc.)
- Proximity after first putt (by distance bucket)
- Putting efficiency (putts to hole out from each distance)
- Miss patterns (short/long/left/right)
- Longest putt made

#### Short Game Stats
- Scrambling percentage (overall, by lie, by distance)
- Sand save percentage
- Around-the-green efficiency (strokes to hole out by distance/lie)
- Longest hole-out

#### Other Stats
- Rounds played
- Holes played
- Total penalties
- Penalties per round
- Current no-3-putt streak
- Longest no-3-putt streak

---

## 4. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Shot Tracking (User plays round)                   │
│ Component: ShotTrackingComprehensive.tsx                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Captures every shot
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Data Submission                                     │
│ Action: submitGolfRoundComprehensive()                      │
│                                                              │
│ Calculates:                                                 │
│ - Round totals (score, putts, fairways, GIRs)              │
│ - Round stats (driving avg, longest drive, etc.)           │
│                                                              │
│ Inserts into:                                               │
│ 1. golf_rounds (1 row with 17 stat columns)                │
│ 2. golf_holes (18 rows with 20+ stat columns each)         │
│ 3. golf_shots (N rows, every shot captured)                │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Data saved to database
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Stats Page Load                                     │
│ Page: /golf/dashboard/stats                                 │
│                                                              │
│ 1. Fetches golf_rounds for player                          │
│ 2. Fetches golf_holes for each round                       │
│ 3. Transforms to RoundData[] format                        │
│ 4. Calls calculateStats(roundsData)                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Passes stats to display
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Stats Display                                       │
│ Component: GolfStatsDisplay.tsx                             │
│                                                              │
│ Shows 4 categories with 50+ metrics:                       │
│ - Scoring (averages, totals, streaks)                      │
│ - Driving (distance, accuracy, patterns)                   │
│ - Approach (GIR, proximity, efficiency)                    │
│ - Putting (make %, efficiency, patterns)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Verification Checklist

### ✅ Shot Tracking Component
- [x] Captures all shot data (type, club, lie, distance, result)
- [x] Captures putt characteristics (break, slope, miss direction)
- [x] Captures penalty information (type, strokes)
- [x] Calculates derived stats (fairway hit, GIR, scrambling, sand saves)
- [x] Exports HoleStats interface with all 22 fields
- [x] Exports ShotRecord array with complete shot history

### ✅ Database Storage
- [x] Migration 026 adds all comprehensive stat columns
- [x] golf_rounds table has 17 comprehensive stat columns
- [x] golf_holes table has 20+ comprehensive stat columns
- [x] golf_shots table created for individual shot storage
- [x] All RLS policies in place for data security
- [x] submitGolfRoundComprehensive saves to all 3 tables

### ✅ Stats Calculation
- [x] calculateStats() processes RoundData[] format
- [x] Calculates 50+ statistics across all categories
- [x] Handles empty rounds (returns zeros/nulls)
- [x] formatStat() and formatStatInt() helpers for display

### ✅ Stats Display
- [x] Always shows 4 category pill filters
- [x] Displays stats even when roundsPlayed = 0
- [x] Each category shows relevant metrics
- [x] Proper formatting for percentages, averages, totals

---

## 6. Known Issues & Fixes

### ✅ FIXED: Column Name Mismatch
**Issue:** Action was trying to insert into `penalties` column, but database uses `penalty_strokes`
**Fix:** Removed duplicate `penalties` insertion (line 209), using `penalty_strokes` on line 225
**Status:** Fixed in commit

### ✅ VERIFIED: All Data Captured
**Shot tracking component captures:**
- Every shot type, club, lie, distance
- Putt break, slope, miss direction
- Penalty strokes and type
- All derived stats (fairway hit, GIR, scrambling, etc.)

### ✅ VERIFIED: All Data Saved
**Database receives:**
- Round aggregates (17 stat columns)
- Hole details (20+ stat columns × 18 holes)
- Individual shots (all shot records)

### ✅ VERIFIED: All Stats Calculable
**Stats calculator can compute:**
- All 50+ statistics from saved round/hole data
- Proper handling of nulls and edge cases
- Correct aggregation across multiple rounds

---

## 7. Migration Status

**Migration 026:** `supabase/migrations_archive/v1_original/026_add_comprehensive_golf_stats.sql`

**To apply migration:**
```bash
# Local Supabase
supabase db push

# Production (Supabase Cloud)
SUPABASE_PROJECT_ID=qmnssrrolpinvwjjnufo supabase db push
```

**To verify migration applied:**
```sql
-- Check golf_rounds columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'golf_rounds'
  AND column_name IN ('driving_distance_avg', 'putts_per_gir', 'scrambling_attempts');

-- Check golf_holes columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'golf_holes'
  AND column_name IN ('driving_distance', 'approach_proximity', 'first_putt_distance');

-- Check golf_shots table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'golf_shots';
```

---

## 8. Testing the Complete Flow

### Test Scenario
1. Navigate to `/golf/dashboard/rounds/new`
2. Enter course information
3. Start round and track all 18 holes
4. For each hole:
   - Track every shot from tee to hole
   - Record putt characteristics
   - Mark penalties if applicable
5. Submit round
6. Verify redirect to `/golf/dashboard/rounds/[id]`
7. Check round detail page shows comprehensive stats
8. Navigate to `/golf/dashboard/stats`
9. Verify all 4 category tabs show calculated statistics

### Expected Results
- ✅ All shots saved to `golf_shots` table
- ✅ All hole stats saved to `golf_holes` table
- ✅ Round aggregates saved to `golf_rounds` table
- ✅ Round detail page displays all comprehensive stats
- ✅ Stats page calculates and displays 50+ metrics
- ✅ Category pills always visible (even with 0 rounds)

---

## Conclusion

**All data is properly captured, stored, and available for stats calculation.**

The complete flow is verified:
1. ✅ Shot tracking component captures every shot variable
2. ✅ Submission action saves to all 3 database tables
3. ✅ Stats calculator processes saved data for 50+ metrics
4. ✅ Stats display shows all categories with proper formatting

**No data loss occurs** - every shot taken is preserved in the database for comprehensive analysis.

---

<!-- BEGIN One-Tap anchors (Peek'n Peak) — added 2026-09-16, Task 13.
     Everything above this marker describes the STANDARD shot tracker and is
     unchanged. This section is additive and describes a separate, parallel
     evidence path that does not alter any of it. -->

## One-Tap anchors (Peek'n Peak)

The One-Tap Live Round pilot is **evidence collection, not a second round
ledger**. Score still lives in `golf_rounds` / `golf_holes` / `golf_shots`
exactly as described above. One-Tap adds three tables that record *where the
ball was*, and an adapter (Task 14) that feeds the existing shot model from
them. Every course other than Peek'n Peak Upper is untouched.

Migration: `supabase/migrations/20260916_peek_n_peak_one_tap.sql`.
**Branch only — not applied to any remote project.**

### Tables

- **`golf_shot_anchors`** — primary key `id`, the client-generated anchor id.
  One tap = one anchor = "the ball is here now". Holds the resolved WGS84 and
  ENU position, the 2x2 ENU covariance, sigma, the calibrated and reported
  uncertainty terms, capture motion, the lie posterior and primary lie, the
  terrain sample, the geometry and terrain versions, the terminal flag and
  method, and the estimator summary.
- **`golf_penalty_events`** — primary key `id`. Penalty strokes as separate
  score facts (section 58). Carries no position data of any kind.
- **`golf_round_course_bindings`** — primary key `round_id`. Which course
  package and geometry version a round's anchors were captured against, and
  whether the round ran in One-Tap mode.

Shots are **derived** between consecutive live anchors and are not stored in
these tables.

### Privacy contract (§71)

**No raw GNSS samples are stored.** The durable record keeps the resolved
position, its covariance and a *summary* of the estimator's evidence — sample
count, rejected residuals, scatter axes, kAcc and its calibration state. There
is no raw-sample column, no breadcrumb, no heading or speed trace, and no code
path that would send one: `ANCHOR_SYNC_COLUMNS` in
`src/lib/golf/one-tap/supabase-sync-transport.ts` is the exact column set the
client sends, and both the transport unit test and the pgTAP suite assert the
column set by equality so any new column fails review. Raw fixes reach only an
opt-in, in-memory calibration sink on the device.

### Sync contract

1. **Local durability precedes "Saved."** The tap writes the anchor to device
   storage first; the outbox only mirrors it. Nothing on the sync path can make
   a mark disappear.
2. **`id` is the only idempotency key.** Every attempt re-sends the whole row
   as an upsert `on conflict (id)`, so N retries converge on one row with one
   final state. `acceptedIds` comes from the ids the server returns, so a
   partial accept leaves the rest queued.
3. **Tombstones synchronize as updates.** Undo sets `deleted_at` and re-queues
   the row. There is no delete call, no delete policy, and `DELETE` is revoked
   from `authenticated` on all three tables.
4. **Retry ladder:** `SYNC_BACKOFF_MS` = 1s / 2s / 5s / 15s / 60s, then the row
   is marked `ERROR` and still retried on the next flush. The ladder is
   in-memory, so a relaunch starts it over — the durable record is the
   repository's.
5. **Anchors flush before penalties**, so the mark a penalty refers to is on
   the server first. `related_anchor_id` is deliberately *not* a foreign key: a
   penalty that could never sync would be a lost stroke.

### Access

Read and write follow the round; One-Tap does not create a second auth domain.

- `public.can_read_golf_round(uuid)` — read. Mirrors the union of
  `golf_rounds`' SELECT policies: the player, a coach who staffs the round's
  team, an **active teammate** on that team, and admin.
- `public.owns_golf_round(uuid)` — write. The player only. A staffing coach can
  read a player's anchors and can never write them.

Both are `STABLE SECURITY DEFINER` with a pinned `search_path` and are not
executable by `anon`. Behavioral coverage:
`supabase/tests/rls/golf_one_tap_anchor_access.sql` (40 assertions).

Unlike `golf_holes` / `golf_shots`, these tables carry **no completed-round
lifecycle guard**: an offline flush that lands after the round is submitted
must still persist, or the outbox loses marks.

<!-- END One-Tap anchors (Peek'n Peak) -->
