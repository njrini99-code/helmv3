# Golf RLS Complete Cleanup Instructions

## Overview
This guide will help you completely remove all existing RLS policies from golf tables before creating new ones.

## Files Created
1. **`supabase/migrations/062_complete_golf_rls_cleanup.sql`** - Cleanup script
2. **`verify-golf-rls-cleanup.sql`** - Verification queries

## Step-by-Step Instructions

### Step 1: Verify Current State (Optional)
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `verify-golf-rls-cleanup.sql`
3. Click "Run"
4. You'll see any existing policies that will be removed

### Step 2: Run the Cleanup Script
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `supabase/migrations/062_complete_golf_rls_cleanup.sql`
3. Click "Run"
4. Wait for completion (should take a few seconds)

### Step 3: Verify Cleanup Was Successful
1. In SQL Editor, run this quick verification query:
```sql
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'golf_%'
GROUP BY tablename;
```
2. **Expected Result**: Should return 0 rows (meaning no policies exist)

### Step 4: Verify RLS is Disabled
1. Run this query:
```sql
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'golf_%'
ORDER BY tablename;
```
2. **Expected Result**: All tables should show `rls_enabled = false`

## What This Script Does

### Tables Cleaned:
- ✅ golf_players
- ✅ golf_coaches
- ✅ golf_teams
- ✅ golf_organizations
- ✅ golf_rounds
- ✅ golf_shots
- ✅ golf_courses
- ✅ golf_events
- ✅ golf_team_members
- ✅ golf_event_participants

### Actions Performed:
1. **Disables RLS** on all golf tables
2. **Drops ALL policies** dynamically (catches any policy names)
3. **Adds comments** to tables noting RLS is disabled
4. **No policies remain** - completely clean slate

## After Cleanup

Once cleanup is complete, you have a clean slate to:
1. Design new RLS policies from scratch
2. Test policies incrementally
3. Apply new policies one table at a time

## Troubleshooting

### If you see policies still exist:
- Re-run the cleanup script
- Check if there are policies on tables not listed above
- Run the verification script to see what remains

### If RLS is still enabled:
- Re-run the cleanup script
- The script includes `IF EXISTS` so it's safe to run multiple times

## Notes
- ⚠️ This removes ALL security policies - tables will be wide open until you add new ones
- ✅ Safe for development environments
- ⚠️ Never run in production without immediately adding new policies
- ✅ Script is idempotent - can run multiple times safely
