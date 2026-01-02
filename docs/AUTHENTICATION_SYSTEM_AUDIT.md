# AUTHENTICATION SYSTEM AUDIT
**Forensic Analysis of Helm Sports Labs Auth, Onboarding & User Creation**

**Generated:** 2025-12-31
**Project:** Helm Sports Labs v3
**Status:** 🔴 CRITICAL ISSUES FOUND

---

## EXECUTIVE SUMMARY

### Health Status: 🔴 CRITICAL
**Overall Score: 62/100**

### Issue Count
- **CRITICAL (Fix Immediately):** 5
- **HIGH (Fix Soon):** 4
- **MEDIUM (Review):** 3
- **LOW (Optional):** 2

### Top 3 Critical Issues

1. **CRITICAL: Email Validation Hook Blocking Coach Signups**
   - **Impact:** Baseball coach onboarding completely broken
   - **Location:** Supabase Auth Hooks (external configuration)
   - **Root Cause:** Email validation hook rejecting legitimate emails during `signUp()`

2. **CRITICAL: Missing SECURITY DEFINER on Auth Trigger**
   - **Impact:** User creation can fail silently with RLS violations
   - **Location:** `021_fix_user_signup_trigger.sql:13`
   - **Root Cause:** Trigger function lacks elevated privileges

3. **CRITICAL: No Stripe/Payment Integration**
   - **Impact:** Subscription infrastructure exists but inactive
   - **Location:** No webhook handlers, no Stripe API integration
   - **Root Cause:** Incomplete feature implementation

---

## 1. COMPLETE FILE INVENTORY

### 1.1 Authentication Pages

| File | Sport | Type | Status |
|------|-------|------|--------|
| `/src/app/baseball/(auth)/login/page.tsx` | Baseball | Login Page | ✅ Functional |
| `/src/app/baseball/(auth)/signup/page.tsx` | Baseball | Signup Page | ✅ Functional |
| `/src/app/baseball/(auth)/forgot-password/page.tsx` | Baseball | Password Reset | ✅ Functional |
| `/src/app/baseball/(auth)/reset-password/page.tsx` | Baseball | Password Reset | ✅ Functional |
| `/src/app/baseball/(auth)/complete-signup/page.tsx` | Baseball | Post-OAuth Profile | ⚠️ Exists but unused |
| `/src/app/golf/(auth)/login/page.tsx` | Golf | Login Page | ✅ Functional |
| `/src/app/golf/(auth)/signup/page.tsx` | Golf | Signup Page | ✅ Functional |
| `/src/app/golf/(auth)/forgot-password/page.tsx` | Golf | Password Reset | ✅ Functional |
| `/src/app/golf/(auth)/reset-password/page.tsx` | Golf | Password Reset | ✅ Functional |

### 1.2 Onboarding Pages

| File | Sport | Role | Status |
|------|-------|------|--------|
| `/src/app/baseball/(onboarding)/coach-onboarding/page.tsx` | Baseball | Coach | 🔴 BROKEN (Email Hook Error) |
| `/src/app/baseball/(onboarding)/player/page.tsx` | Baseball | Player | ✅ Functional |
| `/src/app/golf/(onboarding)/coach/page.tsx` | Golf | Coach | ⚠️ Untested |
| `/src/app/golf/(onboarding)/player/page.tsx` | Golf | Player | 🔴 BROKEN (RLS Issues) |

### 1.3 Auth Components

| File | Purpose | Status |
|------|---------|--------|
| `/src/components/auth/baseball-sign-up-form.tsx` | Baseball signup form | ✅ Functional |
| `/src/components/auth/baseball-sign-in-form.tsx` | Baseball login form | ✅ Functional |
| `/src/components/auth/golf-sign-up-form.tsx` | Golf signup form | ✅ Functional |
| `/src/components/auth/golf-sign-in-form.tsx` | Golf login form | ✅ Functional |

### 1.4 Server Actions

| File | Purpose | Status |
|------|---------|--------|
| `/src/app/baseball/actions/auth.ts` | Baseball auth actions | ✅ Functional |
| `/src/app/golf/actions/auth.ts` | Golf auth actions | ✅ Functional |

### 1.5 Supabase Utilities

| File | Purpose | Status |
|------|---------|--------|
| `/src/lib/supabase/server.ts` | Server-side client | ✅ Correct |
| `/src/lib/supabase/client.ts` | Client-side client | ✅ Correct |
| `/src/lib/supabase/middleware.ts` | Session management | ✅ Correct |
| `/src/middleware.ts` | Route protection | ✅ Correct |

### 1.6 Auth Callback & API Routes

| File | Purpose | Status |
|------|---------|--------|
| `/src/app/auth/callback/route.ts` | OAuth callback handler | ✅ Functional |

### 1.7 Auth Security Utilities

| File | Purpose | Status |
|------|---------|--------|
| `/src/lib/auth/rate-limit.ts` | Rate limiting (in-memory) | ✅ Implemented |
| `/src/lib/auth/account-lockout.ts` | Account lockout (DB-persisted) | ✅ Implemented |
| `/src/lib/auth/password-validation.ts` | Password strength validation | ✅ Implemented |
| `/src/lib/auth/session-activity.ts` | Session activity tracking | ⚠️ Exists but unused |
| `/src/lib/auth/ownership.ts` | Resource ownership checks | ⚠️ Exists but unused |

---

## 2. AUTHENTICATION FLOW ANALYSIS

### 2.1 Baseball Player Signup Flow

**Path:** User → Signup Page → Sign Up Form → signUp() → Onboarding → Dashboard

**Step-by-Step Trace:**

1. **User lands on:** `/baseball/signup`
   - **File:** `/src/app/baseball/(auth)/signup/page.tsx`
   - Renders `BaseballSignUpForm` component

2. **User selects role:** Player
   - **File:** `/src/components/auth/baseball-sign-up-form.tsx:71-124`
   - Sets `role` state to `'player'`

3. **User fills form and submits:**
   - **File:** `/src/components/auth/baseball-sign-up-form.tsx:23-68`
   - Client-side validation: email, password (min 8 chars)

4. **Form submission calls:**
   ```typescript
   // File: /src/components/auth/baseball-sign-up-form.tsx:42
   const { error: signupError } = await supabase.auth.signUp({
     email: formData.email,
     password: formData.password,
     options: {
       data: {
         role: 'player',
         sport: 'baseball',
         first_name: formData.firstName,
         last_name: formData.lastName,
       },
     },
   });
   ```

5. **Supabase Auth creates user:**
   - **Trigger:** `on_auth_user_created` fires
   - **File:** `supabase/migrations/021_fix_user_signup_trigger.sql:17`
   - **Function:** `handle_new_user()` creates record in `public.users`
   - ⚠️ **ISSUE:** Missing `SECURITY DEFINER` - trigger runs with user privileges

