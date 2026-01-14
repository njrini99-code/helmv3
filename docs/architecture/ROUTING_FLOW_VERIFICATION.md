# Routing Flow Verification

**Status:** ⚠️ **Needs Testing - Development Middleware Bypassed**

**Date:** December 26, 2024

---

## Complete User Flow Map

### Landing Page → Sign In/Sign Up → Onboarding → Dashboard

```
Landing Page (/)
    │
    ├─ Click "Explore BaseballHelm" → /baseball
    │                                      │
    │                                      ├─ "I'm a Coach" → /baseball/coach-onboarding
    │                                      └─ "I'm a Player" → /baseball/player
    │
    └─ Click "Explore GolfHelm" → /golf
                                      │
                                      ├─ "I'm a Coach" → /golf/coach
                                      └─ "I'm a Player" → /golf/player
```

---

## Route Mapping

### Baseball Routes

| User Action | Button Link | Actual URL | File Path | Status |
|------------|-------------|------------|-----------|--------|
| Visit product page | `/baseball` | `/baseball` | `src/app/baseball/page.tsx` | ✅ Exists |
| Click "I'm a Coach" | `/baseball/(auth)/coach-onboarding` | `/baseball/coach-onboarding` | `src/app/baseball/(onboarding)/coach-onboarding/page.tsx` | ✅ Exists |
| Click "I'm a Player" | `/baseball/(onboarding)/player` | `/baseball/player` | `src/app/baseball/(onboarding)/player/page.tsx` | ✅ Exists |
| Login page | - | `/baseball/login` | `src/app/baseball/(auth)/login/page.tsx` | ✅ Exists |
| Signup page | - | `/baseball/signup` | `src/app/baseball/(auth)/signup/page.tsx` | ✅ Exists |
| Dashboard | - | `/baseball/dashboard` | `src/app/baseball/(dashboard)/dashboard/page.tsx` | ✅ Exists |

**Note:** Route groups like `(auth)` and `(onboarding)` don't affect the URL - they're just for organization.

### Golf Routes

| User Action | Button Link | Actual URL | File Path | Status |
|------------|-------------|------------|-----------|--------|
| Visit product page | `/golf` | `/golf` | `src/app/golf/page.tsx` | ✅ Exists |
| Click "I'm a Coach" | `/golf/(onboarding)/coach` | `/golf/coach` | `src/app/golf/(onboarding)/coach/page.tsx` | ✅ Exists |
| Click "I'm a Player" | `/golf/(onboarding)/player` | `/golf/player` | `src/app/golf/(onboarding)/player/page.tsx` | ✅ Exists |
| Login page | - | `/golf/login` | `src/app/golf/(auth)/login/page.tsx` | ✅ Exists |
| Signup page | - | `/golf/signup` | `src/app/golf/(auth)/signup/page.tsx` | ✅ Exists |
| Dashboard | - | `/golf/dashboard` | `src/app/golf/(dashboard)/dashboard/page.tsx` | ✅ Exists |

---

## Middleware Logic

### Authentication Flow (Production Only)

**⚠️ CRITICAL:** Middleware is **completely bypassed** in development mode.

```typescript
// src/middleware.ts (lines 16-18)
if (process.env.NODE_ENV === 'development') {
  return NextResponse.next(); // NO AUTH CHECKS IN DEV
}
```

This means in development:
- All routes are accessible without authentication
- No redirects to login pages
- Onboarding completion checks don't run
- Role-based routing doesn't work

### Production Middleware Behavior

**Public Routes** (always accessible):
- Landing page: `/`
- Product pages: `/baseball`, `/golf`
- Auth pages: `/baseball/login`, `/baseball/signup`, `/golf/login`, `/golf/signup`
- Onboarding pages:
  - `/baseball/coach-onboarding` ✅
  - `/baseball/coach` ✅
  - `/baseball/player` ✅
  - `/golf/coach-onboarding` ⚠️ **Page doesn't exist** (should be `/golf/coach`)
  - `/golf/coach` ✅
  - `/golf/player` ✅

