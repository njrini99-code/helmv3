# Authentication System Gaps Audit Report
## Helm Sports Labs - Critical Security & Data Integrity Analysis

**Report Date:** January 1, 2026
**Severity Classification:** Medium to High
**Status:** Action Required

---

## Executive Summary

This report details **5 identified gaps** in the authentication system that require attention. While the core authentication flows are functional, these gaps present potential security vulnerabilities, data consistency issues, and technical debt that should be addressed before production deployment.

| Gap ID | Severity | Category | Status |
|--------|----------|----------|--------|
| GAP-001 | **HIGH** | Security | Open |
| GAP-002 | **MEDIUM** | Data Integrity | Open |
| GAP-003 | **LOW** | Technical Debt | Open |
| GAP-004 | **MEDIUM** | Security | Open |
| GAP-005 | **LOW** | UX Consistency | Open |

---

## GAP-001: Cross-Sport Access Not Blocked in Middleware

### Severity: HIGH

### Description

The middleware does not explicitly prevent users from one sport from accessing routes of another sport. A user who signed up for golf could potentially navigate to `/baseball/dashboard` and vice versa.

### Affected Files

- [middleware.ts](src/middleware.ts)
- [supabase/middleware.ts](src/lib/supabase/middleware.ts)

### Current Behavior

```typescript
// src/lib/supabase/middleware.ts
function getSportFromPath(pathname: string): 'baseball' | 'golf' | null {
  if (pathname.startsWith('/baseball')) return 'baseball';
  if (pathname.startsWith('/golf')) return 'golf';
  return null;
}
```

The sport is detected from the URL path, but **no validation occurs** to ensure the authenticated user's sport matches the requested route's sport.

### Reproduction Steps

1. Create a golf user account via `/golf/signup`
2. Complete golf onboarding
3. Manually navigate to `/baseball/dashboard`
4. **Expected:** Redirect to `/golf/dashboard` with error message
5. **Actual:** Page attempts to load (may fail at component level, but not middleware)

### Impact

- **Security:** Users could potentially access data from wrong sport context
- **Data Corruption:** Actions taken in wrong sport context could create orphaned records
- **UX Confusion:** Users may see incorrect dashboards or error states

### Evidence

```typescript
// Current middleware - NO sport validation for authenticated users
export async function updateSession(request: NextRequest) {
  // ... session refresh code ...

  const sport = getSportFromPath(pathname);

  // Missing: Check if user.sport matches route sport
  // if (user && sport && user.sport !== sport) {
  //   return redirect to correct sport
  // }
}
```

### Recommended Fix

```typescript
// src/lib/supabase/middleware.ts - Add after line 89

// Get user's sport from metadata or database
const userSport = user?.user_metadata?.sport;

// If user has a sport and is accessing a different sport's routes
if (userSport && sport && userSport !== sport) {
  console.warn('[Security] Cross-sport access attempt blocked:', {
    userId: user.id,
    userSport,
    attemptedSport: sport,
    path: pathname,
  });

  // Redirect to user's correct sport dashboard
  return NextResponse.redirect(new URL(`/${userSport}/dashboard`, request.url));
}
```

### Priority: P0 - Fix Before Production

---

## GAP-002: Inconsistent Sport Column in Users Table

### Severity: MEDIUM

### Description

The `users` table has a `sport` column, but it is not consistently populated by the authentication trigger or signup flows. This creates data inconsistency and makes sport-based queries unreliable.

### Affected Files

- [042_fix_trigger_security_definer.sql](supabase/migrations/042_fix_trigger_security_definer.sql)
- [auth.ts (baseball)](src/app/baseball/actions/auth.ts)
- [auth.ts (golf)](src/app/golf/actions/auth.ts)

### Current Behavior

```sql
-- Current trigger creates users record WITHOUT sport
INSERT INTO public.users (id, email, role, created_at, updated_at)
VALUES (NEW.id, NEW.email, user_role::user_role, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = NOW();

-- Sport is extracted but NEVER inserted:
user_sport := COALESCE(NEW.raw_user_meta_data->>'sport', 'baseball');
```

### Database Analysis

```sql
-- Query to check sport column population
SELECT
  sport,
  COUNT(*) as count
FROM users
GROUP BY sport;

-- Expected if working: baseball: 10, golf: 9
-- Actual: Many rows have NULL sport
```

### Impact

- **Query Reliability:** Cannot reliably filter users by sport
- **Reporting:** Sport-based analytics will be inaccurate
- **Auth Callback:** Falls back to checking metadata, then 'baseball' default

### Evidence from Auth Callback

```typescript
// src/app/auth/callback/route.ts:139
// Determine sport: prefer metadata, then users table, default to baseball
const sport = userSport || userRecord?.sport || 'baseball';
```

The fallback chain indicates the code expects `users.sport` to potentially be null.

### Recommended Fix

**Option A: Update Trigger (Recommended)**

```sql
-- Updated INSERT statement
INSERT INTO public.users (id, email, role, sport, created_at, updated_at)
VALUES (
  NEW.id,
  NEW.email,
  user_role::user_role,
  user_sport,  -- Add sport column
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  sport = COALESCE(EXCLUDED.sport, public.users.sport),  -- Don't overwrite existing
  updated_at = NOW();
```