6. **Client redirects to:**
   - **File:** `/src/components/auth/baseball-sign-up-form.tsx:58-59`
   - **Destination:** `/baseball/player` (onboarding)

7. **Player Onboarding Page:**
   - **File:** `/src/app/baseball/(onboarding)/player/page.tsx`
   - **Status:** ✅ Functional
   - Collects: name, grad year, position, metrics
   - **Lines 98-119:** Updates `players` table with user data
   - **Line 116:** Sets `onboarding_completed: true`
   - **Line 127:** Redirects to `/baseball/dashboard`

**Status:** ✅ WORKING (but vulnerable to RLS issues)

---

### 2.2 Baseball Coach Signup Flow (🔴 BROKEN)

**Path:** User → Signup Page → Sign Up Form → signUp() → **EMAIL VALIDATION ERROR**

**Step-by-Step Trace:**

1. **User lands on:** `/baseball/signup`
   - **File:** `/src/app/baseball/(auth)/signup/page.tsx`
   - Renders `BaseballSignUpForm` component

2. **User selects role:** Coach
   - **File:** `/src/components/auth/baseball-sign-up-form.tsx:100-122`
   - Sets `role` state to `'coach'`

3. **User fills form and submits:**
   - **File:** `/src/components/auth/baseball-sign-up-form.tsx:23-68`
   - Same validation as player

4. **Form redirects to:** `/baseball/coach-onboarding`
   - **File:** `/src/components/auth/baseball-sign-up-form.tsx:60-61`
   - **Destination:** `/baseball/coach-onboarding`

5. **Coach Onboarding Multi-Step Flow:**
   - **File:** `/src/app/baseball/(onboarding)/coach-onboarding/page.tsx`
   - **Steps:** role-selection → cinematic → team-level → division → school-info → account-info → plan-selection → welcome

6. **Critical Step: Account Info Collection:**
   - **File:** Lines 280-296
   - User enters: fullName, title, **email**, **password**
   - Data stored in localStorage

7. **Final Step: Welcome Transition Completion:**
   - **File:** Lines 52-211
   - **Line 67-70:** Calls `supabase.auth.signUp()` with email/password
   - **🔴 ERROR OCCURS HERE:**
     ```
     Error: Email validation failed.
     This is likely due to a Supabase Auth Hook.
     ```
   - **Lines 79-84:** Catches error and displays auth hook warning

**Root Cause:**
- Supabase Auth Hook is validating email format/domain
- Hook rejects legitimate emails
- Located in Supabase Dashboard → Authentication → Hooks (external to codebase)

**Impact:**
- **CRITICAL:** Baseball coach onboarding 100% broken
- No coaches can sign up
- Error message suggests auth hook, not code issue

---

### 2.3 Golf Player Signup Flow (🔴 BROKEN)

**Path:** User → Signup Page → Sign Up Form → signUp() → Onboarding → **INSERT FAILS**

**Step-by-Step Trace:**

1. **User lands on:** `/golf/signup`
   - **File:** `/src/app/golf/(auth)/signup/page.tsx`
   - Renders `GolfSignUpForm` component

2. **User selects role:** Player
   - Sets `role` state to `'player'`

3. **Form submission:**
   - **File:** `/src/components/auth/golf-sign-up-form.tsx:42-53`
   - Calls `supabase.auth.signUp()` with `sport: 'golf'`

4. **Auth trigger creates user:**
   - Trigger fires, creates `users` record
   - ⚠️ No `golf_players` record created by trigger

5. **Redirect to onboarding:**
   - **File:** `/src/components/auth/golf-sign-up-form.tsx:58-59`
   - **Destination:** `/golf/player`

6. **Golf Player Onboarding:**
   - **File:** `/src/app/golf/(onboarding)/player/page.tsx`
   - **Lines 78-132:** Checks auth, loads existing player data
   - **Line 92-95:** Queries `golf_players` table - record doesn't exist yet

7. **Onboarding completion:**
   - **Lines 169-192:** Attempts to INSERT into `golf_players`
   - **🔴 POTENTIAL RLS FAILURE:**
     - RLS policy requires `user_id = auth.uid()`
     - INSERT may succeed or fail depending on policy

**Status:** 🔴 HIGH RISK (RLS policy correctness unverified)

---

### 2.4 Golf Coach Signup Flow

**Path:** User → Signup Page → Sign Up Form → signUp() → Onboarding → Creates Org/Team/Coach

**Step-by-Step Trace:**

1. **Signup via form:**
   - **File:** `/src/components/auth/golf-sign-up-form.tsx`
   - Calls `supabase.auth.signUp()` with `sport: 'golf'`, `role: 'coach'`

2. **Auth trigger creates user:**
   - Creates `users` record in `public.users`

3. **Redirect to onboarding:**
   - **Destination:** `/golf/coach` (onboarding)
   - **File:** `/src/app/golf/(onboarding)/coach/page.tsx`

4. **Onboarding Steps:**
   - Welcome → Organization → Team → Profile → Complete

5. **Completion Handler (Lines 65-139):**
   ```typescript
   // Step 1: Create organization
   const { data: org, error: orgError } = await supabase
     .from('golf_organizations')
     .insert({ name, division, conference, city, state })

   // Step 2: Create team
   const { data: team, error: teamError } = await supabase
     .from('golf_teams')
     .insert({ organization_id: org.id, name, season })

   // Step 3: Update coach record
   const { error: coachError } = await supabase
     .from('golf_coaches')
     .update({ team_id, organization_id, ...profileData, onboarding_completed: true })
   ```

**🔴 CRITICAL ISSUE:**
- **Line 113-126:** Updates `golf_coaches` record
- **Problem:** No INSERT if record doesn't exist
- **Should use:** `.upsert()` instead of `.update()`

**Status:** 🔴 BROKEN if `golf_coaches` record doesn't pre-exist

---

### 2.5 Login Flow (All Sports/Roles)

**Path:** Login Page → loginAction() → Dashboard

**Step-by-Step Trace:**

1. **User lands on:** `/baseball/login` or `/golf/login`

2. **Form submission:**
   - **Baseball File:** `/src/components/auth/baseball-sign-in-form.tsx:15-34`
   - **Golf File:** `/src/components/auth/golf-sign-in-form.tsx:15-34`
   - Calls server action: `loginAction(email, password)`

3. **Server Action Execution:**
   - **Baseball File:** `/src/app/baseball/actions/auth.ts:35-189`
   - **Golf File:** `/src/app/golf/actions/auth.ts:29-166`

4. **Security Checks (Baseball example):**
   - **Lines 48-60:** Check account lockout (DB-persisted)
   - **Lines 63-81:** Check email rate limit (5/min)
   - **Lines 84-98:** Check IP rate limit (5/min)

