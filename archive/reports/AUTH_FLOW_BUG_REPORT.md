# Authentication Flow Bug Report
**Date:** December 31, 2024
**Severity:** 🔴 CRITICAL - Signup is broken
**Status:** Root cause identified, fix ready to apply

---

## Executive Summary

The golf and baseball signup flows are **failing silently** due to a database trigger bug. When users try to sign up, the authentication succeeds but the profile creation fails, leaving users in a broken state.

**Root Cause:** The `handle_new_user()` trigger function is trying to insert into columns that don't exist in the `golf_players` and `golf_coaches` tables.

---

## Issues Found

### Issue #1: Golf Player Signup Fails ❌

**Location:** `supabase/migrations/042_fix_trigger_security_definer.sql` (Line 66)

**Current Broken Code:**
```sql
INSERT INTO public.golf_players (user_id, status, created_at, updated_at)
VALUES (NEW.id, 'active', NOW(), NOW())
```

**Problem:** The `golf_players` table **does NOT have a `status` column**!

**Table Schema:** (from `supabase/migrations/20240101000000_create_golf_tables.sql`)
```sql
CREATE TABLE IF NOT EXISTS golf_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,           -- ✅ Exists (nullable)
  last_name TEXT,            -- ✅ Exists (nullable)
  handicap_index DECIMAL(4,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
-- NO 'status' column! ❌
```

**Impact:** When a golf player tries to sign up:
1. Supabase Auth creates the user ✅
2. Trigger tries to insert into `golf_players` with non-existent `status` column ❌
3. Insert FAILS silently (caught by EXCEPTION block)
4. User is created in `auth.users` but NOT in `golf_players`
5. User can log in but has no profile → broken state

---

### Issue #2: Golf Coach Signup Fails ❌

**Location:** `supabase/migrations/042_fix_trigger_security_definer.sql` (Line 70)

**Current Broken Code:**
```sql
INSERT INTO public.golf_coaches (user_id, created_at, updated_at)
VALUES (NEW.id, NOW(), NOW())
```

**Problem:** The `golf_coaches` table **requires `full_name TEXT NOT NULL`** but the trigger doesn't provide it!

**Table Schema:** (from `supabase/migrations/016_create_golf_schema.sql`)
```sql
CREATE TABLE golf_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  team_id UUID REFERENCES golf_teams(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES golf_organizations(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,  -- ❌ REQUIRED but not provided!
  email TEXT,
  phone TEXT,
  title TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Impact:** When a golf coach tries to sign up:
1. Supabase Auth creates the user ✅
2. Trigger tries to insert into `golf_coaches` without required `full_name` ❌
3. Insert FAILS (NOT NULL violation)
4. User is created in `auth.users` but NOT in `golf_coaches`
5. User can log in but has no profile → broken state

---

## Baseball Signup Status

✅ **Baseball signup works correctly**

The trigger properly handles baseball signups:
- Baseball players: Inserts `first_name` and `last_name` from metadata
- Baseball coaches: Inserts `full_name` from concatenated first/last names

**Why Baseball Works:**
```sql
-- Baseball Player ✅
INSERT INTO public.players (user_id, player_type, first_name, last_name, created_at, updated_at)
VALUES (
  NEW.id,
  'high_school',
  COALESCE(NEW.raw_user_meta_data->>'first_name', ''),  -- ✅ Provided
  COALESCE(NEW.raw_user_meta_data->>'last_name', ''),   -- ✅ Provided
  NOW(),
  NOW()
)

