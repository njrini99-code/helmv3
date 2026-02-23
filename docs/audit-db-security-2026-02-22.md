# BaseballHelm DB & Security Audit
**Date:** 2026-02-22  
**Auditor:** DB Security Engineer (subagent)  
**Scope:** All baseball Supabase tables — RLS correctness, missing policies, data exposure, auth guards, college-coach access boundaries  
**Supabase Project:** `qmnssrrolpinvwjjnufo`

---

## RLS Status by Table

| Table | RLS Enabled | Policies Present | Issues |
|-------|-------------|------------------|--------|
| `baseball_players` | ✅ | ✅ SELECT / INSERT / UPDATE / DELETE | `recruiting_activated = true` branch is overly broad — no coach_type scoping at DB layer |
| `baseball_coaches` | ✅ | ✅ SELECT / INSERT / UPDATE / DELETE | SELECT policy is `USING (true)` — all coaches visible to all authenticated users |
| `baseball_organizations` | ✅ (inherited from `organizations`) | ✅ | N/A — read-only for coaches |
| `baseball_teams` | ✅ | ✅ SELECT / INSERT / UPDATE / DELETE | `head_coach_id` column exists in schema (migration 20260217) but is never used in code |
| `baseball_team_coach_staff` | ✅ | ✅ SELECT / INSERT / UPDATE / DELETE | INSERT/UPDATE/DELETE correctly use `is_baseball_primary_coach()` SECURITY DEFINER |
| `baseball_watchlists` | ✅ | ✅ SELECT / INSERT / UPDATE / DELETE | SELECT policy `coach_id = get_my_coach_id()` — correct isolation per coach ✅ |
| `baseball_conversations` | ✅ | ✅ | N/A — standard creator/participant checks |
| `baseball_messages` | ✅ | ✅ | N/A |
| `baseball_conversation_participants` | ✅ | ✅ (fixed) | **Recursive RLS was present** — fixed in 20260222120000 + 20260222140000 ✅ |
| `baseball_developmental_plans` | ✅ | ✅ SELECT / INSERT / UPDATE / DELETE | UPDATE policy restricts to `coach_id = get_my_coach_id()` only — **players cannot update their own goal progress via RLS** (functional break) |
| `baseball_player_engagement_events` | ✅ | ✅ | No access-control issue found |
| `baseball_games` | ✅ | ✅ SELECT / INSERT / UPDATE / DELETE | Policy uses `is_baseball_team_member_v2` / `is_baseball_team_coach_v2` — correct isolation ✅ |
| `baseball_box_score_batting` | ✅ | ✅ SELECT / INSERT / UPDATE / DELETE | Inline subquery `(SELECT id FROM baseball_players WHERE user_id = auth.uid())` in policy — no SECURITY DEFINER — minor perf concern |
| `baseball_box_score_pitching` | ✅ | ✅ SELECT / INSERT / UPDATE / DELETE | Same inline subquery anti-pattern |
| `baseball_player_season_stats` | ✅ | ✅ SELECT + ALL | Scoped to own player_id or team coach ✅ |
| `baseball_box_score_uploads` | ✅ | ✅ ALL | Scoped to `coach_id = (SELECT id FROM baseball_coaches WHERE user_id = auth.uid())` ✅ |
| `baseball_player_stats` (CSV uploads) | ✅ | ✅ | Auth-guarded at action layer ✅ |

---

## Critical Security Issues

### 🔴 CRITICAL-1: `coachType` is Client-Supplied in `discover.ts` — Not Verified Against Session

**File:** `src/app/baseball/actions/discover.ts`  
**Functions:** `getDiscoverPlayers()`, `getDiscoverTeams()`, `getStateCounts()`

The `coachType` filter is accepted as a caller-supplied parameter and is never validated against the authenticated coach's actual `coach_type` from the database.

```typescript
// DANGEROUS: coachType comes from the caller, not the session
export async function getDiscoverPlayers(filters: DiscoverFilters) {
  // ...
  if (filters.coachType === 'juco') {
    query = query.in('player_type', ['high_school', 'showcase'] as const);
  }
  // Default (college): no filter applied — sees HS + showcase + JUCO players
}
```

**Attack vector:** A JUCO coach (who should only recruit HS/showcase players) calls `getDiscoverPlayers({ coachType: 'college' })` or omits `coachType`. The business rule restricting JUCO coaches from recruiting JUCO players is bypassed entirely at the application layer. RLS does NOT enforce this restriction.

**Fix:**
```typescript
// At the start of getDiscoverPlayers:
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { players: [], count: 0, pages: 0 };
const { data: coach } = await supabase
  .from('baseball_coaches')
  .select('id, coach_type')
  .eq('user_id', user.id)
  .single();
// Use coach.coach_type, ignore filters.coachType
```