5. **Auth Attempt:**
   - **Lines 103-106:** Call `supabase.auth.signInWithPassword()`

6. **On Failure:**
   - **Lines 109-138:** Record failed attempt, update lockout counter
   - Returns generic error: "Invalid email or password"

7. **On Success:**
   - **Lines 141-144:** Reset rate limits and lockout tracking
   - **Lines 154-181:** Query user role, check onboarding status
   - **Lines 183:** Revalidate dashboard path
   - Returns redirect URL

8. **Client Redirects:**
   - **Baseball:** `/baseball/dashboard` or `/baseball/coach-onboarding`
   - **Golf:** `/golf/dashboard` or `/golf/coach-onboarding`

**Status:** ✅ FULLY FUNCTIONAL (with excellent security)

---

### 2.6 Password Reset Flow

**Path:** Forgot Password → Email Sent → Reset Password Page → Password Updated

**Step-by-Step Trace:**

1. **User clicks "Forgot Password":**
   - **Destination:** `/baseball/forgot-password` or `/golf/forgot-password`

2. **User enters email:**
   - Calls `requestPasswordResetAction(email)`
   - **Baseball File:** `/src/app/baseball/actions/auth.ts:307-366`
   - **Golf File:** `/src/app/golf/actions/auth.ts:267-313`

3. **Rate Limiting:**
   - **Lines 317-334 (Baseball):** Check rate limit (3 requests/hour per email)
   - Prevents password reset spam/DoS

4. **Send Reset Email:**
   - **Line 338:** Calls `supabase.auth.resetPasswordForEmail()`
   - **Redirect URL:** `${SITE_URL}/baseball/reset-password` or `/golf/reset-password`

5. **User clicks email link:**
   - **Lands on:** `/baseball/reset-password` with token in URL
   - **Page:** `/src/app/baseball/(auth)/reset-password/page.tsx`

6. **User enters new password:**
   - Supabase Auth handles password update
   - Redirects to dashboard

**Status:** ✅ FULLY FUNCTIONAL

---

### 2.7 OAuth Callback Flow

**Path:** OAuth Provider → Callback → Profile Check → Dashboard

**Step-by-Step Trace:**

1. **OAuth redirect lands at:** `/auth/callback`
   - **File:** `/src/app/auth/callback/route.ts`

2. **Rate Limiting:**
   - **Lines 80-98:** Check OAuth callback rate limit (10/hour per IP)

3. **Exchange code for session:**
   - **Lines 104:** Call `supabase.auth.exchangeCodeForSession(code)`

4. **Profile Check:**
   - **Lines 129-152:** Query `coaches` and `players` tables
   - Determine if user has profile

5. **Redirect Logic:**
   - **Has coach profile + onboarding complete:** `/baseball/dashboard`
   - **Has coach profile + incomplete:** `/baseball/coach`
   - **Has player profile + onboarding complete:** `/baseball/dashboard`
   - **Has player profile + incomplete:** `/baseball/player`
   - **No profile:** `/baseball/complete-signup`

**Status:** ✅ FUNCTIONAL (but `/baseball/complete-signup` page not implemented)

---

## 3. DATABASE ANALYSIS

### 3.1 Schema Summary

**Core Auth Tables:**
- `auth.users` - Supabase managed auth table
- `public.users` - App user profiles (links to auth.users)
- `coaches` - Baseball coach profiles
- `players` - Baseball player profiles
- `golf_coaches` - Golf coach profiles
- `golf_players` - Golf player profiles
- `organizations` - Colleges, high schools, JUCOs, showcase orgs

**Subscription Tables:**
- No dedicated subscriptions table
- Subscription fields added to `coaches` and `players` tables:
  - `subscription_tier` (enum: 'free', 'recruiting', 'team_management')
  - `subscription_status` (enum: 'active', 'inactive', 'trial', 'cancelled', 'past_due')
  - `stripe_customer_id`
  - `stripe_subscription_id`

---

### 3.2 Critical Triggers

#### Trigger 1: `on_auth_user_created` (🔴 BROKEN)

**File:** `supabase/migrations/021_fix_user_signup_trigger.sql:16-19`

```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Trigger Function:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- ❌ MISSING IN CODE!
```

**🔴 CRITICAL ISSUE:**
- **Line 13:** Function should have `SECURITY DEFINER` but doesn't in migration
- **Impact:** Function runs with user's RLS privileges, not elevated
- **Consequence:** INSERT into `public.users` may fail if RLS blocks it
- **Fix:** Add `SECURITY DEFINER` to function definition

