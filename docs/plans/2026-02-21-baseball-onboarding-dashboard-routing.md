# Baseball Onboarding Type Selection + Dashboard Routing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the redundant role-selection step in coach onboarding with a coach-type selection step, add a player-type selection step to player onboarding, create nested dashboard routes per type (`/baseball/coach/{type}` and `/baseball/player/{type}`), and update all auth routing to send users to the correct type-specific dashboard.

**Architecture:** The existing `/baseball/dashboard` page uses client-side redirects based on `coach_type`/`player_type` to route users to the right view. We'll replace this with proper Next.js route groups: `/baseball/(coach-dashboard)/coach/[type]/` and `/baseball/(player-dashboard)/player/[type]/` with shared layouts per role. Onboarding flows will be updated to collect type before other data and redirect to the correct dashboard on completion.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Tailwind CSS, Framer Motion

---

## Task 1: Update Coach Onboarding — Replace Role Selection with Type Selection

**Files:**
- Modify: `src/app/baseball/(onboarding)/coach-onboarding/page.tsx`

**Context:** The current coach onboarding Step 0 (`step === 'role'`) lets users pick Coach vs Player. Since role is already chosen at signup, replace this with a Coach Type selection: College Coach, JUCO Coach, High School Coach, Showcase Coach. This replaces the existing `teamLevel` + `division` approach — the type is chosen directly instead of being derived.

**Step 1: Update types and state**

Change the `Step` type to replace `'role'` with `'type'`:
```typescript
type Step = 'type' | 'program' | 'account' | 'plan' | 'complete';
```

Add coach type state:
```typescript
const [coachType, setCoachType] = useState<'college' | 'juco' | 'high_school' | 'showcase' | ''>('');
```

Update initial step from `'role'` to `'type'`:
```typescript
const [step, setStep] = useState<Step>('type');
```

Remove `teamLevel` and `division` state variables (they become derived from `coachType`).

**Step 2: Replace the role selection UI**

Replace the `step === 'role'` block (lines 539-600) with a Coach Type selection using the same card UI:

```tsx
{step === 'type' && (
  <m.div key="type" custom={direction} variants={slideVariants} initial="initial" animate="animate" exit="exit" className="w-full max-w-[460px]">
    <m.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
      <m.div variants={staggerItem} className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">What type of coach are you?</h1>
        <p className="text-warm-500 mt-2 text-sm sm:text-base">This determines your dashboard experience</p>
      </m.div>
      <m.div variants={staggerItem} className="space-y-3">
        {([
          { value: 'college' as const, label: 'College Coach', desc: 'NCAA D1, D2, D3, or NAIA program', emoji: '🏟️' },
          { value: 'juco' as const, label: 'JUCO Coach', desc: 'Junior college / community college', emoji: '🎓' },
          { value: 'high_school' as const, label: 'High School Coach', desc: 'High school varsity or JV program', emoji: '🏫' },
          { value: 'showcase' as const, label: 'Showcase Coach', desc: 'Travel ball or showcase organization', emoji: '⚾' },
        ]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setCoachType(opt.value); goForward('program'); }}
            className="w-full auth-glass-card rounded-2xl p-5 text-left hover:bg-white/90 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">{opt.emoji}</div>
              <div>
                <p className="text-lg font-semibold text-warm-900">{opt.label}</p>
                <p className="text-sm text-warm-500">{opt.desc}</p>
              </div>
              <IconArrowRight size={16} className="ml-auto text-warm-400 group-hover:text-warm-600 transition-colors" />
            </div>
          </button>
        ))}
      </m.div>
    </m.div>
  </m.div>
)}
```

**Step 3: Update program step**

In the `step === 'program'` block:
- Remove the "Team Level" selector (now derived from `coachType`)
- Show the Division selector only for `coachType === 'college'` (options: D1, D2, D3, NAIA)
- Keep school name, city, state fields
- Update the back button to go back to `'type'` instead of `'role'`

**Step 4: Update `handleSubmit` and `createCoachRecords`**

The `coachType` derivation logic (lines 400-403) is no longer needed — use the `coachType` state directly:
```typescript
// Before (delete this):
let coachType: 'college' | 'juco' | 'high_school' | 'showcase' = 'college';
if (teamLevel === 'high-school') coachType = 'high_school';
else if (teamLevel === 'showcase') coachType = 'showcase';
else if (division === 'JUCO') coachType = 'juco';

// After:
const finalCoachType = coachType as 'college' | 'juco' | 'high_school' | 'showcase';
```

