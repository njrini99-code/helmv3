# Onboarding & Database Audit Report
**Date:** January 2025  
**Status:** ✅ **MOSTLY WORKING** - Minor issues identified

---

## Executive Summary

The onboarding system is **functionally correct** but has **one critical race condition** in the signup flow that could cause failures. The database schema is correct and properly structured.

### Overall Status
- ✅ **Database Schema**: Correct
- ✅ **Onboarding Flows**: Correct logic
- ⚠️ **Signup Flow**: Race condition risk
- ✅ **Triggers & Functions**: Working
- ✅ **RLS Policies**: Properly configured

---

## 🔍 Detailed Findings

### 1. Signup Flow Analysis

#### **Location:** `src/app/baseball/(auth)/signup/page.tsx`

**Current Flow:**
1. User signs up via `supabase.auth.signUp()` → Creates `auth.users` record
2. Trigger `on_auth_user_created` fires → Creates `public.users` record (with default role 'player')
3. Code updates `public.users.role` to 'coach' or 'player'
4. Code creates `coaches` or `players` record

**⚠️ ISSUE FOUND: Race Condition**

```typescript
// Line 38: Create auth user
const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });

// Line 63-66: Update user role (ASSUMES users record exists)
const { error: userError } = await supabase
  .from('users')
  .update({ role })
  .eq('id', authData.user.id);
```

**Problem:** The trigger runs asynchronously. If the code tries to UPDATE before the trigger completes, it will fail with "row not found".

**Impact:** Low-Medium (trigger usually completes fast, but edge cases exist)

**Fix Required:** Add retry logic or use `INSERT ... ON CONFLICT` instead of `UPDATE`

---

### 2. Coach Onboarding Flow

#### **Location:** `src/app/baseball/(onboarding)/coach/page.tsx`

**Flow:**
1. ✅ Checks if user is authenticated and role is 'coach'
2. ✅ Checks if onboarding already completed (redirects if yes)
3. ✅ Creates organization record
4. ✅ Updates coach record with all data
5. ✅ Sets `onboarding_completed: true`
6. ✅ Redirects to dashboard

**Status:** ✅ **WORKING CORRECTLY**

**Database Operations:**
- Creates `organizations` record
- Updates `coaches` record with:
  - `organization_id`
  - `coach_type`, `full_name`, `coach_title`
  - School info, contact info
  - `onboarding_completed: true`

**No Issues Found**

---

### 3. Player Onboarding Flow

#### **Location:** `src/app/baseball/(onboarding)/player/page.tsx`

**Flow:**
1. ✅ Checks if user is authenticated and role is 'player'
2. ✅ Checks if onboarding already completed (redirects if yes)
3. ✅ Updates player record with all form data
4. ✅ Calculates profile completion percentage
5. ✅ Sets `onboarding_completed: true`
6. ✅ Redirects to dashboard

**Status:** ✅ **WORKING CORRECTLY**

**Database Operations:**
- Updates `players` record with:
  - Basic info (name, grad year, location)
  - Baseball info (position, bats, throws)
  - Physical measurements
  - Metrics (velo, times)
  - `onboarding_completed: true`
  - `profile_completion_percent`

**No Issues Found**

---

### 4. Database Schema Audit

#### **Users Table**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'player',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

✅ **Status:** Correct
- Primary key references `auth.users.id`
- Role enum properly defined
- Timestamps auto-managed

#### **Coaches Table**
```sql
CREATE TABLE coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  coach_type coach_type NOT NULL,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 0,
  -- ... other fields
);
```

✅ **Status:** Correct
- Foreign key to `users` with CASCADE delete
- UNIQUE constraint on `user_id` (one coach per user)
- `onboarding_completed` field present
- `onboarding_step` field present (not used in current flow)

#### **Players Table**
```sql
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  player_type player_type NOT NULL,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_step INTEGER DEFAULT 0,
  profile_completion_percent INTEGER DEFAULT 0,
  -- ... other fields
);
```

✅ **Status:** Correct
- Foreign key to `users` with CASCADE delete
- UNIQUE constraint on `user_id` (one player per user)
- `onboarding_completed` field present
- `onboarding_step` field present (not used in current flow)
- `profile_completion_percent` calculated correctly

---

### 5. Triggers & Functions

#### **handle_new_user() Function**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

✅ **Status:** Working
- Automatically creates `public.users` record when `auth.users` is created
- Uses `ON CONFLICT DO NOTHING` to prevent errors
- `SECURITY DEFINER` allows it to bypass RLS

#### **Trigger: on_auth_user_created**
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

✅ **Status:** Active and working
- Fires after INSERT on `auth.users`
- Creates `public.users` record automatically

#### **Other Triggers**
- ✅ `update_users_updated_at` - Updates timestamp on user changes
- ✅ `update_coaches_updated_at` - Updates timestamp on coach changes
- ✅ `update_players_updated_at` - Updates timestamp on player changes
- ✅ `create_player_settings_on_insert` - Creates default settings for new players
- ✅ `set_recruiting_activated_timestamp` - Sets timestamp when recruiting activated