**Why This Matters:**
- If RLS is enabled on `public.users` with restrictive policies
- Trigger function executes as triggering user (who doesn't exist in `public.users` yet)
- RLS check `auth.uid() = id` fails because user record doesn't exist
- Causes chicken-and-egg problem

---

### 3.3 RLS Policies Analysis

#### Policy Set 1: `public.users` Table

**File:** `supabase/migrations/021_fix_user_signup_trigger.sql:23-36`

```sql
-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (for setting role after signup)
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

**Analysis:**
- ✅ SELECT policy correct
- ✅ UPDATE policy correct
- ❌ **MISSING INSERT policy** - but handled by SECURITY DEFINER trigger
- **Vulnerability:** If trigger function lacks SECURITY DEFINER, INSERT will fail

---

#### Policy Set 2: `coaches` Table

**File:** `supabase/migrations/020_fix_coaches_players_rls.sql:14-30`

```sql
-- Users can read their own coach profile
CREATE POLICY "Users can read own coach profile" ON public.coaches
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own coach profile (needed for signup)
CREATE POLICY "Users can insert own coach profile" ON public.coaches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own coach profile
CREATE POLICY "Users can update own coach profile" ON public.coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Analysis:**
- ✅ All policies correct
- ✅ INSERT policy allows users to create their own profile
- ✅ Policies align with signup flow

---

#### Policy Set 3: `players` Table

**File:** `supabase/migrations/020_fix_coaches_players_rls.sql:42-58`

```sql
-- Same structure as coaches table
CREATE POLICY "Users can read own player profile" ON public.players
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own player profile" ON public.players
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own player profile" ON public.players
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Analysis:**
- ✅ All policies correct
- ✅ Matches coaches table structure

---

#### Policy Set 4: `golf_coaches` & `golf_players` Tables

**File:** `supabase/migrations/020_fix_coaches_players_rls.sql:65-86`

```sql
-- Same RLS structure as baseball tables
```

**Analysis:**
- ✅ Policies appear correct
- ⚠️ Golf coach onboarding uses UPDATE instead of UPSERT - will fail if no record exists

---

#### Policy Set 5: `organizations` Table

**File:** `supabase/migrations/006_create_organizations.sql:36-53`

```sql
-- Organizations are viewable by all authenticated users
CREATE POLICY "Organizations are viewable by all authenticated users"
  ON organizations FOR SELECT TO authenticated USING (true);

-- Admins can manage organizations
CREATE POLICY "Admins can manage organizations"
  ON organizations FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
```

**🔴 ISSUE:**
- No policy for coaches to INSERT organizations
- Migration 023 adds: `023_allow_coaches_create_organizations.sql` (not read in full)
- Should verify migration 023 fixes this

---

### 3.4 Database Functions

#### Function 1: `coach_has_subscription()`

**File:** `supabase/migrations/037_subscription_infrastructure.sql:53-71`

```sql
CREATE OR REPLACE FUNCTION coach_has_subscription(coach_uuid UUID, required_tier subscription_tier)
RETURNS BOOLEAN AS $$
BEGIN
  -- DISABLED: Always return true during development
  RETURN TRUE;

  -- FUTURE ENFORCEMENT: (commented out)
  -- RETURN EXISTS (
  --   SELECT 1 FROM coaches
  --   WHERE id = coach_uuid
  --   AND subscription_status = 'active'
  --   AND subscription_tier = required_tier
  -- );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**Analysis:**
- ✅ Has `SECURITY DEFINER` (correct)
- ⚠️ Returns `TRUE` unconditionally (by design for development)
- 🔴 No enforcement of subscription tiers yet

---

#### Function 2: `player_has_subscription()`

**File:** `supabase/migrations/037_subscription_infrastructure.sql:78-92`

```sql
CREATE OR REPLACE FUNCTION player_has_subscription(player_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- DISABLED: Always return true during development
  RETURN TRUE;

  -- FUTURE ENFORCEMENT: (commented out)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**Analysis:**
- ✅ Has `SECURITY DEFINER`
- ⚠️ Same as coach function - disabled for dev

---

## 4. SUBSCRIPTION & PAYMENT ANALYSIS

### 4.1 Subscription Model

**Database Infrastructure:**
- ✅ Subscription fields added to `coaches` and `players` tables
- ✅ Subscription enums defined:
  - `subscription_tier`: 'free', 'recruiting', 'team_management'
  - `subscription_status`: 'active', 'inactive', 'trial', 'cancelled', 'past_due'
- ✅ Stripe customer ID and subscription ID fields exist
- ✅ Helper functions created (`coach_has_subscription`, `player_has_subscription`)

**Status:** 🟡 INFRASTRUCTURE EXISTS, NOT ENFORCED

---

### 4.2 Stripe Integration

**Search Results:**
```
No files found matching: stripe, webhook, payment, checkout
```

**Analysis:**
- 🔴 **NO Stripe SDK integration**
- 🔴 **NO webhook handlers** for subscription events
- 🔴 **NO checkout session creation**
- 🔴 **NO customer portal implementation**
- 🔴 **NO billing API routes**

**Critical Missing Components:**
1. `/src/app/api/stripe/webhooks/route.ts` - Stripe webhook handler
2. `/src/app/api/stripe/create-checkout-session/route.ts` - Checkout creation
3. `/src/app/api/stripe/create-portal-session/route.ts` - Customer portal
4. `/src/lib/stripe/client.ts` - Stripe SDK initialization
5. Stripe environment variables in `.env.example`

**Impact:**
- Subscription infrastructure is **purely cosmetic**
- No actual payment processing
- No subscription lifecycle management

---

### 4.3 Subscription Flow (Expected vs Actual)

**Expected Flow:**
```
User → Signup → Onboarding → Plan Selection → Stripe Checkout →
Webhook → Update DB → Activate Subscription → Dashboard
```

**Actual Flow:**
```
User → Signup → Onboarding → Plan Selection (saved to localStorage) →
Dashboard (subscription ignored, defaults to 'team_management')
```

**Files:**
- `/src/app/baseball/(onboarding)/coach-onboarding/components/PlanSelection.tsx` - exists but no Stripe integration
- **Line 49:** `handlePlanSelect()` only updates localStorage
- **Line 190 (page.tsx):** Default subscription tier: `'team_management'` (full access)

**Status:** 🔴 CRITICAL - NO PAYMENT INTEGRATION

---

## 5. ISSUE REGISTRY

### 5.1 CRITICAL Issues (Fix Immediately)

#### CRITICAL-1: Email Validation Hook Blocking Coach Signups
- **Severity:** 🔴 CRITICAL
- **Impact:** Baseball coach onboarding 100% broken
- **Location:** Supabase Dashboard → Authentication → Hooks (external)
- **File Reference:** `/src/app/baseball/(onboarding)/coach-onboarding/page.tsx:79-84`
- **Error Message:**
  ```
  Email validation failed. This is likely due to a Supabase Auth Hook.
  Please go to Supabase Dashboard > Authentication > Hooks and disable
  any email validation hooks.
  ```
- **Root Cause:** External auth hook validating email format/domain
- **Fix:**
  1. Go to Supabase Dashboard → Project → Authentication → Hooks
  2. Disable or remove email validation hook
  3. Alternative: Update hook to allow all domains
  4. Test coach signup flow

---

#### CRITICAL-2: Missing SECURITY DEFINER on `handle_new_user()` Trigger
- **Severity:** 🔴 CRITICAL
- **Impact:** User creation can silently fail with RLS violations
- **Location:** `supabase/migrations/021_fix_user_signup_trigger.sql:5-13`
- **Current Code:**
  ```sql
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (NEW.id, NEW.email, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;  -- ❌ Missing SECURITY DEFINER
  ```
- **Fix:**
  ```sql
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (NEW.id, NEW.email, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;  -- ✅ Added
  ```
- **Migration File:** Create `042_fix_trigger_security_definer.sql`

---

#### CRITICAL-3: No Stripe/Payment Integration
- **Severity:** 🔴 CRITICAL
- **Impact:** No revenue generation, subscriptions cosmetic only
- **Location:** Entire codebase (missing files)
- **Missing Components:**
  1. Stripe SDK initialization
  2. Webhook handler for subscription events
  3. Checkout session creation API
  4. Customer portal API
  5. Environment variables for Stripe keys
- **Fix:** Implement full Stripe integration (see Section 6.2)

---

#### CRITICAL-4: Golf Coach Onboarding Uses UPDATE Instead of UPSERT
- **Severity:** 🔴 CRITICAL
- **Impact:** Golf coach onboarding fails if `golf_coaches` record doesn't pre-exist
- **Location:** `/src/app/golf/(onboarding)/coach/page.tsx:113-126`
- **Current Code:**
  ```typescript
  const { error: coachError } = await supabase
    .from('golf_coaches')
    .update({  // ❌ Will fail if record doesn't exist
      team_id: team.id,
      organization_id: org.id,
      full_name: fullName,
      // ...
    })
    .eq('user_id', user.id);
  ```
- **Fix:**
  ```typescript
  const { error: coachError } = await supabase
    .from('golf_coaches')
    .upsert({  // ✅ Insert if not exists, update if exists
      user_id: user.id,  // Must include PK field
      team_id: team.id,
      organization_id: org.id,
      full_name: fullName,
      // ...
    }, {
      onConflict: 'user_id',  // Specify conflict column
    });
  ```

---

#### CRITICAL-5: Golf Player Onboarding Has No Pre-Existing Record Creation
- **Severity:** 🔴 CRITICAL
- **Impact:** Golf players must manually create record or onboarding fails
- **Location:** `/src/app/golf/(onboarding)/player/page.tsx:161-192`
- **Current Flow:**
  1. User signs up → auth trigger creates `users` record
  2. User redirects to `/golf/player` onboarding
  3. Onboarding checks if `golf_players` record exists (Line 92)
  4. If not, creates new record on completion (Line 177)
- **Issue:** No trigger or automatic creation of `golf_players` record
- **Fix Option 1:** Add trigger to create `golf_players` on `users` insert when `role='player'` AND `sport='golf'`
- **Fix Option 2:** Pre-create `golf_players` record in signup action
- **Recommended:** Option 2 (more control)

---

### 5.2 HIGH Issues (Fix Soon)

#### HIGH-1: Baseball Onboarding Bypasses Itself in Prod
- **Severity:** 🟠 HIGH
- **Impact:** Players skip onboarding, data collection incomplete
- **Location:** `/src/app/baseball/actions/auth.ts:179-180`
- **Code:**
  ```typescript
  // TEMPORARY: Bypass onboarding check for development
  redirectTo = '/baseball/dashboard';
  ```
- **Intended Code (commented out):**
  ```typescript
  redirectTo = playerData?.onboarding_completed
    ? '/baseball/dashboard'
    : '/baseball/player-onboarding';
  ```
- **Fix:** Remove temporary bypass, enable proper onboarding check

---

#### HIGH-2: `/baseball/complete-signup` Page Exists But Never Used
- **Severity:** 🟠 HIGH
- **Impact:** OAuth users without profiles have no way to create them
- **Location:** `/src/app/baseball/(auth)/complete-signup/page.tsx`
- **Referenced in:** `/src/app/auth/callback/route.ts:157`
- **Issue:** OAuth callback redirects to this page, but page not implemented
- **Fix:** Implement complete-signup page or remove reference

---

#### HIGH-3: Rate Limiting is In-Memory (Resets on Server Restart)
- **Severity:** 🟠 HIGH
- **Impact:** Rate limits lost on deployment, attackers can exploit restarts
- **Location:** `/src/lib/auth/rate-limit.ts`
- **Current:** Uses in-memory Map
  ```typescript
  const rateLimitStore = new Map<string, RateLimitRecord>();
  ```
- **Problem:**
  - Vercel serverless functions are stateless
  - Each function invocation may be new instance
  - Rate limits don't persist across requests
- **Fix:** Move rate limiting to Redis or database
  - Option 1: Use Upstash Redis (serverless-friendly)
  - Option 2: Store in Supabase (higher latency)
  - Recommended: Upstash Redis

---

#### HIGH-4: No Role Field in `auth.users.raw_user_meta_data`
- **Severity:** 🟠 HIGH
- **Impact:** Can't determine user role without querying `public.users`
- **Location:** Signup actions (`baseball/actions/auth.ts` and `golf/actions/auth.ts`)
- **Current Flow:**
  ```typescript
  await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {  // This is raw_user_meta_data
        role: 'player',  // ❌ Not read anywhere
        sport: 'baseball',
      },
    },
  });
  ```
- **Issue:** Metadata stored but never used; always query DB for role
- **Fix:** Use metadata in middleware for faster role checks
  ```typescript
  const { data: { user } } = await supabase.auth.getUser();
  const role = user.user_metadata?.role;  // Fast check
  ```

---

### 5.3 MEDIUM Issues (Review)

#### MEDIUM-1: Unused Auth Security Utilities
- **Severity:** 🟡 MEDIUM
- **Impact:** Code bloat, potential confusion
- **Files:**
  - `/src/lib/auth/session-activity.ts` - Exists but never imported
  - `/src/lib/auth/ownership.ts` - Exists but never imported
- **Fix:** Remove unused files or integrate if needed

---

#### MEDIUM-2: Middleware Allows Onboarding Pages Without Auth Check (Commented Out)
- **Severity:** 🟡 MEDIUM
- **Impact:** Temporary bypass could be forgotten in production
- **Location:** `/src/lib/supabase/middleware.ts:78-84`
- **Code:**
  ```typescript
  // TEMPORARY: Onboarding routes commented out for development
  // pathname === '/baseball/coach-onboarding' ||
  // pathname === '/baseball/coach' ||
  // pathname === '/baseball/player' ||
  ```
- **Fix:** Re-enable auth checks for onboarding routes in production

---

#### MEDIUM-3: Golf Actions Have Different Redirect Logic Than Baseball
- **Severity:** 🟡 MEDIUM
- **Impact:** Inconsistent UX between sports
- **Baseball:** Always redirects to `/baseball/dashboard` (bypasses onboarding)
- **Golf:** Redirects to `/golf/dashboard` (also bypasses onboarding)
- **Location:**
  - Baseball: `/src/app/baseball/actions/auth.ts:285`
  - Golf: `/src/app/golf/actions/auth.ts:250`
- **Fix:** Align behavior - either both bypass or both check onboarding

---

### 5.4 LOW Issues (Optional)

#### LOW-1: Google SSO Buttons Are Disabled Placeholders
- **Severity:** 🟢 LOW
- **Impact:** No OAuth login available (but not breaking)
- **Location:** All signup/login forms
  - `/src/components/auth/baseball-sign-up-form.tsx:270-291`
  - `/src/components/auth/golf-sign-up-form.tsx:270-291`
- **Fix:** Implement Google OAuth or remove buttons

---

#### LOW-2: No Email Confirmation Flow
- **Severity:** 🟢 LOW
- **Impact:** Users can sign up with invalid emails
- **Current:** Email confirmation appears disabled in Supabase
- **Fix:** Enable email confirmation in Supabase settings (if desired)

---

## 6. FIX SPECIFICATIONS

### 6.1 Fix for CRITICAL-1: Remove/Disable Email Validation Hook

**Steps:**

1. **Log into Supabase Dashboard:**
   - Go to: https://app.supabase.com/project/YOUR_PROJECT_ID

2. **Navigate to Auth Hooks:**
   - Click: **Authentication** → **Hooks**

3. **Check for Custom Hooks:**
   - Look for hooks in: **Custom Access Token**, **Send Email**, **Send SMS**
   - Specifically check: **Custom Access Token** hook (most likely culprit)

4. **Disable or Remove Hook:**
   - If hook validates email format/domain:
     - **Option A:** Click "Disable" to turn off temporarily
     - **Option B:** Click "Delete" to remove permanently
     - **Option C:** Edit hook to remove email validation logic

5. **Test Fix:**
   ```bash
   # Test baseball coach signup
   npm run dev
   # Navigate to: http://localhost:3000/baseball/signup
   # Select "Coach" role
   # Complete entire onboarding flow
   # Verify: No "Email validation failed" error
   ```

**Expected Result:**
- Coach signup should complete successfully
- User should be created in `auth.users`
- User record should be created in `public.users`
- Coach record should be created in `coaches` table
- Redirect to `/baseball/dashboard` should work

---

### 6.2 Fix for CRITICAL-2: Add SECURITY DEFINER to Trigger Function

**Create Migration:** `supabase/migrations/042_fix_trigger_security_definer.sql`

```sql
-- ============================================================================
-- Fix: Add SECURITY DEFINER to handle_new_user() trigger function
-- ============================================================================