---

### 🔴 CRITICAL-2: `dev-plans.ts` Write Functions Have No Auth or Ownership Checks

**File:** `src/app/baseball/actions/dev-plans.ts`  
**Functions:** `updateGoalProgress()`, `completeGoal()`, `uncompleteGoal()`

None of these functions call `supabase.auth.getUser()`, `requireCoach()`, or any ownership guard. They accept a `planId` and modify it with only `.eq('id', planId)`.

```typescript
// No auth check here at all
export async function updateGoalProgress(planId: string, goalId: string, progress: number) {
  const supabase = await createClient(); // No getUser()
  const { data: plan } = await supabase
    .from('baseball_developmental_plans')
    .select('goals')
    .eq('id', planId)  // Any planId accepted
    .single();
  // ... updates and saves back — relying entirely on RLS
}
```

**RLS partially mitigates:** The `baseball_developmental_plans` UPDATE policy requires `coach_id = get_my_coach_id()`. This means:
- A coach can only update plans they created (correct by RLS).
- A **player** calling `updateGoalProgress` is blocked at the DB layer (RLS rejects), even though players are supposed to update their own goal progress — this is a **functional break**.
- An unauthenticated caller is blocked because `get_my_coach_id()` returns NULL.

**Net impact:** Players cannot update their own goal progress. Any coach can technically call this action but RLS prevents them from touching plans they didn't create. The risk is the trust placed on RLS alone — if a policy regression occurs, there is no app-layer safety net.

**Fix:** Add `requireCoach()` / `getUser()` at the top of each write function. For player self-service, add `get_my_player_id()` ownership check or add a separate UPDATE policy `USING (player_id = get_my_player_id())` to `baseball_developmental_plans`.

---

### 🟠 HIGH-1: `baseball_coaches` SELECT Policy is `USING (true)` — All Coaches Fully Visible

**Migration:** `20260125000000_fix_baseball_rls_comprehensive.sql` (line 66–68)

```sql
CREATE POLICY "baseball_coaches_select" ON baseball_coaches
FOR SELECT TO authenticated
USING (true);  -- All authenticated users can read ALL coach records
```

**Exposure:** Coach profiles may contain contact information, recruiting philosophy details, or organizational affiliation that should not be visible to all users. Any authenticated user (including HS players) can enumerate all coaches and their associated data.

**Assessment:** This appears intentional for messaging (coaches need to find each other), but it's overly broad. A player on a team can see every college coach's full profile.

**Recommendation:** Scope to `user_id = auth.uid() OR id IN (SELECT coach_id FROM baseball_conversation_participants WHERE user_id = auth.uid())` OR confirm intent is public visibility and document explicitly.

---

### 🟠 HIGH-2: `is_on_college_team` Filter Documented but Not Applied in Discover

**File:** `src/app/baseball/actions/discover.ts`

The JSDoc and comment in `getDiscoverPlayers` claim:
```
* 2. Players must have is_on_college_team = false (not on a college roster)
```
But the actual query does NOT include this filter:
```typescript
let query = supabase
  .from('baseball_players')
  .select(...)
  .eq('recruiting_activated', true)
  .neq('player_type', 'college');  // ← only blocks player_type='college'
  // .eq('is_on_college_team', false)  ← MISSING
```

**Exposure:** A HS or showcase player who is *also* on a college team (dual-enrolled, commit but still listed) with `recruiting_activated = true` would still appear in discover. College coaches would see them as active recruits even if they're already committed/enrolled.

**Fix:** Add `.eq('is_on_college_team', false)` to the query, or verify whether `is_on_college_team` is reliably maintained and if this filter is intentionally omitted.

---

## Data Exposure Risks

### Pipeline Isolation (baseball_watchlists)
**Status: ✅ SECURE**  
- RLS policy: `USING (coach_id = get_my_coach_id())` — Coach A cannot read Coach B's pipeline entries.  
- Action layer (`watchlist.ts`): Uses `requireCoach()` + `verifyWatchlistOwnership()` + `coach_id = coach.id` in all queries.  
- No cross-coach data leakage path identified.

### Discover — `recruiting_activated` Filter
**Status: ✅ SECURE (at DB layer)**  
- Both RLS (`baseball_players_select` policy, `recruiting_activated = true` branch) and the action (`discover.ts`, `.eq('recruiting_activated', true)`) enforce this filter.  
- Players with `recruiting_activated = false` are not visible to college coaches in discover.

