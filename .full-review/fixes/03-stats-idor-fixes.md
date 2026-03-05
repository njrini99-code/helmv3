# Fix Plan: Stats IDOR / Auth Bypass Vulnerabilities

**Bugs:** P0 #5, P1 #17, P1 #18, P1 #19, P1 #20
**Files to modify:**
- `src/app/golf/actions/stats-data.ts`
- `src/app/golf/actions/stats.ts`
- `src/app/golf/actions/shot-analytics.ts`

**Date:** 2026-03-04

---

## Summary

Five IDOR / auth-bypass vulnerabilities allow authenticated users to access or mutate stats belonging to other players and teams they have no relationship with. Two server actions have no authentication at all. All fixes follow the existing `verifyPlayerAccess` and coach-team-membership patterns already established in the codebase.

---

## Bug #5 (P0): `getStatsSummary` / `getDetailedStats` accept arbitrary `playerId`

**File:** `src/app/golf/actions/stats-data.ts`, lines 218 and 347
**Problem:** Both functions call `requireAuth()` but never verify the caller owns or coaches the requested `playerId`. Any authenticated user can fetch any player's stats summary and full shot-level breakdown.
**Pattern to follow:** `getTrendAnalysis` at line 559, which calls `verifyPlayerAccess(supabase, user.id, playerId)` and returns empty data on failure.

### Fix A: `getStatsSummary` (line 218)

**Current code (lines 221-222):**
```typescript
export async function getStatsSummary(
  playerId: string,
  filter?: StatsFilter
): Promise<SummaryStatsResponse> {
  const { supabase } = await requireAuth();
  const conditions = getFilterConditions(filter);
```

**Replace with:**
```typescript
export async function getStatsSummary(
  playerId: string,
  filter?: StatsFilter
): Promise<SummaryStatsResponse> {
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return {
      summary: {
        roundsPlayed: 0,
        holesPlayed: 0,
        scoringAverage: null,
        bestRound: null,
        worstRound: null,
        girPercentage: null,
        fairwayPercentage: null,
        puttsPerRound: null,
        scramblingPercentage: null,
      },
      rounds: [],
    };
  }

  const conditions = getFilterConditions(filter);
```

**What changes:**
1. Destructure `user` from `requireAuth()` (was only destructuring `supabase`).
2. Call `verifyPlayerAccess(supabase, user.id, playerId)` before any data query.
3. Return the same empty-data shape on authorization failure (consistent with `getTrendAnalysis`).

### Fix B: `getDetailedStats` (line 347)

**Current code (lines 351-352):**
```typescript
export async function getDetailedStats(
  playerId: string,
  roundId?: string | 'overall',
  filter?: StatsFilter
): Promise<GolfStats> {
  const { supabase } = await requireAuth();
  const conditions = getFilterConditions(filter);
```

**Replace with:**
```typescript
export async function getDetailedStats(
  playerId: string,
  roundId?: string | 'overall',
  filter?: StatsFilter
): Promise<GolfStats> {
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return calculateStatsFromShots([], [], []);
  }

  const conditions = getFilterConditions(filter);
```

**What changes:**
1. Destructure `user` from `requireAuth()`.
2. Call `verifyPlayerAccess(supabase, user.id, playerId)`.
3. Return empty stats via `calculateStatsFromShots([], [], [])` on failure (matches the existing empty-return at line 389).

**Note:** `getPlayerStrengthsWeaknesses` (line 1272) already has this check and internally calls `getDetailedStats`. After this fix, `getDetailedStats` is self-protecting, but keeping the check in `getPlayerStrengthsWeaknesses` is harmless defense-in-depth.

---

## Bug #17 (P1): `getTeamComparison` accepts arbitrary `playerId` and `teamId`

**File:** `src/app/golf/actions/stats-data.ts`, line 768
**Problem:** Only calls `requireAuth()`. Any authenticated user can pass any `teamId` and get the full team's roster stats (scoring averages, GIR, fairway %, putts for every player).
**Fix:** Verify the caller is either (a) a member of the team, or (b) a coach of the team (via organization).

### Fix

**Current code (lines 768-772):**
```typescript
export async function getTeamComparison(
  playerId: string,
  teamId: string
): Promise<TeamComparisonResponse> {
  const { supabase } = await requireAuth();
```

**Replace with:**
```typescript
export async function getTeamComparison(
  playerId: string,
  teamId: string
): Promise<TeamComparisonResponse> {
  const { supabase, user } = await requireAuth();

  // Verify caller is a member of this team OR a coach of this team
  const emptyResponse: TeamComparisonResponse = {
    playerStats: { playerId, playerName: '', roundCount: 0, scoringAverage: null, bestRound: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
    teamStats: [],
    teamAverages: { scoringAverage: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
    playerRankings: { scoringRank: null, girRank: null, fairwayRank: null, puttsRank: null },
  };

  // Check 1: Is user a player on this team?
  const { data: playerRecord } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  let isTeamMember = false;
  if (playerRecord) {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('player_id', playerRecord.id)
      .eq('status', 'active')
      .maybeSingle();
    isTeamMember = !!membership;
  }

  // Check 2: Is user a coach of this team (via organization)?
  let isTeamCoach = false;
  if (!isTeamMember) {
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coach?.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', teamId)
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      isTeamCoach = !!team;
    }
  }

  if (!isTeamMember && !isTeamCoach) {
    return emptyResponse;
  }
```