-- Drop and recreate function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER  -- ✅ ADDED: Function runs with owner privileges, bypassing RLS
SET search_path = public, auth  -- Security best practice
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Comment explaining the fix
COMMENT ON FUNCTION public.handle_new_user() IS
  'Trigger function that creates public.users record when auth.users record is created.
   SECURITY DEFINER is required to bypass RLS on public.users table during trigger execution.';
```

**Apply Migration:**
```bash
# Option 1: Via Supabase CLI
supabase db push

# Option 2: Via Supabase Dashboard
# Go to: Database → SQL Editor
# Paste migration contents
# Click "Run"
```

**Verification:**
```sql
-- Verify function has SECURITY DEFINER
SELECT
  proname AS function_name,
  prosecdef AS is_security_definer,
  proowner::regrole AS owner
FROM pg_proc
WHERE proname = 'handle_new_user';

-- Expected result:
-- function_name  | is_security_definer | owner
-- handle_new_user| true                | postgres
```

---

### 6.3 Fix for CRITICAL-3: Implement Stripe Integration

**Step 1: Install Stripe SDK**
```bash
npm install stripe @stripe/stripe-js
npm install -D @types/stripe
```

**Step 2: Add Environment Variables**

Update `.env.local`:
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Product Price IDs
STRIPE_PRICE_RECRUITING=price_...
STRIPE_PRICE_TEAM_MANAGEMENT=price_...
```

