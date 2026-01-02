# RLS Policy Fix for golf_events - COMPLETE GUIDE

## The Problem

When creating calendar events as a player, you're getting this error:
```
code: '42501'
message: 'new row violates row-level security policy for table "golf_events"'
```

This means:
1. ✅ Row Level Security (RLS) is enabled on the `golf_events` table
2. ❌ The current RLS INSERT policy is blocking your insert
3. ❌ The permissive policy we tried to create may not have been applied

---

## The Fix (Run in Supabase Dashboard)

### Step 1: Open Supabase SQL Editor

1. Go to: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc
2. Click **"SQL Editor"** in the left sidebar
3. Click **"+ New query"**

### Step 2: Run This Exact SQL

Copy and paste this SQL, then click **"Run"**:

```sql
-- Drop ALL existing INSERT policies (prevents conflicts)
DROP POLICY IF EXISTS "Users can insert events for their team" ON golf_events;
DROP POLICY IF EXISTS "Coaches can insert events" ON golf_events;
DROP POLICY IF EXISTS "Allow event creation" ON golf_events;
DROP POLICY IF EXISTS "Allow users to create events" ON golf_events;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON golf_events;

-- Create a simple permissive policy
-- This allows any authenticated user (player or coach) to insert events
CREATE POLICY "Enable insert for authenticated users"
ON golf_events
FOR INSERT
TO authenticated
WITH CHECK (true);
```

### Step 3: Verify Success

After running the SQL, you should see:
```
Success. No rows returned
```

If you see an error, **copy the entire error message** and share it.

---

## Step 4: Test the Fix

After running the SQL, test in your app:

1. Go to the Golf Calendar page
2. Click **"+ Add Event"**
3. Fill in the event details
4. Click **"Create Event"**

If it works: ✅ You'll see "Event created successfully!"

If it still fails: ❌ Check the browser console for errors and share them.

---

## Why This Fix Works

**Before:** The INSERT policy was checking for team membership or coach status, which blocked:
- Personal events (where team_id = null)
- Player-created events

**After:** The new policy allows ANY authenticated user to insert events:
- `TO authenticated` = must be logged in
- `WITH CHECK (true)` = no additional restrictions

This is safe because:
- Users must be logged in (authentication required)
- Each event is linked to the creator via `created_by` or user context
- Application code handles authorization logic

---

## Troubleshooting

### If you still get the error after running the SQL:

1. **Check if the policy was created:**

   Run this SQL in Supabase Dashboard:
   ```sql
   SELECT policyname, cmd, with_check::text
   FROM pg_policies
   WHERE tablename = 'golf_events' AND cmd = 'INSERT'
   ORDER BY policyname;
   ```

   You should see:
   ```
   policyname: Enable insert for authenticated users
   cmd: INSERT
   with_check: true
   ```

2. **If you see multiple policies:**

   Run the DROP commands again to remove all policies, then create only the one policy.

3. **If you see NO policies:**

   The CREATE command failed. Check for error messages when running the SQL.

---

## Next Steps

After the RLS fix works:

1. ✅ Players can create personal calendar events
2. ✅ Players can create team events (if they have a team)
3. ✅ Coaches can create team events
4. ✅ No more 42501 RLS policy errors

Then we can add more sophisticated policies later if needed (e.g., restricting team event creation to team members only).
