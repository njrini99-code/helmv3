# Critical Fixes Plan — GolfHelm

**Created:** 2026-02-21
**Estimated Time:** 4-6 hours (parallelizable to ~2 hours with agents)
**Risk Level:** Medium (touching auth + core pages)

---

## Overview

Three critical issues to fix:

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | SEC-4: Unauthenticated admin log-event | Security hole — anyone can write to admin_events | 30 min |
| 2 | PERF-5: Dashboard is client-rendered | 300-800ms penalty on every visit | 2 hours |
| 3 | PERF-9: Zero caching | Every page visit = full DB queries | 2 hours |

---

## Phase 1: SEC-4 — Lock Down Admin Log-Event (30 min)

**File:** `src/app/api/admin/log-event/route.ts`

### Current Problem
- Zero authentication
- Uses `createAdminClient()` (service role) which bypasses RLS
- Anyone on the internet can POST arbitrary events

### Solution Options

**Option A: Require authenticated user (Recommended)**
```typescript
// At top of POST handler, after rate limit check:
import { createClient } from '@/lib/supabase/server';

const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Continue with existing logic, but use user's client instead of admin
// This way RLS applies and user can only log events for their own context
```

**Option B: API key for client-side error logging**
If this endpoint is meant for client-side error capture (like Sentry):
```typescript
// Check for app-specific header
const apiKey = request.headers.get('x-golfhelm-api-key');
if (apiKey !== process.env.INTERNAL_API_KEY) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**Option C: Remove endpoint entirely**
If not actively used, delete it. Use Sentry/DataDog instead.

### Verification
- [ ] Unauthenticated POST returns 401
- [ ] Authenticated user can still log events
- [ ] CORS restricted to app origin only

---

## Phase 2: PERF-5 — Convert Dashboard to Server Component (2 hours)

**File:** `src/app/golf/(dashboard)/dashboard/page.tsx`

### Current Problem
```
User navigates → page.tsx loads (client)
  → renders skeleton
  → useEffect fires
  → calls getCoachDashboardData() or getPlayerDashboardData()
  → waits 300-800ms
  → renders actual content
```

### Target Architecture
```
User navigates → page.tsx loads (server)
  → server fetches data (parallel)
  → streams HTML with data already embedded
  → no skeleton flash
```

### Implementation

**Step 1: Create new server page**
```typescript
// src/app/golf/(dashboard)/dashboard/page.tsx (new)
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getCoachDashboardData, getPlayerDashboardData } from '@/app/golf/actions/dashboard-data';
import { CoachDashboard } from './components/CoachDashboard';
import { PlayerDashboard } from './components/PlayerDashboard';
import { DashboardSkeleton } from './components/DashboardSkeleton';

export const dynamic = 'force-dynamic'; // User-specific data

export default async function GolfDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/golf/login');
  }

  // Determine role
  const [coachResult, playerResult] = await Promise.all([
    supabase.from('golf_coaches').select('id, team_id').eq('user_id', user.id).single(),
    supabase.from('golf_players').select('id, team_id').eq('user_id', user.id).single(),
  ]);

  const coach = coachResult.data;
  const player = playerResult.data;

  if (coach) {
    const data = await getCoachDashboardData();
    return <CoachDashboard initialData={data} />;
  }

  if (player) {
    const data = await getPlayerDashboardData();
    return <PlayerDashboard initialData={data} />;
  }

  redirect('/golf/onboarding');
}
```

**Step 2: Update CoachDashboard/PlayerDashboard to accept initialData**
- Remove internal useEffect data fetching
- Accept `initialData` prop
- Keep client interactivity (filters, refresh) but start with data

**Step 3: Move old page.tsx to page-old.tsx (backup)**

**Step 4: Create loading.tsx for Suspense**
```typescript
// src/app/golf/(dashboard)/dashboard/loading.tsx
export { DashboardSkeleton as default } from './components/DashboardSkeleton';
```

### Verification
- [ ] Page loads without skeleton flash (data in initial HTML)
- [ ] Coach sees coach dashboard
- [ ] Player sees player dashboard
- [ ] Unauthenticated redirects to login
- [ ] Build passes

---

## Phase 3: PERF-9 — Add Caching Layer (2 hours)

### Strategy

Add `unstable_cache` to expensive read-heavy functions that don't change on every request.

### High-Impact Targets

| Function | File | Cache TTL | Invalidation |
|----------|------|-----------|--------------|
| `getCoachDashboardData` | dashboard-data.ts | 60s | on round submit |
| `getPlayerDashboardData` | dashboard-data.ts | 60s | on round submit |
| `getPlayerStatsSummaryAction` | stats.ts | 60s | on round submit |
| `getTrendAnalysis` | stats-data.ts | 300s | on round submit |
| `getTeamComparison` | stats-data.ts | 300s | on round submit |

### Implementation Pattern

**Step 1: Create cache wrapper utility**
```typescript
// src/lib/cache/index.ts
import { unstable_cache } from 'next/cache';