**Step 5: Update redirect after onboarding completion**

In `createCoachRecords()` (line 387) and `handleGoToDashboard()` (line 487), change the redirect from `/baseball/dashboard` to the type-specific dashboard:
```typescript
const dashboardPath = `/baseball/coach/${coachType.replace('_', '-')}`;
router.push(dashboardPath);
```

**Step 6: Update localStorage persistence**

Replace `teamLevel` and `division` with `coachType` in the persist/restore logic. Keep `division` only as supplementary data for college coaches.

**Step 7: Commit**
```bash
git add src/app/baseball/(onboarding)/coach-onboarding/page.tsx
git commit -m "feat(baseball): replace role selection with coach type selection in onboarding"
```

---

## Task 2: Update Player Onboarding — Add Type Selection Step

**Files:**
- Modify: `src/app/baseball/(onboarding)/player/page.tsx`

**Context:** The player onboarding currently starts at Step 1 "About You". Add a Step 0 for Player Type selection: High School, Showcase, JUCO, College. Same card UI as coach type selection.

**Step 1: Add player type state and step**

Add to component state:
```typescript
const [playerType, setPlayerType] = useState<'high_school' | 'showcase' | 'juco' | 'college' | ''>('');
```

Change the step numbering — current steps are 1-4, add step 0:
- Step 0: Player Type Selection (new)
- Step 1: About You (existing)
- Step 2: Measurables (existing)
- Step 3: Join a Team (existing)
- Step 4: Complete (existing)

**Step 2: Add type selection UI before About You**

Insert a new step block at the beginning (before the About You step), using identical card layout to coach type selection:

```tsx
{step === 0 && (
  <m.div key="type" custom={direction} variants={slideVariants} initial="initial" animate="animate" exit="exit" className="w-full max-w-[460px]">
    <m.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
      <m.div variants={staggerItem} className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">What type of player are you?</h1>
        <p className="text-warm-500 mt-2 text-sm sm:text-base">This determines your dashboard experience</p>
      </m.div>
      <m.div variants={staggerItem} className="space-y-3">
        {([
          { value: 'high_school' as const, label: 'High School Player', desc: 'Currently playing high school baseball', emoji: '🏫' },
          { value: 'showcase' as const, label: 'Showcase / Travel Ball', desc: 'Playing on a showcase or travel team', emoji: '⚾' },
          { value: 'juco' as const, label: 'JUCO Player', desc: 'Playing at a junior college', emoji: '🎓' },
          { value: 'college' as const, label: 'College Player', desc: 'Playing at a 4-year college', emoji: '🏟️' },
        ]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setPlayerType(opt.value); setStep(1); setDirection(1); }}
            className="w-full auth-glass-card rounded-2xl p-5 text-left hover:bg-white/90 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">{opt.emoji}</div>
              <div>
                <p className="text-lg font-semibold text-warm-900">{opt.label}</p>
                <p className="text-sm text-warm-500">{opt.desc}</p>
              </div>
              <IconArrowRight size={16} className="ml-auto text-warm-400 group-hover:text-warm-600 transition-colors" />
            </div>
          </button>
        ))}
      </m.div>
    </m.div>
  </m.div>
)}
```

**Step 3: Pass player_type to onboarding completion**

In the `handleComplete()` function, include `playerType` when updating the player record:
```typescript
player_type: playerType,
```

**Step 4: Update redirect after completion**

Change the redirect from `/baseball/dashboard` to:
```typescript
const dashboardPath = `/baseball/player/${playerType.replace('_', '-')}`;
router.push(dashboardPath);
```

**Step 5: Commit**
```bash
git add src/app/baseball/(onboarding)/player/page.tsx
git commit -m "feat(baseball): add player type selection step to onboarding"
```

---

## Task 3: Create Coach Dashboard Route Group with Shared Layout

**Files:**
- Create: `src/app/baseball/(coach-dashboard)/coach/layout.tsx`
- Create: `src/app/baseball/(coach-dashboard)/coach/college/page.tsx`
- Create: `src/app/baseball/(coach-dashboard)/coach/juco/page.tsx`
- Create: `src/app/baseball/(coach-dashboard)/coach/high-school/page.tsx`
- Create: `src/app/baseball/(coach-dashboard)/coach/showcase/page.tsx`

**Context:** Currently all dashboards live under `/baseball/(dashboard)/dashboard/`. We need new routes under `/baseball/coach/{type}` with a shared layout that has auth guards and sidebar.