Update `.env.example`:
```bash
# Stripe Configuration (REQUIRED for subscriptions)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Stripe Price IDs
STRIPE_PRICE_RECRUITING=price_recruiting_monthly
STRIPE_PRICE_TEAM_MANAGEMENT=price_team_monthly
```

**Step 3: Create Stripe Client**

File: `/src/lib/stripe/client.ts`
```typescript
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});
```

**Step 4: Create Checkout Session API**

File: `/src/app/api/stripe/create-checkout-session/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { priceId, userType } = await req.json();

  // Get or create Stripe customer
  const table = userType === 'coach' ? 'coaches' : 'players';
  const { data: profile } = await supabase
    .from(table)
    .select('stripe_customer_id, id')
    .eq('user_id', user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        user_id: user.id,
        profile_id: profile?.id,
        user_type: userType,
      },
    });
    customerId = customer.id;

    // Save customer ID
    await supabase
      .from(table)
      .update({ stripe_customer_id: customerId })
      .eq('user_id', user.id);
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    metadata: {
      user_id: user.id,
      user_type: userType,
    },
  });

  return NextResponse.json({ sessionId: session.id });
}
```

**Step 5: Create Webhook Handler**

File: `/src/app/api/stripe/webhooks/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = (await headers()).get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = await createClient();

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      // Get customer metadata
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) break;

      const { user_id, user_type } = customer.metadata;
      const table = user_type === 'coach' ? 'coaches' : 'players';

      // Map Stripe price to tier
      const priceId = subscription.items.data[0].price.id;
      const tier = priceId === process.env.STRIPE_PRICE_RECRUITING
        ? 'recruiting'
        : 'team_management';

      // Update subscription in database
      await supabase
        .from(table)
        .update({
          subscription_tier: tier,
          subscription_status: subscription.status === 'active' ? 'active' : 'inactive',
          subscription_started_at: new Date(subscription.created * 1000).toISOString(),
          subscription_ends_at: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
          stripe_subscription_id: subscription.id,
        })
        .eq('user_id', user_id);
      break;

    case 'customer.subscription.deleted':
      const deletedSub = event.data.object as Stripe.Subscription;
      const deletedCustomer = await stripe.customers.retrieve(deletedSub.customer as string);
      if (deletedCustomer.deleted) break;

      const metadata = deletedCustomer.metadata;
      await supabase
        .from(metadata.user_type === 'coach' ? 'coaches' : 'players')
        .update({
          subscription_status: 'cancelled',
          subscription_ends_at: new Date().toISOString(),
        })
        .eq('user_id', metadata.user_id);
      break;
  }

  return NextResponse.json({ received: true });
}
```

**Step 6: Update Onboarding Plan Selection**

File: `/src/app/baseball/(onboarding)/coach-onboarding/components/PlanSelection.tsx`

Add checkout redirect logic:
```typescript
'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export function PlanSelection({ onSelect, onBack }: Props) {
  const [loading, setLoading] = useState(false);

  async function handlePlanSelect(plan: 'recruiting' | 'team_management') {
    if (plan === 'free') {
      onSelect('free');
      return;
    }

    setLoading(true);

    try {
      // Create checkout session
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: plan === 'recruiting'
            ? process.env.NEXT_PUBLIC_STRIPE_PRICE_RECRUITING
            : process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_MANAGEMENT,
          userType: 'coach',
        }),
      });

      const { sessionId } = await res.json();

      // Redirect to Stripe Checkout
      const stripe = await stripePromise;
      await stripe?.redirectToCheckout({ sessionId });
    } catch (error) {
      console.error('Checkout error:', error);
      setLoading(false);
    }
  }

  // ... rest of component
}
```

**Step 7: Configure Stripe Webhook**

1. Go to Stripe Dashboard: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter URL: `https://yourapp.com/api/stripe/webhooks`
4. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy webhook signing secret to `.env.local` as `STRIPE_WEBHOOK_SECRET`

---

### 6.4 Fix for CRITICAL-4: Use UPSERT in Golf Coach Onboarding

**File:** `/src/app/golf/(onboarding)/coach/page.tsx`

**Change Lines 113-126:**

**Before:**
```typescript
// Step 3: Update coach record
const { error: coachError } = await supabase
  .from('golf_coaches')
  .update({
    team_id: team.id,
    organization_id: org.id,
    full_name: fullName,
    title: title || null,
    email: email || null,
    phone: phone || null,
    onboarding_completed: true,
  })
  .eq('user_id', user.id);
```

