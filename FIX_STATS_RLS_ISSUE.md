# Fix Golf Stats Display Issue - RLS Policy Missing

## Problem Identified

**Root Cause**: The `golf_shots` table has Row Level Security (RLS) enabled but **no policy** allowing players to read their own shots.

**Evidence**:
- Frontend query returns: **0 shots** (blocked by RLS)
- Service key query returns: **76 shots** (bypasses RLS) ✅
- Stats calculate perfectly when shots are present ✅

**Result**: Stats display as `null` or `--` because frontend can't fetch shot data.

---

## Solution

Apply RLS policies to allow players (and coaches) to access `golf_shots` data.

### Option 1: Via Supabase Dashboard SQL Editor (RECOMMENDED)

1. Go to: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql
2. Click "New Query"
3. Paste the SQL from `supabase/migrations/049_golf_shots_rls_policy.sql`
4. Click "Run"
5. Refresh your golf stats page

### Option 2: Via Command Line

```bash
# Apply via psql (if connection works)
PGPASSWORD='EHl4yASa9zM1sb1k' psql \
  "postgresql://postgres:EHl4yASa9zM1sb1k@db.dgvlnelygibgrrjehbyc.supabase.co:5432/postgres" \
  -f supabase/migrations/049_golf_shots_rls_policy.sql
```

---

## SQL to Execute

```sql
-- Enable RLS on golf_shots
ALTER TABLE golf_shots ENABLE ROW LEVEL SECURITY;

-- Allow players to read their own shots
CREATE POLICY "Players can read their own shots"
ON golf_shots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

-- Allow coaches to read their team's shots
CREATE POLICY "Coaches can read their team shots"
ON golf_shots FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM golf_rounds
    JOIN golf_players ON golf_players.id = golf_rounds.player_id
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_players.team_id IN (
      SELECT team_id FROM golf_coaches
      WHERE user_id = auth.uid()
    )
  )
);

-- Allow players to insert/update/delete their own shots
CREATE POLICY "Players can insert their own shots"
ON golf_shots FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Players can update their own shots"
ON golf_shots FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Players can delete their own shots"
ON golf_shots FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM golf_rounds
    WHERE golf_rounds.id = golf_shots.round_id
    AND golf_rounds.player_id IN (
      SELECT id FROM golf_players
      WHERE user_id = auth.uid()
    )
  )
);
```

---

## Verification

After applying the policies, the browser console should show:

```
🔵 Fetched shots (raw): 76  ← Changed from 0!
✅ Stats calculated!
📊 Key stats: {
  drivingDistanceAvg: 238.56,
  fairwayPercentage: 50,
  girPercentage: 61.1,
  approachProximityAvg: 16.27,
  scramblingPercentage: 42.9
}
✅ RENDERING GolfStatsDisplay
```

And the stats page will display all metrics correctly.

---

## Other Tables That May Need RLS Policies

While fixing `golf_shots`, also verify these tables have proper RLS:

- `golf_rounds` - ✅ (working, since rounds are fetched successfully)
- `golf_holes` - ✅ (working, since holes are fetched successfully)
- `golf_shots` - ❌ **NEEDS FIX** (this migration)
- `golf_players` - ✅ (working)
- `golf_coaches` - ⚠️ (406 errors, but unrelated to stats)

---

## Summary

**Issue**: Missing RLS policy on `golf_shots` table
**Fix**: Apply migration `049_golf_shots_rls_policy.sql` via Supabase Dashboard
**Result**: Stats will display correctly after policy is applied
**Time to fix**: ~2 minutes