**Protected Routes** (require authentication):
- Dashboard routes: `/baseball/dashboard/*`, `/golf/dashboard/*`

**Redirect Logic:**
1. **Unauthenticated user accessing dashboard** → Redirect to login
2. **Authenticated user on login/signup page** → Check onboarding status:
   - If `onboarding_completed = true` → Redirect to dashboard
   - If `onboarding_completed = false` → Redirect to onboarding page

---

## Current Issues

### 1. Development Mode Bypass

**Issue:** Middleware is completely bypassed in development mode (line 16-18 in `src/middleware.ts`).

**Impact:**
- Can't test authentication flow in development
- Can't verify login redirects
- Can't test onboarding completion checks

**Recommended Fix:**
```typescript
// src/middleware.ts
export async function middleware(request: NextRequest) {
  // Remove or comment out the dev bypass to test auth flow
  // if (process.env.NODE_ENV === 'development') {
  //   return NextResponse.next();
  // }

  return await updateSession(request);
}
```

### 2. Sport-Specific Signout Redirect

**Issue:** `useAuth` hook always redirects to `/baseball/login` when user signs out (line 47 in `src/hooks/use-auth.ts`).

**Impact:**
- Golf users who sign out get redirected to Baseball login page

**Current Code:**
```typescript
// src/hooks/use-auth.ts (line 47)
if (event === 'SIGNED_OUT') {
  clear();
  router.push('/baseball/login'); // Always baseball!
}
```

**Recommended Fix:**
- Detect current sport from URL path
- Redirect to sport-specific login page

### 3. Middleware Golf Route Mismatch

**Issue:** Middleware checks for `/golf/coach-onboarding` but that page doesn't exist (line 35 in `src/lib/supabase/middleware.ts`).

**Impact:**
- None currently, since `/golf/coach` is also listed as public route
- Could cause confusion

**Fix:** Remove redundant check or update to correct path.

---

## Expected User Journeys

### New Baseball Player (No Account)

```
1. Landing page (/) → Click "Explore BaseballHelm"
2. Product page (/baseball) → Click "I'm a Player"
3. Onboarding page (/baseball/player) → See "Sign Up" prompt
4. Click "Sign Up" → Auth page (/baseball/signup)
5. Complete signup → Auto-redirect back to /baseball/player
6. Complete onboarding form → Set onboarding_completed = true
7. Auto-redirect to /baseball/dashboard
```

### Existing Baseball Coach (Has Account, Completed Onboarding)

```
1. Landing page (/) → Click "Explore BaseballHelm"
2. Product page (/baseball) → Click "I'm a Coach"
3. Onboarding page (/baseball/coach-onboarding) → Detect already authenticated
4. Middleware checks onboarding_completed → true
5. Auto-redirect to /baseball/dashboard
```

### Existing Golf Player (Has Account, NOT Completed Onboarding)

```
1. Landing page (/) → Click "Explore GolfHelm"
2. Product page (/golf) → Click "I'm a Player"
3. Onboarding page (/golf/player) → Detect already authenticated
4. Middleware checks onboarding_completed → false
5. Stay on /golf/player to complete onboarding
6. Complete onboarding → Set onboarding_completed = true
7. Auto-redirect to /golf/dashboard
```

---

## Testing Checklist

### Manual Testing (Development)

**⚠️ Note:** Must disable dev bypass in middleware to test auth flow.

- [ ] Landing page loads correctly
- [ ] BaseballHelm button routes to `/baseball` product page
- [ ] GolfHelm button routes to `/golf` product page
- [ ] Baseball "I'm a Coach" routes to `/baseball/coach-onboarding`
- [ ] Baseball "I'm a Player" routes to `/baseball/player`
- [ ] Golf "I'm a Coach" routes to `/golf/coach`
- [ ] Golf "I'm a Player" routes to `/golf/player`

### Authentication Flow Testing

**Scenario 1: New User (Not Authenticated)**
- [ ] Visiting onboarding page shows signup prompt
- [ ] Clicking signup routes to `/[sport]/signup`
- [ ] After signup, redirects back to onboarding
- [ ] After completing onboarding, redirects to dashboard