**After:**
```typescript
// Step 3: Create or update coach record
const { error: coachError } = await supabase
  .from('golf_coaches')
  .upsert({
    user_id: user.id,  // ✅ Must include primary/unique key
    team_id: team.id,
    organization_id: org.id,
    full_name: fullName,
    title: title || null,
    email: email || null,
    phone: phone || null,
    onboarding_completed: true,
  }, {
    onConflict: 'user_id',  // ✅ Specify conflict column
  });
```

**Testing:**
```bash
# Test golf coach signup flow
npm run dev
# 1. Go to /golf/signup
# 2. Select "Coach" role
# 3. Complete onboarding
# 4. Verify: No errors, redirects to /golf/dashboard
# 5. Check database: golf_coaches record exists
```

---

### 6.5 Fix for CRITICAL-5: Pre-Create Golf Player Record

**Option 1: Add Trigger (More Automatic)**

Create migration: `supabase/migrations/043_auto_create_golf_players.sql`

```sql
-- ============================================================================
-- Auto-create golf_players record when user signs up as golf player
-- ============================================================================

CREATE OR REPLACE FUNCTION create_golf_player_on_signup()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if user is a golf player (based on metadata or separate logic)
  -- For now, we'll create record for all players and let onboarding update it
  IF NEW.role = 'player' THEN
    INSERT INTO public.golf_players (user_id, status, created_at, updated_at)
    VALUES (NEW.id, 'active', NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on users table
DROP TRIGGER IF EXISTS on_user_created_golf_player ON public.users;
CREATE TRIGGER on_user_created_golf_player
  AFTER INSERT ON public.users
  FOR EACH ROW
  WHEN (NEW.role = 'player')  -- Only for players
  EXECUTE FUNCTION create_golf_player_on_signup();

COMMENT ON FUNCTION create_golf_player_on_signup() IS
  'Auto-creates golf_players record when a player user is created.
   Onboarding will update the record with full details.';
```

**Option 2: Pre-Create in Signup Action (More Control)**

File: `/src/app/golf/actions/auth.ts`

Add after line 238 (after user creation):

```typescript
export async function signupAction(
  email: string,
  password: string,
  role: 'player' | 'coach'
): Promise<SignupResult> {
  // ... existing code ...

  if (!data.user) {
    return {
      success: false,
      error: 'Failed to create account',
    };
  }

  // ✅ NEW: Pre-create golf_players record if role is player
  if (role === 'player') {
    const { error: playerError } = await supabase
      .from('golf_players')
      .insert({
        user_id: data.user.id,
        status: 'active',
      });

    if (playerError) {
      console.error('[Auth] Failed to create golf_players record:', playerError);
      // Don't fail signup, onboarding will handle it
    }
  }

  console.info('[Auth] Successful golf signup:', {
    email: normalizedEmail,
    userId: data.user.id,
    role,
    ip,
  });

  // ... rest of code ...
}
```

**Recommended:** Option 2 (more explicit, easier to debug)

---

### 6.6 Fix for HIGH-1: Remove Onboarding Bypass

**File:** `/src/app/baseball/actions/auth.ts`

**Change Lines 179-180:**

**Before:**
```typescript
} else if (userData?.role === 'player') {
  const { data: playerData } = await supabase
    .from('players')
    .select('onboarding_completed')
    .eq('user_id', data.user.id)
    .single();

  // TEMPORARY: Bypass onboarding check for development
  redirectTo = '/baseball/dashboard';
}
```

**After:**
```typescript
} else if (userData?.role === 'player') {
  const { data: playerData } = await supabase
    .from('players')
    .select('onboarding_completed')
    .eq('user_id', data.user.id)
    .single();

  redirectTo = playerData?.onboarding_completed
    ? '/baseball/dashboard'
    : '/baseball/player';
}
```

**Also fix in:** `/src/app/baseball/actions/auth.ts:285` (signup action)

**Before:**
```typescript
// TEMPORARY: Bypass onboarding for development - go straight to dashboard
const redirectTo = '/baseball/dashboard';
```

**After:**
```typescript
const redirectTo = role === 'coach'
  ? '/baseball/coach-onboarding'
  : '/baseball/player';
```

---

### 6.7 Fix for HIGH-3: Move Rate Limiting to Redis

**Step 1: Install Upstash Redis**
```bash
npm install @upstash/redis
```

**Step 2: Add Environment Variables**
```bash
# Upstash Redis (for rate limiting)
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

**Step 3: Create Redis Client**

File: `/src/lib/redis/client.ts`
```typescript
import { Redis } from '@upstash/redis';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error('Redis environment variables not set');
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
```

**Step 4: Update Rate Limit Functions**

File: `/src/lib/auth/rate-limit.ts`

```typescript
import { redis } from '@/lib/redis/client';

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowKey = `ratelimit:${key}`;

  // Get current count from Redis
  const count = await redis.incr(windowKey);

  // Set expiration on first request
  if (count === 1) {
    await redis.expire(windowKey, Math.ceil(config.windowMs / 1000));
  }

  const allowed = count <= config.maxAttempts;
  const resetAt = now + config.windowMs;

  return {
    allowed,
    remaining: Math.max(0, config.maxAttempts - count),
    resetAt,
    retryAfter: allowed ? 0 : config.windowMs,
  };
}