-- Baseball Coach ✅
INSERT INTO public.coaches (user_id, coach_type, full_name, created_at, updated_at)
VALUES (
  NEW.id,
  'college',
  CONCAT(                                                  -- ✅ Provided
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    ' ',
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  ),
  NOW(),
  NOW()
)
```

---

## The Fix

### Fixed Code (Already applied to migration file)

**Golf Players:**
```sql
INSERT INTO public.golf_players (
  user_id,
  first_name,      -- ✅ Added
  last_name,       -- ✅ Added
  created_at,
  updated_at
)
VALUES (
  NEW.id,
  COALESCE(NEW.raw_user_meta_data->>'first_name', ''),  -- ✅ Extract from metadata
  COALESCE(NEW.raw_user_meta_data->>'last_name', ''),   -- ✅ Extract from metadata
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO NOTHING;
```

**Golf Coaches:**
```sql
INSERT INTO public.golf_coaches (
  user_id,
  full_name,       -- ✅ Added (required field)
  created_at,
  updated_at
)
VALUES (
  NEW.id,
  CONCAT(                                                  -- ✅ Build from metadata
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    ' ',
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  ),
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO NOTHING;
```

---

## Files Modified

### 1. Migration File (Source of Truth)
- **File:** `supabase/migrations/042_fix_trigger_security_definer.sql`
- **Status:** ✅ Fixed locally
- **Changes:**
  - Golf players: Added `first_name` and `last_name` fields
  - Golf coaches: Added `full_name` field with CONCAT from metadata

### 2. Standalone Fix Script (For Direct Database Execution)
- **File:** `fix_golf_signup_trigger.sql`
- **Status:** ✅ Created and ready to run
- **Purpose:** Can be executed directly on the database to apply the fix immediately

---

## How to Apply the Fix

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `fix_golf_signup_trigger.sql`
3. Paste and run
4. Trigger function will be updated immediately

### Option 2: Via Local Migration

1. Ensure Supabase CLI is linked to your project
2. Run: `npx supabase db push`
3. This will apply migration `042_fix_trigger_security_definer.sql`

### Option 3: Direct psql Connection

```bash
# Using connection pooler
cat fix_golf_signup_trigger.sql | psql "<YOUR_SUPABASE_DB_URL>"
```

---

## Verification Steps

### Test Golf Player Signup:

1. Navigate to `/golf/signup`
2. Fill out form:
   - Role: Player
   - First name: "Test"
   - Last name: "Player"
   - Email: `test-golf-player@example.com`
   - Password: `SecurePass123!`
3. Submit
4. Check database:
   ```sql
   -- Should return 1 row
   SELECT * FROM golf_players WHERE user_id = (
     SELECT id FROM auth.users WHERE email = 'test-golf-player@example.com'
   );
   ```

### Test Golf Coach Signup:

1. Navigate to `/golf/signup`
2. Fill out form:
   - Role: Coach
   - First name: "Test"
   - Last name: "Coach"
   - Email: `test-golf-coach@example.com`
   - Password: `SecurePass123!`
3. Submit
4. Check database:
   ```sql
   -- Should return 1 row with full_name = 'Test Coach'
   SELECT * FROM golf_coaches WHERE user_id = (
     SELECT id FROM auth.users WHERE email = 'test-golf-coach@example.com'
   );
   ```

---

## Impact Analysis

### Current State (Before Fix):
- ❌ Golf player signup: **100% failure rate**
- ❌ Golf coach signup: **100% failure rate**
- ✅ Baseball player signup: Works
- ✅ Baseball coach signup: Works

### After Fix:
- ✅ Golf player signup: Will work
- ✅ Golf coach signup: Will work
- ✅ Baseball player signup: Still works
- ✅ Baseball coach signup: Still works

---

## Additional Notes

### Why the Bug Existed:

1. The `golf_players` table was created in migration `20240101000000_create_golf_tables.sql` WITHOUT a `status` column
2. The `golf_coaches` table was created in migration `016_create_golf_schema.sql` WITH a required `full_name` field
3. The trigger in migration `042_fix_trigger_security_definer.sql` was written assuming different table schemas
4. These mismatches caused silent failures during signup

### Why It Went Undetected:

- The trigger has an `EXCEPTION` block that catches ALL errors and returns `NEW`
- This prevents the auth signup from failing, but leaves profiles uncreated
- Users can still log in (auth succeeds) but have no profile data
- No error is shown to the user

### Prevention:

✅ **Action Item:** Add integration tests for signup flows that verify:
1. Auth user is created
2. Profile record is created in sport-specific table
3. All required fields are populated

---

## Related Issues

### Missing Image (Minor):
- `/images/auth-bg-golf.jpg` returns 404
- Impact: LOW (gradient fallback works)
- Fix: Add image or remove reference

### Navigation Links Fixed:
- ✅ Removed `/golf` and `/baseball` intermediate pages
- ✅ Updated navigation to go directly to signup pages
- ✅ Hydration errors fixed in Navigation component

---

## Recommended Actions

1. **IMMEDIATE:** Apply the trigger fix to production database
2. **URGENT:** Test signup flows for all 4 combinations:
   - Golf Player
   - Golf Coach
   - Baseball Player
   - Baseball Coach
3. **SOON:** Add automated tests for signup flows
4. **SOON:** Audit all database triggers for schema mismatches

---

**Priority:** 🔴 P0 - Blocks all golf signups
**Complexity:** 🟢 Low - SQL function update
**Risk:** 🟢 Low - Only affects trigger logic, no schema changes
**ETA:** < 5 minutes to apply fix

---

*Report generated by Claude Code on 2024-12-31*