**Step 1: Create the coach layout**

Create `src/app/baseball/(coach-dashboard)/coach/layout.tsx` — copy the auth guard pattern from the existing `(dashboard)/layout.tsx` but restrict to coaches only:

```tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { CommandPalette } from '@/components/CommandPalette';
import { ToastProvider } from '@/components/ui/toast';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { PageLoading } from '@/components/ui/loading';
import { MobileBottomNav, type MobileNavItem } from '@/components/layout/mobile-bottom-nav';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { LastSeenUpdater } from '@/components/admin/LastSeenUpdater';
import { PeekPanelProvider } from '@/components/baseball/peek-panel';
import { cn } from '@/lib/utils';
import { IconHome, IconUsers, IconMessage, IconSettings } from '@/components/icons';

// Reuse DashboardContent from existing layout pattern
// ... (copy DashboardContent from existing layout but update nav hrefs to use /baseball/coach/ paths)

export default function CoachDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const supabase = supabaseRef.current;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/baseball/login'); return; }

      const { data: coachProfile } = await supabase
        .from('baseball_coaches')
        .select('id, onboarding_completed, coach_type')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!coachProfile || !coachProfile.onboarding_completed) {
        router.push('/baseball/coach-onboarding');
        return;
      }

      setAuthorized(true);
      setLoading(false);
    }
    checkAuth();
  }, [router]);

  if (loading || !authorized) return <PageLoading />;

  return (
    <SidebarProvider>
      <ToastProvider>
        <SessionActivityProvider>
          <LastSeenUpdater />
          <PeekPanelProvider>
            <DashboardContent>{children}</DashboardContent>
          </PeekPanelProvider>
        </SessionActivityProvider>
      </ToastProvider>
    </SidebarProvider>
  );
}
```

**Step 2: Create college coach dashboard page**

Create `src/app/baseball/(coach-dashboard)/coach/college/page.tsx`:
- Extract the coach recruiting dashboard from `(dashboard)/dashboard/page.tsx` lines 194-478
- This is the main recruiting page with pipeline stats, hot leads, position needs, engagement chart, activity feed, player distribution map, saved searches
- Keep all existing imports and hooks (`useBaseballCoachDashboard`, `useSavedSearches`, `usePlayersByState`)
- Update internal links from `/baseball/dashboard/...` to use relative paths or keep `/baseball/dashboard/...` for now (shared routes like messages, settings stay under old path until migrated)

**Step 3: Create JUCO coach dashboard page**

Create `src/app/baseball/(coach-dashboard)/coach/juco/page.tsx`:
- Import and render `JucoTeamDashboard` from `@/app/baseball/(dashboard)/dashboard/team/JucoTeamDashboard`
- Wrap with auth data from `useAuth()`

**Step 4: Create high-school coach dashboard page**

Create `src/app/baseball/(coach-dashboard)/coach/high-school/page.tsx`:
- Copy content from `(dashboard)/dashboard/team/high-school/page.tsx` (the `HSCoachDashboardPage` component)

**Step 5: Create showcase coach dashboard page**

Create `src/app/baseball/(coach-dashboard)/coach/showcase/page.tsx`:
- Redirect to `/baseball/dashboard/organization` for now (existing organization page), or create a minimal showcase dashboard

**Step 6: Commit**
```bash
git add src/app/baseball/(coach-dashboard)/
git commit -m "feat(baseball): add type-specific coach dashboard routes"
```

---

## Task 4: Create Player Dashboard Route Group with Shared Layout

**Files:**
- Create: `src/app/baseball/(player-dashboard)/player/layout.tsx`
- Create: `src/app/baseball/(player-dashboard)/player/college/page.tsx`
- Create: `src/app/baseball/(player-dashboard)/player/juco/page.tsx`
- Create: `src/app/baseball/(player-dashboard)/player/high-school/page.tsx`
- Create: `src/app/baseball/(player-dashboard)/player/showcase/page.tsx`

**IMPORTANT:** The route `/baseball/player` is currently used for player ONBOARDING. The new player dashboard routes must NOT conflict. Use `(player-dashboard)` route group to namespace them. Check that the onboarding route at `src/app/baseball/(onboarding)/player/page.tsx` continues to work — it should because `(onboarding)` and `(player-dashboard)` are separate route groups, but they both map to `/baseball/player`. This is a CONFLICT.

