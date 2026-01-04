# Fix for Golf Class Deletion Error (42P17)

## What We've Done
- ✅ Simplified RLS policies to player-centric approach (migration 056)
- ✅ Separated SELECT/INSERT/UPDATE/DELETE policies (migration 057)
- ✅ Made `created_by` nullable on `golf_events` (players can create without coach)
- ✅ Added semester start date picker
- ✅ Added "Delete All" button
- ✅ Verified DELETE operations work with service role

## Current Issue
Error code `42P17` when deleting classes in browser.
**42P17 = duplicate_object** (not an RLS issue, but a DDL collision)

## Solutions (Try These In Order)

### Option 1: Refresh Your Session (Most Likely Fix) ⭐
1. Sign out of your golf account completely
2. Close all browser tabs with the app
3. Clear browser cache (Cmd+Shift+Delete on Mac, Ctrl+Shift+Delete on Windows)
4. Open a new browser tab
5. Sign back in
6. Go to /golf/dashboard/classes
7. Try deleting a single class first
8. If that works, try "Delete All"

**Why this works:** Auth sessions can cache outdated RLS policy states.

### Option 2: Check Database Policies (If Option 1 Fails)
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Run this query:

```sql
SELECT
  policyname,
  cmd,
  qual::text AS using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'golf_player_classes'
ORDER BY policyname;
```

4. Look for:
   - Duplicate policy names
   - A mix of `FOR ALL` and `FOR SELECT/INSERT/UPDATE/DELETE` on same table
   - Policies with similar but not identical names

5. **If you see duplicates**, go to Option 3.

### Option 3: Nuclear Option - Wipe & Recreate Policies (If Duplicates Found)
1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `fix-rls-completely.sql`
3. Paste and run it
4. This will:
   - Disable RLS temporarily
   - Drop ALL policies on golf_player_classes
   - Re-enable RLS
   - Create clean, separate policies for each operation

```sql
-- You already have this file: fix-rls-completely.sql
-- It safely wipes and recreates all policies
```

### Option 4: Check Application Code (If Still Failing)
The error might be coming from:
- Server actions trying to create database objects
- A migration script running on API requests
- Race condition in calendar sync logic

Check:
1. `src/app/golf/actions/calendar-sync.ts` - Does it run any CREATE statements?
2. Browser Network tab → Look for 500 errors → Check response body for stack trace
3. Supabase Dashboard → Logs → Check for Postgres error logs

## Testing After Fix

1. Go to `/golf/dashboard/classes`
2. Upload a sample schedule (use the existing upload functionality)
3. Set a semester start date
4. Confirm classes
5. Verify classes appear in the list
6. Try deleting ONE class
7. If successful, try "Delete All"
8. Check `/golf/dashboard/calendar` - events should be removed

## Current Test Data

Your account (`rinin376@gmail.com`) currently has:
- 1 class: MATH 201 (T/Th 10:00-11:15)
- 2 calendar events for that class

You can safely delete these to test.

## If Nothing Works

Run this diagnostic and send me the output:

```bash
node test-complete-flow.mjs
```

This will show:
- Current classes in database
- Current calendar events
- Any errors accessing the data

Then we can investigate deeper (possibly a database function issue).

---

**Most likely solution:** Option 1 (sign out, clear cache, sign back in)