**What changes:**
1. Destructure `user` from `requireAuth()`.
2. Check if the caller is a player who is an active member of the specified team.
3. If not a member, check if the caller is a coach whose organization owns the team.
4. Return empty data if neither check passes.

---

## Bug #18 (P1): `onRoundCompleteAction` / `markStatsStaleAction` have NO auth

**File:** `src/app/golf/actions/stats.ts`, lines 332 and 349
**Problem:** These are exported `'use server'` functions with zero authentication. Any HTTP client can call them with an arbitrary `playerId` to trigger cache invalidation or mark stats as stale for any player.
**Fix:** Add `requireAuth()` and verify the caller owns or coaches the player.

### Fix A: `onRoundCompleteAction` (line 332)

**Current code (lines 332-343):**
```typescript
export async function onRoundCompleteAction(
  playerId: string,
  roundId: string
): Promise<void> {
  try {
    await invalidateOnRoundComplete(playerId, roundId);
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/stats');
  } catch (error) {
    console.error('[Stats Action] Error invalidating on round complete:', error);
    // Don't throw - cache invalidation failure shouldn't block round submission
  }
}
```

**Replace with:**
```typescript
export async function onRoundCompleteAction(
  playerId: string,
  roundId: string
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Verify caller owns or coaches this player
    const authorized = await verifyPlayerOwnershipOrCoach(supabase, user.id, playerId);
    if (!authorized) return;

    await invalidateOnRoundComplete(playerId, roundId);
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/stats');
  } catch (error) {
    console.error('[Stats Action] Error invalidating on round complete:', error);
    // Don't throw - cache invalidation failure shouldn't block round submission
  }
}
```

### Fix B: `markStatsStaleAction` (line 349)

**Current code (lines 349-357):**
```typescript
export async function markStatsStaleAction(playerId: string): Promise<void> {
  try {
    await markStatsStale(playerId);
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/stats');
  } catch (error) {
    console.error('[Stats Action] Error marking stats stale:', error);
  }
}
```

**Replace with:**
```typescript
export async function markStatsStaleAction(playerId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Verify caller owns or coaches this player
    const authorized = await verifyPlayerOwnershipOrCoach(supabase, user.id, playerId);
    if (!authorized) return;

    await markStatsStale(playerId);
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/stats');
  } catch (error) {
    console.error('[Stats Action] Error marking stats stale:', error);
  }
}
```

### New helper to add in `stats.ts` (above `onRoundCompleteAction`, e.g., after line 325)

This file does not have `verifyPlayerAccess` imported. Rather than importing from `stats-data.ts` (which is a different action module with its own private helper), add a local helper that follows the same pattern used in `refreshStatsCacheAction` (line 142):

```typescript
/**
 * Verify the authenticated user owns this player record or coaches them.
 * Follows the same pattern as refreshStatsCacheAction.
 */
async function verifyPlayerOwnershipOrCoach(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  playerId: string
): Promise<boolean> {
  // Check if user IS the player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('id', playerId)
    .eq('user_id', userId)
    .maybeSingle();

  if (player) return true;

  // Check if user is a coach with this player on their team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (coach?.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (team) {
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', team.id)
        .eq('player_id', playerId)
        .eq('status', 'active')
        .maybeSingle();

      if (membership) return true;
    }
  }

  return false;
}
```

**Design note:** These actions intentionally return `void` and silently absorb failures (see original comment: "cache invalidation failure shouldn't block round submission"). The fix preserves this behavior -- unauthorized calls silently return rather than throwing. This prevents information leakage about whether a player ID exists.

---

## Bug #19 (P1): `getTeamShotAnalytics` missing coach authorization

**File:** `src/app/golf/actions/shot-analytics.ts`, line 767
**Problem:** Accepts arbitrary `teamId` with only a basic `user` check. Any authenticated user can query all shot analytics for all players on any team.
**Fix:** Verify the caller is a coach of the specified team.

### Fix

**Current code (lines 767-778):**
```typescript
export async function getTeamShotAnalytics(
  teamId: string,
  periodDays: number = 30
): Promise<{ success: true; data: PlayerShotAnalytics[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // Get current user for authorization
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }
```

**Replace with:**
```typescript
export async function getTeamShotAnalytics(
  teamId: string,
  periodDays: number = 30
): Promise<{ success: true; data: PlayerShotAnalytics[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // Get current user for authorization
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach of this team (via organization)
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach) {
      return { success: false, error: 'Not authorized - coach profile required' };
    }

    if (!coach.organization_id) {
      return { success: false, error: 'Coach not assigned to an organization' };
    }

    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('id', teamId)
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (!team) {
      return { success: false, error: 'Not authorized to access this team' };
    }
```