### Box Score / Game Data — College Coach Access
**Status: ✅ SECURE**  
- `baseball_games` RLS: `is_baseball_team_member_v2(team_id) OR is_baseball_team_coach_v2(team_id)` — college coaches can only see games for teams they are staff on.  
- `games.ts` action: `verifyTeamAccess()` check on every function. College coaches cannot query HS/showcase team game data.  
- `baseball_player_season_stats` RLS: scoped to own player or team coach — same restriction applies.  
- **No exposure of HS/showcase box scores to recruiting college coaches.**

### Pipeline — IDOR Check
**Status: ✅ SECURE**  
`addToWatchlist(coachId, playerId)` verifies ownership via:
```typescript
await supabase.from('baseball_coaches').select('id').eq('id', coachId).eq('user_id', user.id).single();
```
Cannot add to another coach's watchlist.

`updateWatchlistStatus`, `updateWatchlistPriority`, `addWatchlistNote` all use `verifyWatchlistOwnership()` — correct.

---

## Missing Auth Guards

| File | Function(s) | Auth Present | Risk |
|------|-------------|--------------|------|
| `dev-plans.ts` | `updateGoalProgress`, `completeGoal`, `uncompleteGoal` | ❌ None | IDOR (mitigated by RLS — but fragile) |
| `discover.ts` | `getDiscoverPlayers`, `getDiscoverTeams`, `getStateCounts` | ❌ No explicit `getUser()` | `coachType` not verified against session (CRITICAL-1) |
| `dev-plans.ts` | `getPlayerDevPlans`, `getActiveDevPlan` | ❌ None | Read-only; RLS enforces. Low risk for reads. |
| `auth.ts` | All functions | ✅ Has own auth logic | — |
| `games.ts` | All functions | ✅ `requireCoachAuth()` | — |
| `watchlist.ts` | All write functions | ✅ `requireCoach()` + ownership | — |
| `stats.ts` | All functions | ✅ `requireCoachAuth()` | — |
| `teams.ts` | All functions | ✅ `getUser()` in inner queries | — |

---

## Anti-Patterns Found

### 1. `(supabase as any)` Casts in `games.ts` and `stats.ts`
Multiple functions use `supabase as any` to work around TypeScript type mismatches with the new box score tables. This defeats TypeScript's type safety for all database queries in those blocks.

```typescript
const { data: game, error } = await (supabase as any)
  .from('baseball_games')
  .insert({ ... })
```

**Fix:** Run `pnpm supabase gen types typescript --project-id qmnssrrolpinvwjjnufo` to regenerate `database.types.ts` after the box score migration. Remove all `as any` casts.

### 2. Inline Subqueries in Box Score RLS Policies (No SECURITY DEFINER)
`baseball_box_score_batting` and `baseball_box_score_pitching` SELECT policies use inline subqueries:
```sql
player_id = (SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1)
```
This query runs on every row evaluated. While not recursive, it could be slow at scale. The existing pattern uses SECURITY DEFINER helper functions (`get_my_player_id()`) — these policies should use the same helpers for consistency and performance.

**Fix:**
```sql
player_id = get_my_player_id()
OR is_baseball_team_coach_v2(team_id)
```

### 3. `dev-plans.ts` Throws Raw DB Errors
```typescript
throw error; // Raw Supabase error exposed
```
All throw paths should use `sanitizeDbError()` from `src/lib/db-error.ts` to prevent leaking internal schema/column names in error messages.

### 4. `discover.ts` Accepts `coachType` from Client Without Session Verification
Documented above as CRITICAL-1. Also an anti-pattern: business-critical access control rules should always be derived from authenticated session data, never from caller-supplied parameters.

### 5. `baseball_teams.head_coach_id` Column Exists in Schema but Is Orphaned
Migration `20260217000000_fix_baseball_teams_schema.sql` explicitly ensures `head_coach_id` exists:
```sql
-- Ensure head_coach_id exists (it should from 006_teams.sql, but verify)
IF NOT EXISTS (...) THEN
  ALTER TABLE baseball_teams
    ADD COLUMN head_coach_id UUID REFERENCES baseball_coaches(id) ON DELETE SET NULL;
```
All code references are comments only (grep confirmed). The column is an orphaned schema artifact that:
- Consumes storage/index space
- Creates confusion for future developers
- Was the root cause of the HTTP 500 failures fixed in 20260222120000

**Fix:** Add a migration to DROP the column once confirmed safe:
```sql
ALTER TABLE baseball_teams DROP COLUMN IF EXISTS head_coach_id;
```

---

## Known Issues Confirmed Fixed

