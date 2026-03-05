# Fix Plan: P0 #6 -- Missing Ownership Verification in Round Review Functions

## Summary

11 functions across `round-reviews.ts` and `round-review-system.ts` perform database reads or writes on review/round data **without verifying the calling user owns or has authorized access to that data**. An authenticated user can access, modify, or generate reviews for ANY player by simply passing arbitrary IDs.

## Reference Implementation

The `acknowledgeReview` function (round-reviews.ts:1282) demonstrates the correct pattern:

```typescript
// 1. Authenticate the user
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return { success: false, error: 'Not authenticated' };
}

// 2. Resolve the user to a golf_players record
const { data: player } = await supabase
  .from('golf_players')
  .select('id')
  .eq('user_id', user.id)
  .single();

if (!player) {
  return { success: false, error: 'Not authorized - player access required' };
}

// 3. Verify the review belongs to this player
const { data: review } = await supabase
  .from('golf_round_reviews')
  .select('player_id')
  .eq('id', reviewId)
  .single();

if (!review || review.player_id !== player.id) {
  return { success: false, error: 'Review not found or not accessible' };
}
```

For coach actions, the existing `verifyPlayerAccess` pattern (shot-analytics.ts:29) shows:
1. Check if `user_id` matches the player's `user_id` (player self-access)
2. Check if user is a `golf_coaches` record whose `organization_id` matches the player's team's `organization_id` via `golf_team_members` -> `golf_teams`

## Ownership Check Helper