**All triggers are working correctly**

---

### 6. RLS Policies

#### **Users Table Policies**
- ✅ "Users can read own profile" - SELECT policy
- ✅ "Users can update own profile" - UPDATE policy
- ✅ RLS enabled

#### **Coaches Table Policies**
- ✅ Multiple policies for viewing/managing coaches
- ✅ RLS enabled

#### **Players Table Policies**
- ✅ Multiple policies for viewing/managing players
- ✅ RLS enabled

**All RLS policies are properly configured**

---

## 🐛 Issues Found

### **CRITICAL: Race Condition in Signup Flow**

**Location:** `src/app/baseball/(auth)/signup/page.tsx` (lines 63-66)

**Problem:**
```typescript
// This assumes the trigger has already created the users record
const { error: userError } = await supabase
  .from('users')
  .update({ role })
  .eq('id', authData.user.id);
```

**Why it's a problem:**
- The trigger runs asynchronously
- If the UPDATE executes before the trigger completes, it will fail
- Error: "No rows found" or "Row not found"

**Fix:**
```typescript
// Option 1: Use INSERT with ON CONFLICT (recommended)
const { error: userError } = await supabase
  .from('users')
  .upsert({ 
    id: authData.user.id, 
    email: authData.user.email,
    role 
  }, { 
    onConflict: 'id' 
  });

// Option 2: Add retry logic
let retries = 3;
while (retries > 0) {
  const { error: userError } = await supabase
    .from('users')
    .update({ role })
    .eq('id', authData.user.id);
  
  if (!userError) break;
  if (userError.code === 'PGRST116') { // Row not found
    await new Promise(resolve => setTimeout(resolve, 100));
    retries--;
    continue;
  }
  throw userError;
}
```

**Priority:** Medium (edge case, but should be fixed)

---

### **MINOR: Unused onboarding_step Field**

**Location:** Both `coaches` and `players` tables have `onboarding_step INTEGER DEFAULT 0`

**Status:** Field exists but is never updated in the onboarding flows

**Impact:** None (field is just unused)

**Recommendation:** Either use it to track progress or remove it

---

## ✅ What's Working Correctly

1. ✅ **Database Schema** - All tables, columns, and constraints are correct
2. ✅ **Coach Onboarding** - Complete flow works correctly
3. ✅ **Player Onboarding** - Complete flow works correctly
4. ✅ **Triggers** - All triggers are active and working
5. ✅ **RLS Policies** - Properly configured for security
6. ✅ **Foreign Keys** - All relationships are correct
7. ✅ **Data Validation** - Forms validate required fields
8. ✅ **Redirects** - Proper redirects after completion

---

## 📋 Recommendations

### **High Priority**
1. **Fix race condition in signup flow** (see fix above)
2. **Add error handling** for edge cases in signup

### **Medium Priority**
3. **Add logging** for onboarding completion events
4. **Add analytics** to track onboarding completion rates
5. **Consider using `onboarding_step`** to track progress through multi-step flows

### **Low Priority**
6. **Remove unused `onboarding_step`** if not planning to use it
7. **Add unit tests** for onboarding flows
8. **Add integration tests** for signup → onboarding flow

---

## 🧪 Testing Recommendations

### **Test Cases to Verify**

1. **Signup Flow:**
   - ✅ New coach signup → creates users → creates coaches → redirects to onboarding
   - ✅ New player signup → creates users → creates players → redirects to onboarding
   - ⚠️ Test with slow network (race condition scenario)

2. **Coach Onboarding:**
   - ✅ Complete all steps → sets `onboarding_completed: true`
   - ✅ Redirects to dashboard after completion
   - ✅ Cannot access onboarding if already completed

3. **Player Onboarding:**
   - ✅ Complete all steps → sets `onboarding_completed: true`
   - ✅ Calculates profile completion correctly
   - ✅ Redirects to dashboard after completion

4. **Database Integrity:**
   - ✅ Foreign keys enforce relationships
   - ✅ UNIQUE constraints prevent duplicates
   - ✅ CASCADE deletes work correctly

---

## 📊 Database Statistics

**Tables Audited:**
- ✅ `users` - 1 table
- ✅ `coaches` - 1 table
- ✅ `players` - 1 table
- ✅ `organizations` - 1 table

**Triggers Active:**
- ✅ 6 triggers on users/coaches/players tables

**RLS Policies:**
- ✅ Multiple policies per table
- ✅ All tables have RLS enabled

**Foreign Keys:**
- ✅ All relationships properly defined
- ✅ CASCADE deletes configured correctly

---

## ✅ Conclusion

**Overall Status: WORKING** with one minor issue to fix.

The onboarding system is **functionally correct** and the database schema is **properly structured**. The only issue is a potential race condition in the signup flow that should be fixed for production reliability.

**Next Steps:**
1. Fix the race condition in signup flow
2. Test the fix thoroughly
3. Consider adding the recommended improvements

---

**Report Generated:** January 2025  
**Audited By:** AI Assistant  
**Database:** Supabase (dgvlnelygibgrrjehbyc.supabase.co)