**Resolution:** The player onboarding is at `/baseball/(onboarding)/player/page.tsx` which maps to `/baseball/player`. The new player dashboards should be at `/baseball/player/college`, `/baseball/player/juco`, etc. Since `/baseball/player` (no subpath) is the onboarding page and `/baseball/player/college` etc. are dashboard pages, we need to put dashboards under the SAME route group as onboarding OR use a different approach:

**Approach:** Move player dashboards into the existing `(dashboard)` route group as `/baseball/(dashboard)/player-dashboard/[type]/page.tsx` to avoid conflicts. OR rename player onboarding to `/baseball/player-onboarding` to free up the `/baseball/player/` namespace.

**Recommended:** Keep onboarding at `/baseball/player` (existing, works). Create player dashboard routes as:
- `/baseball/(coach-dashboard)/player/college/page.tsx` — NO, this is wrong. Use a separate route group.
- Actually: since `(onboarding)` is a route group, `/baseball/(onboarding)/player/page.tsx` maps to `/baseball/player`. And `/baseball/(player-dashboard)/player/college/page.tsx` maps to `/baseball/player/college`. These DON'T conflict because the first is `/baseball/player` (exact) and the second is `/baseball/player/college` (subpath). Next.js handles this correctly.

**Step 1: Create the player layout**

Create `src/app/baseball/(player-dashboard)/player/layout.tsx` — same pattern as coach layout but for players:

```tsx
// Same auth guard pattern but check baseball_players instead
// Mobile nav: Home, Profile, Messages, More
```

**Step 2: Create college player dashboard**

Create `src/app/baseball/(player-dashboard)/player/college/page.tsx`:
- Extract the college player team dashboard from `TeamDashboardClient.tsx` (the player section that renders when `player?.player_type === 'college'`)

**Step 3: Create JUCO player dashboard**

Create `src/app/baseball/(player-dashboard)/player/juco/page.tsx`:
- Import and render `JucoPlayerDashboard` from existing component

**Step 4: Create high-school player dashboard**

Create `src/app/baseball/(player-dashboard)/player/high-school/page.tsx`:
- Extract the player dashboard from `(dashboard)/dashboard/page.tsx` lines 482-560 (profile card, stats, recruiting activation banner)

**Step 5: Create showcase player dashboard**

Create `src/app/baseball/(player-dashboard)/player/showcase/page.tsx`:
- Same as high-school player dashboard (recruiting + profile focused)

**Step 6: Commit**
```bash
git add src/app/baseball/(player-dashboard)/
git commit -m "feat(baseball): add type-specific player dashboard routes"
```

---

## Task 5: Update Auth Actions — Route to Type-Specific Dashboards

**Files:**
- Modify: `src/app/baseball/actions/auth.ts`

**Step 1: Add coach_type and player_type to login queries**

Change the login profile queries (lines 160-171) to include type:

```typescript
const [coachResult, playerResult] = await Promise.all([
  supabase
    .from('baseball_coaches')
    .select('id, onboarding_completed, coach_type')
    .eq('user_id', data.user.id)
    .maybeSingle(),
  supabase
    .from('baseball_players')
    .select('id, onboarding_completed, player_type')
    .eq('user_id', data.user.id)
    .maybeSingle(),
]);
```

**Step 2: Update redirect logic (lines 204-212)**

Replace the generic `/baseball/dashboard` redirect with type-specific paths:

```typescript
if (resolvedRole === 'coach') {
  if (!coachProfile || !coachProfile.onboarding_completed) {
    redirectTo = '/baseball/coach-onboarding';
  } else {
    const type = (coachProfile.coach_type || 'college').replace('_', '-');
    redirectTo = `/baseball/coach/${type}`;
  }
} else if (resolvedRole === 'player') {
  if (!playerProfile || !playerProfile.onboarding_completed) {
    redirectTo = '/baseball/player';
  } else {
    const type = (playerProfile.player_type || 'high-school').replace('_', '-');
    redirectTo = `/baseball/player/${type}`;
  }
}
```

**Step 3: Update revalidatePath**

```typescript
revalidatePath('/baseball');
```

**Step 4: Commit**
```bash
git add src/app/baseball/actions/auth.ts
git commit -m "feat(baseball): route login to type-specific dashboards"
```

---

## Task 6: Update Sign-Up Form Redirect

**Files:**
- Modify: `src/components/auth/baseball-sign-up-form.tsx`