**Option B: Backfill Existing Data**

```sql
-- Backfill baseball users
UPDATE users u
SET sport = 'baseball'
WHERE EXISTS (SELECT 1 FROM coaches c WHERE c.user_id = u.id)
   OR EXISTS (SELECT 1 FROM players p WHERE p.user_id = u.id);

-- Backfill golf users
UPDATE users u
SET sport = 'golf'
WHERE EXISTS (SELECT 1 FROM golf_coaches gc WHERE gc.user_id = u.id)
   OR EXISTS (SELECT 1 FROM golf_players gp WHERE gp.user_id = u.id);
```

### Priority: P1 - Fix Within Sprint

---

## GAP-003: Redundant Database Operations in Onboarding

### Severity: LOW

### Description

Several onboarding flows perform redundant database operations that the trigger already handles. While not breaking functionality, this creates unnecessary database load and potential race conditions.

### Affected Files

- [coach-onboarding/page.tsx](src/app/baseball/(onboarding)/coach-onboarding/page.tsx)
- [golf coach onboarding](src/app/golf/(onboarding)/coach/page.tsx)
- [golf player onboarding](src/app/golf/(onboarding)/player/page.tsx)

### Current Behavior

```typescript
// Baseball coach onboarding - handleComplete()
// Step 2: Create user record with role (REDUNDANT - trigger already did this)
const { error: userError } = await supabase
  .from('users')
  .upsert(
    {
      id: userId,
      email: userEmail,
      role: data.role,
    },
    { onConflict: 'id' }
  );
```

```typescript
// Golf coach onboarding - handleComplete()
// IMPORTANT: Ensure the users table record exists
// The trigger should create it, but let's make sure
const { error: usersError } = await supabase
  .from('users')
  .upsert({
    id: user.id,
    email: user.email || '',
    role: 'coach',
    ...
  }, {
    onConflict: 'id',
    ignoreDuplicates: true,
  });
```

### Impact

- **Performance:** Extra database round-trip on every signup
- **Race Condition Risk:** If trigger is slow, upsert may conflict
- **Code Clarity:** Comments indicate uncertainty about trigger behavior

### Recommended Fix

1. **Trust the trigger:** Remove redundant upserts
2. **Add verification:** If concerned, query first before upserting
3. **Document:** Add clear comments about trigger behavior

```typescript
// Recommended approach
const { data: existingUser } = await supabase
  .from('users')
  .select('id')
  .eq('id', userId)
  .single();

if (!existingUser) {
  console.error('Trigger failed to create user record');
  // Handle error case
}

// Continue with profile-specific operations
```

### Priority: P2 - Address in Refactoring Sprint

---

## GAP-004: OAuth Users May Bypass Sport Selection

### Severity: MEDIUM

### Description

Users authenticating via OAuth (Google, etc.) do not go through the sport selection flow. The system defaults them to baseball, which may not be their intended sport.

### Affected Files

- [auth/callback/route.ts](src/app/auth/callback/route.ts)
- [complete-signup/page.tsx](src/app/baseball/(auth)/complete-signup/page.tsx)

### Current Behavior

```typescript
// src/app/auth/callback/route.ts:139
// Determine sport: prefer metadata, then users table, default to baseball
const sport = userSport || userRecord?.sport || 'baseball';
```

OAuth users don't have sport in metadata (set during email/password signup), so they default to baseball.

### Reproduction Steps

1. Go to `/golf/login`
2. Click "Continue with Google"
3. Complete OAuth flow
4. **Expected:** Directed to golf-specific flow
5. **Actual:** Directed to `/baseball/complete-signup` (baseball default)

### Impact

- **UX:** Golf users using OAuth end up in baseball flow
- **Data:** Users may create wrong sport profile
- **Support:** Requires manual intervention to fix

### Evidence

The complete-signup page only offers baseball profile options:

```typescript
// src/app/baseball/(auth)/complete-signup/page.tsx
// Only checks coaches/players tables (baseball)
const { data: coach } = await supabase
  .from('coaches')
  .select('id')
  .eq('user_id', user.id)
  .single();
```

### Recommended Fix

**Option A: Sport-Aware Complete Signup**

Create `/golf/complete-signup` or add sport parameter:

```typescript
// Auth callback - preserve intended sport
const intendedSport = requestUrl.searchParams.get('sport') ||
                      new URL(request.headers.get('referer') || '').pathname.includes('golf')
                        ? 'golf'
                        : 'baseball';

return NextResponse.redirect(
  new URL(`/${intendedSport}/complete-signup`, requestUrl.origin)
);
```

**Option B: Unified Sport Selection Page**

Create a `/complete-signup` page that asks for sport first:

```typescript
// New unified page
export default function CompleteSignup() {
  const [sport, setSport] = useState<'baseball' | 'golf' | null>(null);

  if (!sport) {
    return <SportSelectionStep onSelect={setSport} />;
  }

  return sport === 'golf'
    ? <GolfProfileSetup />
    : <BaseballProfileSetup />;
}
```