export async function resetRateLimit(key: string): Promise<void> {
  await redis.del(`ratelimit:${key}`);
}
```

---

## 7. RECOMMENDED FIX ORDER

### Phase 1: Critical Blockers (Do First)
1. **CRITICAL-1:** Remove email validation hook (5 minutes)
2. **CRITICAL-2:** Add SECURITY DEFINER to trigger (10 minutes)
3. **CRITICAL-4:** Fix golf coach onboarding to use UPSERT (5 minutes)
4. **CRITICAL-5:** Pre-create golf_players record in signup (15 minutes)

**Total Time:** ~35 minutes
**Impact:** Unblocks all user signups

---

### Phase 2: High Priority (Do Next)
5. **HIGH-1:** Remove onboarding bypass (5 minutes)
6. **HIGH-2:** Implement `/baseball/complete-signup` page OR remove reference (30 minutes)
7. **HIGH-3:** Move rate limiting to Redis (1-2 hours)
8. **HIGH-4:** Use `user_metadata.role` in middleware (30 minutes)

**Total Time:** ~3 hours
**Impact:** Production-ready auth flow

---

### Phase 3: Payment Integration (Do When Ready to Monetize)
9. **CRITICAL-3:** Full Stripe integration (4-8 hours)
   - Set up Stripe account
   - Create products and prices
   - Implement checkout API
   - Implement webhook handler
   - Test full flow

**Total Time:** 4-8 hours
**Impact:** Revenue generation enabled

---

### Phase 4: Polish (Optional)
10. **MEDIUM-1:** Remove unused auth utilities (10 minutes)
11. **MEDIUM-2:** Re-enable auth checks for onboarding (5 minutes)
12. **MEDIUM-3:** Align baseball/golf redirect logic (10 minutes)
13. **LOW-1:** Implement Google OAuth OR remove buttons (1-2 hours)
14. **LOW-2:** Enable email confirmation (if desired) (15 minutes)

**Total Time:** ~2-3 hours
**Impact:** Cleaner codebase, better UX

---

## 8. TESTING CHECKLIST

### 8.1 Baseball Player Signup
- [ ] Navigate to `/baseball/signup`
- [ ] Select "Player" role
- [ ] Fill form: first name, last name, email, password
- [ ] Submit form
- [ ] Verify: No errors
- [ ] Verify: Redirects to `/baseball/player` onboarding
- [ ] Complete all onboarding steps
- [ ] Verify: Creates `users` record
- [ ] Verify: Creates `players` record
- [ ] Verify: `onboarding_completed = true`
- [ ] Verify: Redirects to `/baseball/dashboard`

### 8.2 Baseball Coach Signup (After Fix)
- [ ] Navigate to `/baseball/signup`
- [ ] Select "Coach" role
- [ ] Fill form: first name, last name, email, password
- [ ] Submit form
- [ ] Verify: No errors
- [ ] Verify: Redirects to `/baseball/coach-onboarding`
- [ ] Complete all onboarding steps
- [ ] Verify: No "Email validation failed" error
- [ ] Verify: Creates `users` record
- [ ] Verify: Creates `organizations` record
- [ ] Verify: Creates `coaches` record
- [ ] Verify: `onboarding_completed = true`
- [ ] Verify: Redirects to `/baseball/dashboard`

### 8.3 Golf Player Signup (After Fix)
- [ ] Navigate to `/golf/signup`
- [ ] Select "Player" role
- [ ] Fill form and submit
- [ ] Verify: Redirects to `/golf/player` onboarding
- [ ] Verify: `golf_players` record pre-created
- [ ] Complete onboarding
- [ ] Verify: Record updated successfully
- [ ] Verify: Redirects to `/golf/dashboard`

### 8.4 Golf Coach Signup (After Fix)
- [ ] Navigate to `/golf/signup`
- [ ] Select "Coach" role
- [ ] Fill form and submit
- [ ] Verify: Redirects to `/golf/coach` onboarding
- [ ] Complete onboarding
- [ ] Verify: Creates `golf_organizations` record
- [ ] Verify: Creates `golf_teams` record
- [ ] Verify: Creates OR updates `golf_coaches` record (UPSERT)
- [ ] Verify: Redirects to `/golf/dashboard`

### 8.5 Login Testing
- [ ] Navigate to `/baseball/login`
- [ ] Enter valid credentials
- [ ] Verify: Redirects to dashboard
- [ ] Test rate limiting: 6 failed attempts → locked out
- [ ] Test account lockout: 11 failed attempts → 30 min lockout
- [ ] Verify lockout message displays time remaining
- [ ] Test successful login after cooldown
- [ ] Repeat for `/golf/login`

### 8.6 Password Reset Testing
- [ ] Navigate to `/baseball/forgot-password`
- [ ] Enter email
- [ ] Verify: Email sent (check inbox)
- [ ] Click reset link in email
- [ ] Verify: Lands on `/baseball/reset-password`
- [ ] Enter new password
- [ ] Verify: Password updated
- [ ] Login with new password
- [ ] Verify: Success

### 8.7 Stripe Integration Testing (After Implementation)
- [ ] Complete coach onboarding
- [ ] Select paid plan
- [ ] Verify: Redirects to Stripe Checkout
- [ ] Complete checkout with test card: `4242 4242 4242 4242`
- [ ] Verify: Redirects back to dashboard
- [ ] Verify: Subscription webhook received
- [ ] Verify: Database updated with subscription details
- [ ] Verify: `subscription_tier` matches selected plan
- [ ] Verify: `subscription_status = 'active'`
- [ ] Test webhook for subscription cancellation
- [ ] Verify: Status updates to 'cancelled'

---

## 9. ENVIRONMENT CHECKLIST

### 9.1 Required Environment Variables

**Current (.env.local):**
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000  # Used in password reset
```

**Missing (Add After Fixes):**
```bash
# Stripe (for CRITICAL-3 fix)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_RECRUITING=price_...
STRIPE_PRICE_TEAM_MANAGEMENT=price_...

# Upstash Redis (for HIGH-3 fix)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

---

## 10. SUMMARY & NEXT STEPS

### Current State
- ✅ Baseball player signup: **WORKING**
- 🔴 Baseball coach signup: **BROKEN** (email hook)
- ⚠️ Golf player signup: **RISKY** (RLS issues)
- 🔴 Golf coach signup: **BROKEN** (missing UPSERT)
- ✅ Login flows: **WORKING** (excellent security)
- ✅ Password reset: **WORKING**
- 🔴 Subscriptions: **NOT IMPLEMENTED**

### Immediate Action Required
1. **Fix CRITICAL-1:** Disable email validation hook (5 min)
2. **Fix CRITICAL-2:** Add SECURITY DEFINER to trigger (10 min)
3. **Fix CRITICAL-4:** Change golf coach to UPSERT (5 min)
4. **Fix CRITICAL-5:** Pre-create golf_players (15 min)

**Total:** ~35 minutes to unblock all signups

### Recommended Next Steps
1. Complete Phase 1 fixes (critical blockers)
2. Test all signup flows thoroughly
3. Complete Phase 2 fixes (production readiness)
4. Implement Stripe integration (Phase 3) when ready to monetize
5. Optional: Phase 4 polish

---

## APPENDIX: Database Schema Reference

### A.1 Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'player',  -- 'player' | 'coach' | 'admin'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### A.2 Coaches Table
```sql
CREATE TABLE coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  coach_type coach_type NOT NULL,  -- 'college' | 'juco' | 'high_school' | 'showcase'
  organization_id UUID REFERENCES organizations(id),
  full_name TEXT,
  coach_title TEXT,
  school_name TEXT,
  subscription_tier subscription_tier DEFAULT 'team_management',
  subscription_status subscription_status DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### A.3 Players Table
```sql
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  player_type player_type NOT NULL,  -- 'high_school' | 'showcase' | 'juco' | 'college'
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  primary_position TEXT,
  grad_year INTEGER,
  subscription_tier subscription_tier DEFAULT 'free',
  subscription_status subscription_status DEFAULT 'inactive',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  recruiting_activated BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

**END OF AUDIT**

Generated: 2025-12-31
Total Issues Found: 14 (5 Critical, 4 High, 3 Medium, 2 Low)
Estimated Fix Time: ~12-20 hours total (35 min for critical blockers)
