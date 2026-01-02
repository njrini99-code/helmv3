# Authentication Flow Analysis Report

**Generated:** 2025-12-31
**Status:** 🔴 CRITICAL ISSUES FOUND
**Severity:** HIGH - Multiple signup flows with inconsistent behavior

---

## Executive Summary

Your authentication system has **TWO DIFFERENT signup flows** that handle user creation differently, leading to potential data inconsistencies and bugs:

1. ✅ **Simple Signup Flow** (working correctly) - Used by `/baseball/signup` and `/golf/signup`
2. ❌ **Cinematic Onboarding Flow** (problematic) - Used by `/baseball/coach-onboarding`

**Primary Issue:** The cinematic onboarding flow calls `supabase.auth.signUp()` without metadata, causing the database trigger to create a **PLAYER record** when it should create a **COACH record**.

---

## Issue #1: Cinematic Onboarding Missing Metadata (CRITICAL)

### Location
**File:** `src/app/baseball/(onboarding)/coach-onboarding/page.tsx`
**Lines:** 67-70

### The Problem

```typescript
// ❌ INCORRECT - No metadata passed to signUp
const { data: authData, error: authError } = await supabase.auth.signUp({
  email: data.email?.trim(),
  password: data.password,
  // ❌ Missing: options.data.role
  // ❌ Missing: options.data.sport
  // ❌ Missing: options.data.first_name
  // ❌ Missing: options.data.last_name
});
```

### What Happens

1. `signUp()` creates auth user WITHOUT metadata
2. `handle_new_user` trigger fires (schema.sql line 807)
3. Trigger defaults:
   - `role` → `'player'` (line 812)
   - `sport` → `'baseball'` (line 813)
4. Trigger creates a **PLAYER record** in `players` table (lines 831-840)
5. Onboarding then manually creates:
   - User record with `role='coach'` (lines 109-127)
   - Coach record (lines 177-190)
6. **Result:** User has BOTH a player record AND a coach record

### Impact

- Database has orphaned player records for coaches
- Potential RLS policy confusion (user has multiple roles)
- Wasted database space
- Possible security issues if player permissions leak to coach accounts

---

## Issue #2: Hardcoded Player Type in Trigger (HIGH)

### Location
**File:** `schema.sql`
**Lines:** 831-840 (handle_new_user trigger)

### The Problem

```sql
-- ❌ HARDCODED to 'high_school' for ALL baseball players
INSERT INTO public.players (user_id, player_type, first_name, last_name, ...)
VALUES (
  NEW.id,
  'high_school',  -- ❌ Should allow player_type selection
  COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
  COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
  NOW(),
  NOW()
)
```

### Impact

- College players signing up are marked as 'high_school'
- JUCO players signing up are marked as 'high_school'
- Showcase players signing up are marked as 'high_school'
- Requires manual correction or onboarding to fix

### Expected Behavior

Trigger should:
1. Check for `player_type` in metadata
2. Default to 'high_school' only if not provided
3. Allow signup form to specify player type

---

## Issue #3: Hardcoded Coach Type in Trigger (HIGH)

### Location
**File:** `schema.sql`
**Lines:** 842-854 (handle_new_user trigger)

### The Problem

```sql
-- ❌ HARDCODED to 'college' for ALL baseball coaches
INSERT INTO public.coaches (user_id, coach_type, full_name, ...)
VALUES (
  NEW.id,
  'college',  -- ❌ Should allow coach_type selection
  CONCAT(
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    ' ',
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  ),
  NOW(),
  NOW()
)
```

### Impact

- High school coaches signing up are marked as 'college'
- JUCO coaches signing up are marked as 'college'
- Showcase coaches signing up are marked as 'college'
- Requires onboarding to fix

### Expected Behavior

Trigger should:
1. Check for `coach_type` in metadata
2. Default to 'college' only if not provided
3. Allow signup form to specify coach type

---

## Issue #4: Fragmented Auth Patterns (MEDIUM)

### Two Different Patterns

**Pattern 1: Simple Signup (CORRECT)**
```typescript
// baseball-sign-up-form.tsx lines 42-53
await supabase.auth.signUp({
  email: formData.email,
  password: formData.password,
  options: {
    data: {
      role: role,                     // ✅ Passed
      sport: 'baseball',              // ✅ Passed
      first_name: formData.firstName, // ✅ Passed
      last_name: formData.lastName,   // ✅ Passed
    },
  },
});
```

**Pattern 2: Cinematic Onboarding (INCORRECT)**
```typescript
// coach-onboarding/page.tsx lines 67-70
await supabase.auth.signUp({
  email: data.email?.trim(),
  password: data.password,
  // ❌ No options.data at all
});

// Then manually creates records
await supabase.from('users').upsert({ id, email, role });
await supabase.from('coaches').insert({ user_id, ... });
```

### Problems

1. Inconsistent: Some flows use trigger, others bypass it
2. Duplication: Cinematic flow creates player record then coach record
3. Maintenance: Two codepaths to maintain
4. Confusion: Developers don't know which pattern to use

---

## Complete Authentication Flow Comparison

### ✅ Simple Signup Flow (WORKING)

```
User fills form
    ↓
signup form passes metadata (role, sport, first_name, last_name)
    ↓
supabase.auth.signUp() with metadata
    ↓
handle_new_user trigger fires
    ↓
Trigger creates users record
    ↓
Trigger creates player OR coach record (based on role)
    ↓
Redirect to dashboard/onboarding
```

**Result:** Clean, single record per user

### ❌ Cinematic Onboarding Flow (BROKEN)