**Context:** The signup form redirects to `/baseball/coach-onboarding` or `/baseball/player` after signup. These are the onboarding pages, which is correct — no change needed here since onboarding will handle the final redirect to the correct dashboard.

**Step 1: Verify no changes needed**

Read the file and confirm the redirect logic sends users to onboarding (not dashboard). If it does, no changes needed.

**Step 2: Commit (if changes made)**

---

## Task 7: Update Sign-In Form Redirect

**Files:**
- Modify: `src/components/auth/baseball-sign-in-form.tsx`

**Context:** The sign-in form uses the `redirectTo` from `loginAction()`. Since we updated `loginAction()` in Task 5 to return type-specific paths, the sign-in form should work automatically. Verify this.

**Step 1: Verify redirect handling**

The sign-in form uses `result.redirectTo` from the server action. Since we updated the action to return `/baseball/coach/{type}` or `/baseball/player/{type}`, the form should redirect correctly without changes.

**Step 2: Commit (if changes made)**

---

## Task 8: Add Backward-Compatible Redirect for /baseball/dashboard

**Files:**
- Modify: `src/app/baseball/(dashboard)/dashboard/page.tsx`

**Context:** The existing `/baseball/dashboard` page currently renders different dashboards based on coach/player type with client-side redirects. Update it to redirect to the new type-specific routes.

**Step 1: Simplify page.tsx to be a redirect-only page**

Replace the entire component with a simple redirect that checks role and type:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { PageLoading } from '@/components/ui/loading';

export default function DashboardRedirect() {
  const router = useRouter();
  const { user, coach, player, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (user?.role === 'coach' && coach?.coach_type) {
      const type = coach.coach_type.replace('_', '-');
      router.replace(`/baseball/coach/${type}`);
    } else if (user?.role === 'player' && player?.player_type) {
      const type = player.player_type.replace('_', '-');
      router.replace(`/baseball/player/${type}`);
    } else if (!user) {
      router.replace('/baseball/login');
    }
  }, [loading, user, coach, player, router]);

  return <PageLoading />;
}
```

**Step 2: Commit**
```bash
git add src/app/baseball/(dashboard)/dashboard/page.tsx
git commit -m "feat(baseball): make /baseball/dashboard a redirect to type-specific routes"
```

---

## Task 9: Update Dashboard Layout Auth Guard

**Files:**
- Modify: `src/app/baseball/(dashboard)/layout.tsx`

**Context:** The existing dashboard layout (lines 130-176) checks onboarding status and redirects. Update it to redirect to the correct type-specific dashboard instead of generic `/baseball/dashboard`.

**Step 1: Update redirect targets in checkAuth**

Add `coach_type` and `player_type` to the queries, then redirect to type-specific paths:

```typescript
const [userResult, coachResult, playerResult] = await Promise.all([
  supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
  supabase.from('baseball_coaches').select('id, onboarding_completed, coach_type').eq('user_id', user.id).maybeSingle(),
  supabase.from('baseball_players').select('id, onboarding_completed, player_type').eq('user_id', user.id).maybeSingle(),
]);
```

**Step 2: Commit**
```bash
git add src/app/baseball/(dashboard)/layout.tsx
git commit -m "fix(baseball): update dashboard layout auth to include type fields"
```

---

## Task 10: Verify and Test End-to-End Flow

**Step 1: Run typecheck**
```bash
npm run typecheck
```

**Step 2: Run lint**
```bash
npm run lint
```

**Step 3: Fix any TypeScript or lint errors**

**Step 4: Manual test checklist**
- [ ] Coach signup → type selection (College) → onboarding → redirects to `/baseball/coach/college`
- [ ] Coach signup → type selection (JUCO) → onboarding → redirects to `/baseball/coach/juco`
- [ ] Coach signup → type selection (High School) → onboarding → redirects to `/baseball/coach/high-school`
- [ ] Coach signup → type selection (Showcase) → onboarding → redirects to `/baseball/coach/showcase`
- [ ] Player signup → type selection → onboarding → redirects to `/baseball/player/{type}`
- [ ] Login as existing coach → redirects to correct type-specific dashboard
- [ ] Login as existing player → redirects to correct type-specific dashboard
- [ ] `/baseball/dashboard` → redirects to correct type-specific dashboard
- [ ] Sidebar navigation works from new dashboard routes
- [ ] Shared pages (messages, settings, calendar) accessible from new routes

**Step 5: Final commit**
```bash
git add -A
git commit -m "feat(baseball): complete onboarding type selection and dashboard routing"
```