### ✅ FIX-1: `baseball_conversation_participants` Recursive RLS
**Confirmed fixed** in two migrations:
- `20260222120000`: Created `get_my_baseball_conversation_ids()` SECURITY DEFINER function, dropped and recreated `baseball_conversation_participants_select` policy.
- `20260222140000`: Explicitly dropped `baseball_participants_select_in_conversation` (the recursive policy from `044_fix_messaging_rls.sql`) and all legacy policies. Final clean policy:
```sql
CREATE POLICY "baseball_conversation_participants_select" ON baseball_conversation_participants
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR conversation_id IN (SELECT get_my_baseball_conversation_ids())
);
```
`get_my_baseball_conversation_ids()` is SECURITY DEFINER — breaks the recursion loop. ✅

### ✅ FIX-2: `is_baseball_team_coach()` Used `head_coach_id` — Now Fixed
**Confirmed fixed** in `20260222120000`. Old version queried the non-existent `t.head_coach_id` column. New version:
```sql
CREATE OR REPLACE FUNCTION is_baseball_team_coach(team_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff tcs
    WHERE tcs.team_id = team_uuid AND tcs.coach_id = get_my_coach_id()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```

### ✅ FIX-3: `baseball_players_select` Policy Referenced `head_coach_id` (HTTP 500)
**Confirmed fixed** in `20260222120000` and reinforced in `20260222140000`. The UNION branch that referenced `t.head_coach_id` is removed. Current policy uses only `baseball_team_coach_staff` lookups.

### ✅ FIX-4: `head_coach_id` Not Referenced in Source Code
`grep -r "head_coach_id" /Users/ricknini/Downloads/helmv3/src/` returns only **comment lines** in 6 files. No active column reference in any TypeScript/SQL query. ✅

### ✅ FIX-5: `get_my_coach_id()` and `get_my_player_id()` SECURITY DEFINER Functions
Both confirmed created in `20260222140000_emergency_rls_fix_v2.sql`. Used in RLS policies to bypass recursive policy evaluation.

### ✅ FIX-6: `baseball_teams` UPDATE/DELETE Policies No Longer Use `head_coach_id`
Confirmed fixed in `20260222120000`. Now use `is_baseball_primary_coach(id)` SECURITY DEFINER helper.

---

## Recommendations

### Priority 1 — Fix Immediately

1. **Verify `coachType` from session in `discover.ts`** (CRITICAL-1)  
   Add `supabase.auth.getUser()` → look up `coach.coach_type` → use it, ignore the caller-supplied `coachType`. This is a single-point fix that closes a business-logic bypass.

2. **Add auth guards to `dev-plans.ts` write functions** (CRITICAL-2)  
   Add `requireCoach()` or `getUser()` at the top of `updateGoalProgress`, `completeGoal`, `uncompleteGoal`. Add an explicit player UPDATE policy or player-level ownership check if players are supposed to update goal progress.

3. **Drop `head_coach_id` column from `baseball_teams`**  
   ```sql
   -- Migration: remove orphaned column
   ALTER TABLE baseball_teams DROP COLUMN IF EXISTS head_coach_id;
   ```

### Priority 2 — Fix Soon

4. **Regenerate TypeScript types** after box score migration  
   Run `pnpm supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > src/lib/types/database.types.ts` and remove all `as any` casts in `games.ts` and `stats.ts`.

5. **Apply `is_on_college_team` filter in discover** or remove the misleading JSDoc comment. If the column is not reliably maintained, remove the comment and document the omission as intentional.

6. **Replace inline subqueries in box score RLS with SECURITY DEFINER helpers**  
   Change `(SELECT id FROM baseball_players WHERE user_id = auth.uid())` to `get_my_player_id()` in the batting/pitching policies.

### Priority 3 — Review & Document

7. **Scope `baseball_coaches` SELECT policy** — evaluate whether full coach visibility to all authenticated users is intentional. If so, document it explicitly. If not, scope to conversation participants.

8. **Add `sanitizeDbError()` to `dev-plans.ts`** — replace all `throw error` with `throw new Error(sanitizeDbError(error, 'dev-plans'))` or return `{ error: sanitizeDbError(error, ...) }`.

9. **Add RLS to `is_on_college_team` updates** — if this column drives recruiting visibility, ensure it's updated server-side only (never direct client write) and has proper triggers or guard.

---

## Summary Risk Assessment

| Severity | Count | Items |
|----------|-------|-------|
| 🔴 Critical | 2 | Client-supplied coachType bypass; dev-plans write IDOR |
| 🟠 High | 2 | coaches SELECT = true; is_on_college_team not applied |
| 🟡 Medium | 3 | `as any` casts; inline RLS subqueries; raw error throws |
| 🟢 Low/Informational | 2 | head_coach_id orphaned column; dev-plans reads without auth |
| ✅ Confirmed Fixed | 6 | Recursive conversation RLS, head_coach_id RLS refs, helper functions |