To avoid duplicating boilerplate across 11 functions, we will add a shared helper at the top of each file. Both files will get their own copy (since they don't share imports from a common module today).

### Helper for `round-reviews.ts`

Add after the existing `dbRowToReview` helper (~line 274), before the "ROUND REVIEW ACTIONS" section:

```typescript
/**
 * Verify the current user has access to a review's player data.
 * Returns the user and player info if authorized, or an error.
 * Access is granted if the user IS the player, or is a coach on the player's team.
 */
async function verifyReviewAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  role: 'player' | 'player_or_coach'
): Promise<{ authorized: boolean; userId?: string; playerId?: string; error?: string }> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  // Check if user is the player
  const { data: playerRecord } = await supabase
    .from('golf_players')
    .select('id')
    .eq('id', playerId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerRecord) {
    return { authorized: true, userId: user.id, playerId: playerRecord.id };
  }

  // For player-only actions, deny here
  if (role === 'player') {
    return { authorized: false, error: 'Not authorized - you do not own this review' };
  }

  // Check if user is a coach with access to this player via organization -> team -> membership
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coach?.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .limit(1)
      .maybeSingle();

    if (team) {
      const { data: teamMember } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', team.id)
        .eq('player_id', playerId)
        .eq('status', 'active')
        .maybeSingle();

      if (teamMember) {
        return { authorized: true, userId: user.id, playerId };
      }
    }
  }

  return { authorized: false, error: 'Not authorized to access this review' };
}
```

### Helper for `round-review-system.ts`

Add the same helper before the "SERVER ACTIONS" section (~line 982). The implementation is identical.

---

## Per-Function Fix Details

### File: `src/app/golf/actions/round-reviews.ts`

---

#### 1. `generateRoundReview` (line 283) -- P2 #42

**Current code** (lines 286-305):
```typescript
export async function generateRoundReview(
  roundId: string,
  forceRegenerate: boolean = false
): Promise<GenerateReviewResponse> {
  const supabase = await createClient();

  try {
    // 1. Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // 2. Get the round
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('*')
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }
```

**Problem:** Authenticates the user but never checks that `user.id` maps to the round's `player_id`. Any authenticated user can generate a review for any round.

**Fix:** After fetching the round, add ownership verification. Replace lines 306-310 (between the round fetch and the "Check if round is complete" block):

```typescript
    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Verify the current user owns this round (is the player) or is a coach on their team
    const access = await verifyReviewAccess(supabase, round.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // Check if round is complete
```

**Exact old_string -> new_string edit:**

old_string:
```
    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Check if round is complete
```

new_string:
```
    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Verify the current user owns this round or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, round.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // Check if round is complete
```

---

#### 2. `getReviewById` (line 494)

**Current code** (lines 494-527):
```typescript
export async function getReviewById(reviewId: string): Promise<{
  success: boolean;
  review?: RoundReviewWithDetails;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select(`...`)
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    return { success: true, review: review as unknown as RoundReviewWithDetails };
```

**Problem:** No auth check at all. Completely unauthenticated access to any review.

**Fix:** Add auth + ownership check after the fetch:

old_string:
```
  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select(`
        *,
        round:golf_rounds!inner(
          *,
          player:golf_players!inner(
            *,
            profile:profiles!inner(id, first_name, last_name, email, avatar_url)
          ),
          course:golf_courses(*)
        )
      `)
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    return { success: true, review: review as unknown as RoundReviewWithDetails };
```

new_string:
```
  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select(`
        *,
        round:golf_rounds!inner(
          *,
          player:golf_players!inner(
            *,
            profile:profiles!inner(id, first_name, last_name, email, avatar_url)
          ),
          course:golf_courses(*)
        )
      `)
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user owns this review or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, review.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: 'Review not found or not accessible' };
    }

    return { success: true, review: review as unknown as RoundReviewWithDetails };
```

---

#### 3. `getReviewByRoundId` (line 532)

**Current code** (lines 532-558):
```typescript
export async function getReviewByRoundId(roundId: string): Promise<{...}> {
  const supabase = await createClient();

  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select('*')
      .eq('round_id', roundId)
      .single();
    ...
```

**Problem:** No auth check. Any user can fetch any review by round ID.

**Fix:** Add auth + ownership check after fetching the review:

old_string:
```
    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, review: undefined };
      }
      return { success: false, error: 'Failed to fetch review' };
    }

    return { success: true, review: dbRowToReview(review as ReviewDbRow) };
```

new_string:
```
    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, review: undefined };
      }
      return { success: false, error: 'Failed to fetch review' };
    }

    // Verify the current user owns this review or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, review.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: true, review: undefined };
    }

    return { success: true, review: dbRowToReview(review as ReviewDbRow) };
```

Note: Returns `undefined` (same as "not found") rather than an error to avoid leaking existence of reviews to unauthorized users.

---

#### 4. `getPlayerReviewHistory` (line 858)

**Current code** (lines 858-885):
```typescript
export async function getPlayerReviewHistory(playerId: string): Promise<{...}> {
  const supabase = await createClient();

  try {
    const { data: reviews, error } = await supabase
      .from('golf_round_reviews')
      .select('*')
      .eq('player_id', playerId)
      ...
```

**Problem:** No auth check. Any user can retrieve full review history for any player.

**Fix:** Add ownership check before the query:

old_string:
```
export async function getPlayerReviewHistory(playerId: string): Promise<{
  success: boolean;
  reviews?: GolfRoundReview[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: reviews, error } = await supabase
```

new_string:
```
export async function getPlayerReviewHistory(playerId: string): Promise<{
  success: boolean;
  reviews?: GolfRoundReview[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Verify the current user owns this player record or is a coach on their team
    const access = await verifyReviewAccess(supabase, playerId, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const { data: reviews, error } = await supabase
```

---

#### 5. `markReviewAsViewed` (line 890)

**Current code** (lines 890-935):
```typescript
export async function markReviewAsViewed(reviewId: string): Promise<{...}> {
  const supabase = await createClient();

  try {
    // Get existing review
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('patterns_detected')
      .eq('id', reviewId)
      .single();
```

**Problem:** No auth check. Any user can mark any review as viewed by the player.

**Fix:** Fetch `player_id` alongside `patterns_detected`, then verify ownership. This is a player-only action (marking as viewed by the player):

old_string:
```
    // Get existing review
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('patterns_detected')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }
```

new_string:
```
    // Get existing review
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('player_id, patterns_detected')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user is the player who owns this review
    const access = await verifyReviewAccess(supabase, review.player_id, 'player');
    if (!access.authorized) {
      return { success: false, error: 'Review not found or not accessible' };
    }
```

---

#### 6. `addPlayerFeedback` (line 940)

**Current code** (lines 940-983):
```typescript
export async function addPlayerFeedback(
  reviewId: string,
  feedback: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // Get existing review
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('patterns_detected')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }
```

**Problem:** No auth check. Any user can add "player feedback" to any review.

**Fix:** Fetch `player_id` alongside `patterns_detected`, then verify the user is the player (player-only action):

old_string:
```
    // Get existing review
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('patterns_detected')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }

    const extData = review.patterns_detected as ReviewExtendedData | null;
```

new_string:
```
    // Get existing review
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('player_id, patterns_detected')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user is the player who owns this review
    const access = await verifyReviewAccess(supabase, review.player_id, 'player');
    if (!access.authorized) {
      return { success: false, error: 'Review not found or not accessible' };
    }

    const extData = review.patterns_detected as ReviewExtendedData | null;
```

---

#### 7. `getReviewGenerationStatus` (line 1018)

**Current code** (lines 1018-1061):
```typescript
export async function getReviewGenerationStatus(reviewId: string): Promise<{...}> {
  const supabase = await createClient();

  try {
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select('patterns_detected')
      .eq('id', reviewId)
      .single();
```

**Problem:** No auth check. Any user can poll generation status for any review, leaking review existence and generation state.

**Fix:** Fetch `player_id` alongside `patterns_detected`, then verify ownership:

old_string:
```
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select('patterns_detected')
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }
```

new_string:
```
    const { data: review, error } = await supabase
      .from('golf_round_reviews')
      .select('player_id, patterns_detected')
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user owns this review or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, review.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: 'Review not found' };
    }
```

---

#### 8. `markReviewViewedByCoach` (line 1344)

**Current code** (lines 1344-1368):
```typescript
export async function markReviewViewedByCoach(
  reviewId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        coach_viewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .is('coach_viewed_at', null);
```

**Problem:** No auth check at all. Any unauthenticated or authenticated user can mark any review as viewed by a coach. This is the worst case -- no auth AND no ownership.

**Fix:** Add auth, verify user is a coach, and verify the review's player is on the coach's team:

old_string:
```
export async function markReviewViewedByCoach(
  reviewId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        coach_viewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .is('coach_viewed_at', null);

    if (error) {
      return { success: false, error: 'Failed to mark as viewed' };
    }

    return { success: true };

  } catch (error) {
    console.error('Error marking review as viewed by coach:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
```

new_string:
```
export async function markReviewViewedByCoach(
  reviewId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // Fetch the review to get its player_id
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('player_id')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user is a coach on the player's team
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach) {
      return { success: false, error: 'Not authorized - coach access required' };
    }

    // Verify the player is on the coach's team
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .limit(1)
        .maybeSingle();

      if (team) {
        const { data: teamMember } = await supabase
          .from('golf_team_members')
          .select('id')
          .eq('team_id', team.id)
          .eq('player_id', review.player_id)
          .eq('status', 'active')
          .maybeSingle();

        if (!teamMember) {
          return { success: false, error: 'Not authorized to access this review' };
        }
      } else {
        return { success: false, error: 'Not authorized to access this review' };
      }
    } else {
      return { success: false, error: 'Not authorized to access this review' };
    }

    const { error } = await supabase
      .from('golf_round_reviews')
      .update({
        coach_viewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .is('coach_viewed_at', null);

    if (error) {
      return { success: false, error: 'Failed to mark as viewed' };
    }

    return { success: true };

  } catch (error) {
    console.error('Error marking review as viewed by coach:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
```

---

### File: `src/app/golf/actions/round-review-system.ts`

---

#### 9. `getRoundReview` (line 986)

**Current code** (lines 986-1042):
```typescript
export async function getRoundReview(roundId: string): Promise<{...}> {
  const supabase = await createClient();

  try {
    const { data: existingReview, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select(`
        *,
        round:golf_rounds!inner(...)
      `)
      .eq('round_id', roundId)
      .maybeSingle();
```

**Problem:** No auth check. Any user can fetch any round's review with full round data.

**Fix:** Add auth + ownership verification after fetching the review:

old_string:
```
    if (!existingReview) {
      return { success: true, review: undefined };
    }

    const roundData = existingReview.round as RoundData;
```

new_string:
```
    if (!existingReview) {
      return { success: true, review: undefined };
    }

    // Verify the current user owns this review or is a coach on the player's team
    const access = await verifyReviewAccess(supabase, existingReview.player_id, 'player_or_coach');
    if (!access.authorized) {
      return { success: true, review: undefined };
    }

    const roundData = existingReview.round as RoundData;
```

---

#### 10. `shareRoundReviewWithCoach` (line 1261)

**Current code** (lines 1261-1277):
```typescript
export async function shareRoundReviewWithCoach(reviewId: string): Promise<{...}> {
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from('golf_round_reviews')
      .update({ shared_with_coach: true, shared_at: new Date().toISOString() })
      .eq('id', reviewId);
    if (error) return { success: false, error: 'Failed to share review' };
    revalidatePath('/golf/dashboard/rounds');
    return { success: true };
```

**Problem:** No auth check at all. Any user can share any review with a coach. This is a player-only action (the player shares their review).

**Fix:** Add auth + player ownership verification:

old_string:
```
export async function shareRoundReviewWithCoach(reviewId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from('golf_round_reviews')
      .update({ shared_with_coach: true, shared_at: new Date().toISOString() })
      .eq('id', reviewId);
    if (error) return { success: false, error: 'Failed to share review' };
```

new_string:
```
export async function shareRoundReviewWithCoach(reviewId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  try {
    // Fetch the review to verify ownership
    const { data: review, error: fetchError } = await supabase
      .from('golf_round_reviews')
      .select('player_id')
      .eq('id', reviewId)
      .single();

    if (fetchError || !review) {
      return { success: false, error: 'Review not found' };
    }

    // Verify the current user is the player who owns this review
    const access = await verifyReviewAccess(supabase, review.player_id, 'player');
    if (!access.authorized) {
      return { success: false, error: 'Not authorized to share this review' };
    }

    const { error } = await supabase
      .from('golf_round_reviews')
      .update({ shared_with_coach: true, shared_at: new Date().toISOString() })
      .eq('id', reviewId);
    if (error) return { success: false, error: 'Failed to share review' };
```

---

#### 11. `getStatAverages` (line 1279)

**Current code** (lines 1279-1358):
```typescript
export async function getStatAverages(
  playerId: string,
  teamId?: string
): Promise<{...}> {
  const supabase = await createClient();
  try {
    const { data: playerRounds, error: playerError } = await supabase
      .from('golf_rounds')
      .select('total_score, total_putts, ...')
      .eq('player_id', playerId)
      ...
```

**Problem:** No auth check. Any user can request stat averages for any player, exposing performance data.

**Fix:** Add auth + ownership check before fetching stats:

old_string:
```
export async function getStatAverages(
  playerId: string,
  teamId?: string
): Promise<{
  success: boolean;
  playerAvg?: { avgScore: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number };
  teamAvg?: { avgScore: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number };
  error?: string;
}> {
  const supabase = await createClient();
  try {
    const { data: playerRounds, error: playerError } = await supabase
```

new_string:
```
export async function getStatAverages(
  playerId: string,
  teamId?: string
): Promise<{
  success: boolean;
  playerAvg?: { avgScore: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number };
  teamAvg?: { avgScore: number; avgPutts: number; avgGirPct: number; avgFairwayPct: number };
  error?: string;
}> {
  const supabase = await createClient();
  try {
    // Verify the current user owns this player record or is a coach on their team
    const access = await verifyReviewAccess(supabase, playerId, 'player_or_coach');
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const { data: playerRounds, error: playerError } = await supabase
```

---

## Implementation Order

1. **Add `verifyReviewAccess` helper** to both files (top of file, after imports/types, before exported functions)
2. **Fix `markReviewViewedByCoach`** -- worst case (no auth at all, writes data)
3. **Fix `shareRoundReviewWithCoach`** -- no auth, writes data
4. **Fix `addPlayerFeedback`** -- no auth, writes data
5. **Fix `markReviewAsViewed`** -- no auth, writes data
6. **Fix `generateRoundReview`** -- has auth but no ownership, writes data
7. **Fix `getReviewById`** -- no auth, reads sensitive data
8. **Fix `getReviewByRoundId`** -- no auth, reads data
9. **Fix `getPlayerReviewHistory`** -- no auth, reads full history
10. **Fix `getReviewGenerationStatus`** -- no auth, reads status
11. **Fix `getRoundReview`** -- no auth, reads full review with round data
12. **Fix `getStatAverages`** -- no auth, reads stats

## Testing Notes

After applying fixes, verify:
- A player can only access their own reviews (test with two different player accounts)
- A coach can access reviews for players on their team but NOT players on other teams
- Unauthenticated requests are rejected with "Not authenticated"
- Player-only actions (`markReviewAsViewed`, `addPlayerFeedback`, `shareRoundReviewWithCoach`) reject coach access
- Coach-only actions (`markReviewViewedByCoach`) reject player access
- Functions that return data for unauthorized users return empty results (not error messages that leak existence)

## Performance Consideration

The `verifyReviewAccess` helper adds 1-3 extra database queries per call. For polling endpoints like `getReviewGenerationStatus`, this may be noticeable. If this becomes a bottleneck, consider:
- Caching the player/coach resolution in a session-scoped cache
- Adding RLS (Row Level Security) policies to `golf_round_reviews` as a defense-in-depth layer that offloads auth to the database

## Risk Assessment

- **Risk:** Low. All changes are additive guard clauses. No existing logic is modified.
- **Backward compatibility:** No API changes. Functions return the same types. Unauthorized calls that previously succeeded will now return errors/empty results, which is the intended behavior fix.
- **Edge case:** `markReviewViewedByPlayer` (line 1273) delegates to `markReviewAsViewed`, so fixing `markReviewAsViewed` automatically fixes `markReviewViewedByPlayer` as well.