**Scenario 2: Existing User (Authenticated, Onboarding Complete)**
- [ ] Visiting onboarding page auto-redirects to dashboard
- [ ] Dashboard loads successfully
- [ ] New micro-interactions visible (buttons, toasts, etc.)
- [ ] Premium gradient background visible

**Scenario 3: Existing User (Authenticated, Onboarding Incomplete)**
- [ ] Visiting onboarding page allows completion
- [ ] After completing onboarding, redirects to dashboard
- [ ] Dashboard accessible after completion

### Dashboard Features Testing

- [ ] Premium gradient background visible (`bg-dashboard-gradient`)
- [ ] Micro-interactions working:
  - [ ] Button hover effects (lift + shadow)
  - [ ] Button loading states (spinner)
  - [ ] Toast notifications
  - [ ] Smooth transitions
- [ ] Baseball dashboard shows updated styling
- [ ] Golf dashboard shows updated styling (matches Baseball)

---

## Production Readiness

### Before Deploying

1. **Enable Middleware in Production:**
   - Middleware should only run in production
   - Verify `process.env.NODE_ENV === 'production'` check works

2. **Test Complete Flows:**
   - New user signup → onboarding → dashboard
   - Existing user login → dashboard (if onboarding complete)
   - Existing user login → onboarding → dashboard (if not complete)

3. **Verify Sport-Specific Routing:**
   - Baseball users stay in Baseball routes
   - Golf users stay in Golf routes
   - Signout redirects to correct sport login

4. **Check Database Flags:**
   - `onboarding_completed` field exists and defaults to `false`
   - Middleware correctly reads this flag
   - Dashboard layouts check this flag

---

## Onboarding Completion Detection

### Baseball Dashboard Layout

**File:** `src/app/baseball/(dashboard)/layout.tsx`

**Status:** ✅ Not checking onboarding completion currently (allows access)

### Golf Dashboard Layout

**File:** `src/app/golf/(dashboard)/layout.tsx` (lines 116-140)

**Status:** ✅ Checks onboarding completion and redirects if needed

```typescript
// Golf layout checks onboarding status (lines 116-140)
useEffect(() => {
  async function checkOnboarding() {
    if (!user?.id) return;

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role === 'coach') {
      const { data: coach } = await supabase
        .from('coaches')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .single();

      if (coach && !coach.onboarding_completed) {
        router.push('/golf/coach');
      }
    }
    // Similar check for players...
  }

  checkOnboarding();
}, [user]);
```

**Recommendation:** Baseball dashboard should implement similar check for consistency.

---

## Summary

### ✅ What Works

- All route files exist and are accessible
- Product pages route to correct onboarding pages
- Golf dashboard has onboarding completion check
- Premium gradient background applied to both dashboards
- Micro-interactions implemented across UI

### ⚠️ What Needs Testing

- Authentication flow (currently bypassed in dev)
- Login/signup redirects
- Onboarding completion redirects
- Sport-specific routing after signout

### 🔧 Recommended Fixes

1. **Temporarily disable dev bypass** in middleware to test auth flow
2. **Fix sport-specific signout** in `use-auth.ts`
3. **Add onboarding check** to Baseball dashboard layout
4. **Clean up middleware** - remove `/golf/coach-onboarding` check

---

**Testing Instructions:**

To properly test the complete flow:

1. Comment out lines 16-18 in `src/middleware.ts`:
```typescript
// if (process.env.NODE_ENV === 'development') {
//   return NextResponse.next();
// }
```

2. Run `npm run dev`

3. Test each user journey:
   - New user (not signed in) → onboarding → signup → complete → dashboard
   - Existing user (signed in, onboarding done) → direct to dashboard
   - Existing user (signed in, onboarding not done) → complete onboarding → dashboard

4. Verify new features visible:
   - Premium gradient backgrounds
   - Button micro-interactions
   - Toast notifications
   - Smooth transitions

---

**Document created by:** Claude Code
**Date:** December 26, 2024
**Related Docs:** BACKGROUND_SYSTEM_AUDIT.md, MICRO_INTERACTIONS_VERIFICATION.md