export function createCachedFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyParts: string[],
  options: { revalidate?: number; tags?: string[] }
): T {
  return unstable_cache(fn, keyParts, options) as T;
}

// Tag constants
export const CACHE_TAGS = {
  DASHBOARD: 'dashboard',
  STATS: 'stats',
  ROUNDS: 'rounds',
  TEAM: 'team',
} as const;
```

**Step 2: Wrap dashboard data functions**
```typescript
// In dashboard-data.ts
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache';

const getCachedCoachDashboard = unstable_cache(
  async (coachId: string, teamId: string) => {
    // existing getCoachDashboardData logic
  },
  ['coach-dashboard'],
  { revalidate: 60, tags: [CACHE_TAGS.DASHBOARD, CACHE_TAGS.ROUNDS] }
);

export async function getCoachDashboardData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // ... get coachId, teamId
  return getCachedCoachDashboard(coachId, teamId);
}
```

**Step 3: Add revalidation on mutations**
```typescript
// In golf.ts submitGolfRoundComprehensive
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache';

// After successful round submission:
revalidateTag(CACHE_TAGS.DASHBOARD);
revalidateTag(CACHE_TAGS.STATS);
revalidateTag(CACHE_TAGS.ROUNDS);
```

**Step 4: Replace broad revalidatePath with targeted tags**
```bash
# Find all revalidatePath calls
grep -rn "revalidatePath" src/app/golf/actions/
# Replace overly broad ones with revalidateTag
```

### Verification
- [ ] Repeated dashboard visits are faster (check Network tab)
- [ ] New round submission invalidates cache (fresh data appears)
- [ ] Build passes

---

## Execution Plan

### Option A: Sequential (Solo)
```
1. Phase 1 (SEC-4) — 30 min
2. Phase 2 (PERF-5) — 2 hours  
3. Phase 3 (PERF-9) — 2 hours
4. Integration test — 30 min
─────────────────────────────
Total: ~5 hours
```

### Option B: Parallel (Sub-agents)
```
┌─ Agent 1: Phase 1 (SEC-4) ──────────────────┐
│  Lock down admin endpoint                    │ 30 min
└──────────────────────────────────────────────┘

┌─ Agent 2: Phase 2 (PERF-5) ──────────────────┐
│  Convert dashboard to server component       │ 2 hours
└──────────────────────────────────────────────┘

┌─ Agent 3: Phase 3 (PERF-9) ──────────────────┐
│  Add caching layer                           │ 2 hours
└──────────────────────────────────────────────┘

                    ↓ All complete ↓

┌─ Coordinator: Integration ───────────────────┐
│  Merge branches, resolve conflicts           │
│  Run build + typecheck                       │
│  Verify all fixes work together              │ 30 min
└──────────────────────────────────────────────┘
─────────────────────────────────────────────────
Total wall time: ~2.5 hours
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Dashboard refactor breaks auth | Keep old page as backup, test both roles |
| Cache returns stale data | Conservative TTLs (60s), explicit invalidation |
| Admin endpoint breaks monitoring | Test in staging before prod |

---

## Definition of Done

- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm build` passes
- [ ] SEC-4: Unauthenticated POST to `/api/admin/log-event` returns 401
- [ ] PERF-5: Dashboard loads without skeleton flash (check "view source")
- [ ] PERF-9: Second dashboard load is <100ms (check Network tab)
- [ ] All commits use conventional format
- [ ] REVIEW.md updated to mark issues as fixed

---

## Next Steps

Reply with:
- **"go"** — I'll execute all 3 phases sequentially
- **"parallel"** — I'll spawn 3 sub-agents to work simultaneously
- **"just SEC-4"** — Fix only the security issue (fastest)
- **"questions"** — Let's discuss the approach first