**What changes:**
1. After verifying authentication, check that the user has a `golf_coaches` record.
2. Look up the team and verify the team's `organization_id` matches the coach's `organization_id`.
3. Return an error if the coach does not own the team.

This follows the same pattern as `verifyTeamAccess` in `intelligence-dashboard.ts` (lines 107-145) and the `requireGolfCoach` helper in `src/lib/auth/ownership.ts`.

---

## Bug #20 (P1): `getPlayerStatsSummaryAction` / `getFullPlayerStatsAction` accept arbitrary player IDs

**File:** `src/app/golf/actions/stats.ts`, lines 42 and 104
**Problem:** When `playerId` is provided, these functions skip to querying stats with no ownership or team verification. Any authenticated user can fetch any player's cached stats summary or full stats.
**Fix:** Add verification matching the pattern in `refreshStatsCacheAction` (line 167-207), using the new `verifyPlayerOwnershipOrCoach` helper from Bug #18's fix.

### Fix A: `getPlayerStatsSummaryAction` (line 42)

**Current code (lines 42-67):**
```typescript
export async function getPlayerStatsSummaryAction(
  playerId?: string
): Promise<ActionResult<PlayerStatsSummary>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    let targetPlayerId = playerId;

    // If no player ID provided, get current user's player record
    if (!targetPlayerId) {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        return { success: false, error: 'Player profile not found' };
      }
      targetPlayerId = player.id;
    }
```

**Replace with:**
```typescript
export async function getPlayerStatsSummaryAction(
  playerId?: string
): Promise<ActionResult<PlayerStatsSummary>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    let targetPlayerId = playerId;

    // If no player ID provided, get current user's player record
    if (!targetPlayerId) {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        return { success: false, error: 'Player profile not found' };
      }
      targetPlayerId = player.id;
    } else {
      // Verify the caller has access to this player's stats
      const authorized = await verifyPlayerOwnershipOrCoach(supabase, user.id, targetPlayerId);
      if (!authorized) {
        return { success: false, error: 'Not authorized to view this player\'s stats' };
      }
    }
```

### Fix B: `getFullPlayerStatsAction` (line 104)

**Current code (lines 104-128):**
```typescript
export async function getFullPlayerStatsAction(
  playerId?: string
): Promise<ActionResult<PlayerStatsCache | null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    let targetPlayerId = playerId;

    if (!targetPlayerId) {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        return { success: false, error: 'Player profile not found' };
      }
      targetPlayerId = player.id;
    }
```

**Replace with:**
```typescript
export async function getFullPlayerStatsAction(
  playerId?: string
): Promise<ActionResult<PlayerStatsCache | null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    let targetPlayerId = playerId;

    if (!targetPlayerId) {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        return { success: false, error: 'Player profile not found' };
      }
      targetPlayerId = player.id;
    } else {
      // Verify the caller has access to this player's stats
      const authorized = await verifyPlayerOwnershipOrCoach(supabase, user.id, targetPlayerId);
      if (!authorized) {
        return { success: false, error: 'Not authorized to view this player\'s stats' };
      }
    }
```

**What changes for both:** When a `playerId` argument is provided (i.e., the caller is requesting someone else's stats), add an `else` branch that calls `verifyPlayerOwnershipOrCoach`. When no `playerId` is provided, the existing logic already scopes to the caller's own player record, so no change is needed there.

**Note:** `getPlayerStatsDirectAction` (line 367) has the same vulnerability but was not listed in the assigned bugs. It should receive the same fix in a follow-up pass.

---

## Testing Checklist

For each fix, verify the following scenarios:

| Scenario | Expected Result |
|----------|----------------|
| Player requests their own stats | Allowed |
| Coach requests stats for player on their team | Allowed |
| Coach requests stats for player NOT on their team | Denied (empty data or error) |
| Authenticated user requests stats for unrelated player | Denied |
| Unauthenticated call to `onRoundCompleteAction` | Silently returns (no effect) |
| Unauthenticated call to `markStatsStaleAction` | Silently returns (no effect) |
| Player on Team A requests `getTeamComparison` for Team B | Denied |
| Coach of Org A requests `getTeamShotAnalytics` for Org B's team | Denied |
| Player requests `getTeamShotAnalytics` (not a coach) | Denied |

---

## Files Changed Summary

| File | Functions Modified | New Code Added |
|------|-------------------|----------------|
| `src/app/golf/actions/stats-data.ts` | `getStatsSummary`, `getDetailedStats`, `getTeamComparison` | ~50 lines (access checks + empty-response for team comparison) |
| `src/app/golf/actions/stats.ts` | `getPlayerStatsSummaryAction`, `getFullPlayerStatsAction`, `onRoundCompleteAction`, `markStatsStaleAction` | ~45 lines helper + ~20 lines in each of 4 functions |
| `src/app/golf/actions/shot-analytics.ts` | `getTeamShotAnalytics` | ~20 lines (coach-team verification) |

**Total estimated diff:** ~180 lines added, 6 lines changed, 0 lines deleted.
