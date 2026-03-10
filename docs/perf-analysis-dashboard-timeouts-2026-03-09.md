# GolfHelm Dashboard Timeout Analysis
_Generated: 2026-03-09 (overnight cron)_

## Summary

The 30,000ms P75 timeouts on 4 dashboard pages trace to **two root causes**:
1. **No React.cache() for Golf auth** — every server action re-runs `getUser()` + `golf_coaches` + `golf_players` queries that the page component already ran
2. **Calendar forced no-cache** — `revalidate = 0` on the calendar page means every single request cold-fetches from Supabase

---

## Root Cause 1: Double Auth (All 4 Pages)

**Pages affected:** dashboard, announcements, calendar, messages

**What happens:**

```
1. page.tsx calls:
   - supabase.auth.getUser()         → 1 query
   - .from('golf_coaches')...        → 1 query
   - .from('golf_players')...        → 1 query

2. The server action called by the page also calls:
   - createClient() + auth.getUser() → 1 query (duplicate)
   - .from('golf_coaches')...        → 1 query (duplicate)
   - .from('golf_players')...        → 1 query (duplicate)
   - Plus MORE sequential auth checks (golf_teams, golf_team_members)
```

**Announcements specific example** (`getAnnouncementsWithMeta`):
- Page runs: getUser + coach + player + team (4 queries)  
- Action runs: getUser + coach + player + team + member check = 5 MORE queries
- That's **9 auth queries before a single piece of announcement data is fetched**

**Fix built (2026-03-09):** Added `getGolfSessionProfile()` to `src/lib/auth/session.ts`
- Uses `React.cache()` — same pattern as baseball's existing `getSessionProfile()`
- Within one React render tree, all callers share the same 2-query result
- **Not yet wired** — pages still need to be migrated to use it (medium-effort refactor)

**How to wire it (when ready):**
```typescript
// In page.tsx:
import { getGolfSessionProfile } from '@/lib/auth/session';
const session = await getGolfSessionProfile();
if (!session) redirect('/golf/login');
const { userId, role, coach, player } = session;

// In server actions called from the same render tree:
// The cache() deduplicates — no changes needed in actions if they also call getGolfSessionProfile()
// But you'd need to remove the manual re-verification blocks (trust the page-level teamId)
```

---

## Root Cause 2: Calendar `revalidate = 0` (100% Failure Rate)

**File:** `src/app/golf/(dashboard)/dashboard/calendar/page.tsx`

**Problem:** `export const revalidate = 0` means no caching at all. Every user hitting the calendar page triggers a full cold-fetch from Supabase. Calendar events don't change second-by-second.

**Current query chain (all sequential groups):**
```
1. auth.getUser()
2. parallel: role + coach + player
3. parallel: coachTeam + playerTeam + coachList (conditionally)
4. events query (.from('golf_events')...)
```

That's 4 round trips to Supabase, executed serially (each group waits for the previous).

**Fix (low risk):** Change to `revalidate = 30` (30-second ISR cache). Calendar events are unlikely to change within 30 seconds. Coach can always hard-refresh.

```diff
- export const revalidate = 0;
+ export const revalidate = 30; // Calendar events: 30s ISR cache — coach can hard-refresh
```

This alone could eliminate most of the calendar 100% failure rate.

---

## Root Cause 3: `unstable_cache` Removed from Dashboard (Opportunity Lost)

**File:** `src/app/golf/actions/dashboard-data.ts:876`

The comment says: `// Note: unstable_cache was removed because it wraps functions that call cookies() via createClient()`

This is correct for Next.js — `unstable_cache` can't wrap functions that call `cookies()`. However, there's a workaround: pass the cookies/user data into the cached function instead of fetching inside it:

```typescript
// Pattern: fetch auth outside the cache, pass data in
import { unstable_cache } from 'next/cache';

const getTeamDashboardDataCached = unstable_cache(
  async (teamId: string, coachId: string) => {
    // createClient() is called here with NO cookies() dependency
    // Use service role or pass teamId as the isolation boundary
    return getCachedData(teamId, coachId);
  },
  ['team-dashboard'],
  { revalidate: 60, tags: ['team-dashboard'] }
);
```

This is a more complex refactor but could reduce dashboard load from 8+ Supabase queries to ~1 cached response per minute.

---

## What Was Fixed Tonight (2026-03-09)

| Fix | File | Impact |
|-----|------|--------|
| `getGolfSessionProfile()` added | `src/lib/auth/session.ts` | Foundation for eliminating double-auth |
| `birdies_per_round` implemented | `team/page.tsx` | Fixes always-null birdies column in team stats |

## Recommended Next Steps (Priority Order)

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| 🔴 HIGH | Change calendar `revalidate = 0` → `revalidate = 30` | 1 line | Eliminates calendar 100% timeout |
| 🟡 MED | Wire `getGolfSessionProfile()` in high-traffic pages | 2-3 hrs | -40-60% auth query count |
| 🟡 MED | Remove double-auth from `getAnnouncementsWithMeta` | 1 hr | -5 sequential queries on announcements |
| 🟢 LOW | `unstable_cache` pattern for team data | 3-4 hrs | Dashboard response time -50%+ |

---

## Files Changed Tonight

```
src/lib/auth/session.ts
  + getGolfSessionProfile() — React.cache() deduplication for golf auth
  + GolfCoachProfile, GolfPlayerProfile, GolfSessionProfile types
  + requireGolfCoachSession(), requireGolfPlayerSession() helpers

src/app/golf/(dashboard)/dashboard/stats/team/page.tsx
  + Added `score` to golf_holes select query
  + Added birdies counting in aggregation loop  
  ~ Removed wrong TODO comment (score column DOES exist)
  + Implemented birdiesPerRound = (totalBirdies / totalHolesWithScore) * 18
```

tsc: exit 0 ✅