```
User goes through multi-step onboarding
    ↓
Collects data in state
    ↓
supabase.auth.signUp() WITHOUT metadata
    ↓
handle_new_user trigger fires
    ↓
Trigger creates users record (role='player' by default)
    ↓
Trigger creates PLAYER record (wrong!)
    ↓
Onboarding manually creates organization record
    ↓
Onboarding manually creates coach record
    ↓
Onboarding manually updates users.role to 'coach'
```

**Result:** User has BOTH player and coach records

---

## Recommended Fixes

### Fix #1: Update Cinematic Onboarding to Pass Metadata (CRITICAL)

**File:** `src/app/baseball/(onboarding)/coach-onboarding/page.tsx`
**Line:** 67-70

```typescript
// BEFORE (lines 67-70)
const { data: authData, error: authError } = await supabase.auth.signUp({
  email: data.email?.trim(),
  password: data.password,
});

// AFTER (FIX)
const { data: authData, error: authError } = await supabase.auth.signUp({
  email: data.email?.trim(),
  password: data.password,
  options: {
    data: {
      role: 'coach',                    // ✅ Specify role
      sport: 'baseball',                // ✅ Specify sport
      coach_type: coachType,            // ✅ Specify coach type (from lines 138-148)
      first_name: data.fullName?.split(' ')[0] || '',
      last_name: data.fullName?.split(' ').slice(1).join(' ') || '',
    },
  },
});
```

**Then remove manual user/coach creation** (lines 109-190) since trigger handles it.

### Fix #2: Update Trigger to Support player_type Metadata (HIGH)

**File:** `schema.sql`
**Line:** 831-840

```sql
-- BEFORE
INSERT INTO public.players (user_id, player_type, first_name, last_name, ...)
VALUES (
  NEW.id,
  'high_school',  -- Hardcoded
  COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
  COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
  NOW(),
  NOW()
)

-- AFTER (FIX)
INSERT INTO public.players (user_id, player_type, first_name, last_name, ...)
VALUES (
  NEW.id,
  COALESCE(
    NEW.raw_user_meta_data->>'player_type',
    'high_school'  -- Default only if not specified
  )::player_type,
  COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
  COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
  NOW(),
  NOW()
)
```

### Fix #3: Update Trigger to Support coach_type Metadata (HIGH)

**File:** `schema.sql`
**Line:** 842-854

```sql
-- BEFORE
INSERT INTO public.coaches (user_id, coach_type, full_name, ...)
VALUES (
  NEW.id,
  'college',  -- Hardcoded
  CONCAT(...),
  NOW(),
  NOW()
)

-- AFTER (FIX)
INSERT INTO public.coaches (user_id, coach_type, full_name, ...)
VALUES (
  NEW.id,
  COALESCE(
    NEW.raw_user_meta_data->>'coach_type',
    'college'  -- Default only if not specified
  )::coach_type,
  CONCAT(...),
  NOW(),
  NOW()
)
```

### Fix #4: Add organization_id Support to Trigger (OPTIONAL)

If you want trigger to create organizations too:

```sql
-- In handle_new_user function, before creating coach record
DECLARE
  org_id uuid;
BEGIN
  -- If coach_type provided and org data exists in metadata
  IF user_role = 'coach' AND NEW.raw_user_meta_data->>'organization_name' IS NOT NULL THEN
    INSERT INTO public.organizations (name, type, division, location_city, location_state)
    VALUES (
      NEW.raw_user_meta_data->>'organization_name',
      COALESCE(NEW.raw_user_meta_data->>'organization_type', 'college'),
      NEW.raw_user_meta_data->>'division',
      NEW.raw_user_meta_data->>'city',
      NEW.raw_user_meta_data->>'state'
    )
    RETURNING id INTO org_id;

    -- Then create coach with organization_id
    INSERT INTO public.coaches (user_id, coach_type, organization_id, full_name, ...)
    VALUES (NEW.id, ..., org_id, ...);
  END IF;
END;
```

---

## Testing Checklist

After applying fixes:

- [ ] Baseball player signup creates ONLY player record
- [ ] Baseball coach signup creates ONLY coach record (no player record)
- [ ] Golf player signup creates ONLY golf_player record
- [ ] Golf coach signup creates ONLY golf_coach record
- [ ] Cinematic onboarding doesn't create duplicate records
- [ ] Player type is correctly set from metadata
- [ ] Coach type is correctly set from metadata
- [ ] Check database for orphaned player records from coaches
- [ ] Verify RLS policies work with fixed flow

---

## Database Cleanup (After Fixes)

Run this query to find and clean up orphaned player records created for coaches:

```sql
-- Find coaches who also have player records
SELECT
  u.id,
  u.email,
  u.role,
  p.id AS player_id,
  c.id AS coach_id
FROM users u
LEFT JOIN players p ON p.user_id = u.id
LEFT JOIN coaches c ON c.user_id = u.id
WHERE u.role = 'coach' AND p.id IS NOT NULL;

-- Delete orphaned player records (AFTER VERIFYING ABOVE QUERY)
DELETE FROM players
WHERE user_id IN (
  SELECT u.id
  FROM users u
  WHERE u.role = 'coach'
);
```

---

## Priority

1. **CRITICAL:** Fix #1 (Cinematic onboarding metadata) - Prevents duplicate records
2. **HIGH:** Fix #2 & #3 (Trigger hardcoded types) - Allows proper type selection
3. **MEDIUM:** Fix #4 (Organization support) - Optional, improves UX
4. **CLEANUP:** Run database cleanup query after fixes deployed

---

## Summary

**Root Cause:** Two different auth patterns - one uses trigger correctly, one bypasses trigger and creates records manually.

**Solution:** Standardize on trigger-based approach by passing metadata to all `signUp()` calls.

**Impact:** Cleaner database, no duplicate records, consistent behavior across all signup flows.