### Priority: P1 - Fix Before OAuth Launch

---

## GAP-005: Inconsistent Error Handling Across Sports

### Severity: LOW

### Description

Error handling and user feedback is inconsistent between baseball and golf authentication flows. This affects user experience and makes debugging harder.

### Affected Files

- [baseball/actions/auth.ts](src/app/baseball/actions/auth.ts)
- [golf/actions/auth.ts](src/app/golf/actions/auth.ts)
- Various onboarding pages

### Current Behavior Comparison

| Aspect | Baseball | Golf |
|--------|----------|------|
| Rate limit message | "Too many attempts" | "Too many attempts" |
| Invalid credentials | "Invalid email or password" | "Invalid email or password" |
| Account locked | Shows retry time | Shows retry time |
| Signup validation error | Varies by component | Varies by component |
| Network error | Generic message | Generic message |

### Specific Issues

**1. Baseball coach onboarding shows auth hook details:**

```typescript
// Exposes internal implementation
if (authError.message.includes('validate email')) {
  setError(
    'Email validation failed. This is likely due to a Supabase Auth Hook. ' +
    'Please go to Supabase Dashboard > Authentication > Hooks...'
  );
}
```

**2. Golf onboarding shows raw error messages:**

```typescript
// May expose database column names
if (coachError) {
  setError(`Failed to create organization: ${orgError.message}`);
}
```

### Impact

- **Security:** Error messages may leak implementation details
- **UX:** Inconsistent messaging confuses users
- **Support:** Harder to diagnose issues from user reports

### Recommended Fix

**Create centralized error handling:**

```typescript
// src/lib/auth/error-messages.ts
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'The email or password you entered is incorrect.',
  RATE_LIMITED: 'Too many attempts. Please try again in {time}.',
  ACCOUNT_LOCKED: 'Account temporarily locked. Try again in {time}.',
  NETWORK_ERROR: 'Connection error. Please check your internet and try again.',
  SIGNUP_FAILED: 'Unable to create account. Please try again.',
  PROFILE_FAILED: 'Unable to complete profile setup. Please try again.',
} as const;

export function getAuthErrorMessage(error: Error): string {
  // Map error codes to user-friendly messages
  // Log detailed error for debugging, show generic to user
}
```

### Priority: P2 - Address in Polish Sprint

---

## Summary of Fixes Required

### Immediate (P0)

| Gap | Fix | Effort |
|-----|-----|--------|
| GAP-001 | Add cross-sport middleware check | 2 hours |

### This Sprint (P1)

| Gap | Fix | Effort |
|-----|-----|--------|
| GAP-002 | Update trigger + backfill data | 4 hours |
| GAP-004 | Sport-aware OAuth flow | 6 hours |

### Next Sprint (P2)

| Gap | Fix | Effort |
|-----|-----|--------|
| GAP-003 | Remove redundant operations | 2 hours |
| GAP-005 | Centralize error handling | 4 hours |

---

## Appendix: SQL Scripts for Fixes

### A1: Update Trigger to Include Sport

```sql
-- Migration: 046_fix_trigger_add_sport.sql

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  user_role text;
  user_sport text;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'player');
  user_sport := COALESCE(NEW.raw_user_meta_data->>'sport', 'baseball');

  -- Create users record WITH sport
  INSERT INTO public.users (id, email, role, sport, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role::user_role,
    user_sport,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    sport = COALESCE(EXCLUDED.sport, public.users.sport),
    updated_at = NOW();

  -- Rest of trigger unchanged...
  -- [Profile creation code]

  RETURN NEW;
END;
$$;
```

### A2: Backfill Existing Users

```sql
-- One-time migration: 047_backfill_user_sports.sql

-- Set sport for users with baseball profiles
UPDATE public.users u
SET sport = 'baseball', updated_at = NOW()
WHERE sport IS NULL
  AND (
    EXISTS (SELECT 1 FROM public.coaches c WHERE c.user_id = u.id)
    OR EXISTS (SELECT 1 FROM public.players p WHERE p.user_id = u.id)
  );

-- Set sport for users with golf profiles
UPDATE public.users u
SET sport = 'golf', updated_at = NOW()
WHERE sport IS NULL
  AND (
    EXISTS (SELECT 1 FROM public.golf_coaches gc WHERE gc.user_id = u.id)
    OR EXISTS (SELECT 1 FROM public.golf_players gp WHERE gp.user_id = u.id)
  );

-- Verify results
SELECT sport, COUNT(*) FROM public.users GROUP BY sport;
```

### A3: Add Sport Column Constraint

```sql
-- After backfill, add NOT NULL constraint
ALTER TABLE public.users
  ALTER COLUMN sport SET NOT NULL,
  ALTER COLUMN sport SET DEFAULT 'baseball';

-- Add check constraint
ALTER TABLE public.users
  ADD CONSTRAINT users_sport_check
  CHECK (sport IN ('baseball', 'golf'));
```

---

**Report Prepared By:** Claude Code
**Review Status:** Pending Engineering Review
