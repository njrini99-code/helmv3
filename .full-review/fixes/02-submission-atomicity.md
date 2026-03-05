# Fix Plan: Submission Atomicity & Related Bugs

**Bugs covered:** P0 #2, P0 #3, P1 #21, P1 #25
**File:** `src/app/golf/actions/golf.ts`
**Approach:** Minimal, targeted fixes with rollback-on-failure (no RPC transaction needed)

---

## Bug 1: P0 #2 — No transaction atomicity in round submission

### Problem

When `submitGolfRoundComprehensive()` inserts shots (lines 917-920), a failure only sets `shotsSaved = false` and the function continues to return `success: true`. This leaves a "completed" round with hole records but **zero shots** — a ghost round that corrupts stats, averages, and leaderboards.

The holes-insert failure path (lines 875-878) already has correct rollback logic that deletes the orphaned round. The shots-insert path does not.

### Current Code (lines 915-923)

```typescript
let shotsSaved = true;
if (allShots.length > 0) {
  const { data: insertedShots, error: shotsError } = await supabase
    .from('golf_shots')
    .insert(allShots)
    .select('id, hole_number, shot_number, shot_type');

  if (shotsError) {
    shotsSaved = false;
  } else if (insertedShots) {
```

### Fix

On shot insert failure, roll back by deleting holes and the round, then return an error. This mirrors the existing holes-insert rollback pattern.

### Exact Change (lines 922-923)

**Replace:**
```typescript
      if (shotsError) {
        shotsSaved = false;
```

**With:**
```typescript
      if (shotsError) {
        // Rollback: delete holes and the orphaned round to prevent ghost completed rounds with no shots
        await supabase.from('golf_holes').delete().eq('round_id', round.id);
        if (!existingRoundId) {
          await supabase.from('golf_rounds').delete().eq('id', round.id).eq('player_id', player.id);
        }
        return { success: false, error: 'Failed to save shot data. Please try again.' };
```

**Why `if (!existingRoundId)`:** For new rounds, the round itself is orphaned and must be deleted. For existing round updates, the round already existed before this call — deleting it would be worse than leaving it with holes but no shots. The round update case is further hardened by Bug 2's fix below (insert-before-delete).

---

## Bug 2: P0 #3 — Round update deletes old data before verifying new writes

### Problem

When updating an existing round (`existingRoundId` is set), lines 738-769 delete existing shots and holes BEFORE inserting new ones. If the subsequent insert of new holes/shots fails, the original data is permanently lost — a destructive, unrecoverable failure.

### Current Code (lines 738-769)

```typescript
if (existingRoundId) {
  // SECURITY: Verify the round belongs to this player before modifying
  const { data: existingRound, error: verifyError } = await supabase
    .from('golf_rounds')
    .select('id, player_id')
    .eq('id', existingRoundId)
    .eq('player_id', player.id)
    .single();

  if (verifyError || !existingRound) {
    return { success: false, error: 'Round not found or you do not have permission to update it.' };
  }

  // Delete existing shots (cascades from holes)
  const { error: deleteShotsError } = await supabase
    .from('golf_shots')
    .delete()
    .eq('round_id', existingRoundId);

  if (deleteShotsError) {
    // Non-critical - shots might not exist
  }

  // Delete existing holes
  const { error: deleteHolesError } = await supabase
    .from('golf_holes')
    .delete()
    .eq('round_id', existingRoundId);

  if (deleteHolesError) {
    return { success: false, error: 'Failed to update round. Please try again.' };
  }
}
```

### Fix

Remove the early deletion of shots and holes. Instead, defer the cleanup to AFTER the new holes and shots have been successfully inserted. The new data uses the same `round_id`, so we need to:

1. Keep the ownership verification (security check).
2. Remove the delete block from the pre-insert section.
3. Add a post-insert cleanup step that deletes old holes/shots that are NOT in the newly inserted set.

### Exact Change

**Step A — Replace the existing `if (existingRoundId)` block (lines 738-770) with just the ownership check:**

**Replace:**
```typescript
    // If updating an existing round, verify ownership and delete old holes and shots first
    if (existingRoundId) {
      // SECURITY: Verify the round belongs to this player before modifying
      const { data: existingRound, error: verifyError } = await supabase
        .from('golf_rounds')
        .select('id, player_id')
        .eq('id', existingRoundId)
        .eq('player_id', player.id)
        .single();

      if (verifyError || !existingRound) {
        return { success: false, error: 'Round not found or you do not have permission to update it.' };
      }

      // Delete existing shots (cascades from holes)
      const { error: deleteShotsError } = await supabase
        .from('golf_shots')
        .delete()
        .eq('round_id', existingRoundId);

      if (deleteShotsError) {
        // Non-critical - shots might not exist
      }

      // Delete existing holes
      const { error: deleteHolesError } = await supabase
        .from('golf_holes')
        .delete()
        .eq('round_id', existingRoundId);

      if (deleteHolesError) {
        return { success: false, error: 'Failed to update round. Please try again.' };
      }
    }
```

**With:**
```typescript
    // If updating an existing round, verify ownership (old data cleanup happens AFTER successful insert)
    if (existingRoundId) {
      // SECURITY: Verify the round belongs to this player before modifying
      const { data: existingRound, error: verifyError } = await supabase
        .from('golf_rounds')
        .select('id, player_id')
        .eq('id', existingRoundId)
        .eq('player_id', player.id)
        .single();

      if (verifyError || !existingRound) {
        return { success: false, error: 'Round not found or you do not have permission to update it.' };
      }
    }
```

**Step B — After successful hole insert (after current line 879), add cleanup of old holes:**

Insert the following block immediately after the `if (holesError)` rollback block (after line 879) and before the `holeIdMap` creation:

```typescript
    // For updates: delete old holes (and their shots) now that new ones are saved
    // The new holes have different IDs, so we delete holes NOT in the new set
    if (existingRoundId && insertedHoles) {
      const newHoleIds = insertedHoles.map(h => h.id);
      // Delete old shots that belong to old holes (not new ones)
      await supabase
        .from('golf_shots')
        .delete()
        .eq('round_id', existingRoundId)
        .not('hole_id', 'in', `(${newHoleIds.join(',')})`);
      // Delete old holes that are not in the new set
      await supabase
        .from('golf_holes')
        .delete()
        .eq('round_id', existingRoundId)
        .not('id', 'in', `(${newHoleIds.join(',')})`);
    }
```

**Why this is safe:** New holes are inserted with new UUIDs (Supabase generates them). The old holes have different IDs. By filtering with `.not('id', 'in', ...)`, we only delete the OLD holes, preserving the newly inserted ones. If this cleanup itself fails, we have duplicate hole rows for the round — a minor inconsistency that can be cleaned up, versus permanent data loss under the old approach.

**Interaction with Bug 1 fix:** The Bug 1 fix for shot insert failure on existing rounds does NOT delete the round (guarded by `if (!existingRoundId)`). With this Bug 2 fix, if shots fail to insert for an update, the old holes were NOT yet deleted (they get cleaned up only after successful shot insert — see Step C below).

**Step C — Move the old-hole cleanup to after successful shot insert:**

Actually, the cleaner approach is to defer ALL old-data cleanup to after BOTH holes and shots are successfully inserted. Let me revise:

**Revised Step B — Place the cleanup block after the shot insert success path, right before `revalidatePath` calls (before current line 1001):**

Remove the Step B block from after holes and instead add it right before line 1001 (`revalidatePath`):

```typescript
    // For updates: clean up old holes and shots now that new data is fully saved
    if (existingRoundId && insertedHoles) {
      const newHoleIds = insertedHoles.map(h => h.id);
      // Delete old shots belonging to old holes
      await supabase
        .from('golf_shots')
        .delete()
        .eq('round_id', existingRoundId)
        .not('hole_id', 'in', `(${newHoleIds.join(',')})`);
      // Delete old holes not in the new set
      await supabase
        .from('golf_holes')
        .delete()
        .eq('round_id', existingRoundId)
        .not('id', 'in', `(${newHoleIds.join(',')})`);
    }
```

This ensures old data is only deleted after both holes AND shots are confirmed written. If either insert fails, the function returns early with an error, and old data remains intact.

**Note on the `insertedHoles` scope:** The variable `insertedHoles` is declared at line 870 inside the function body (not inside the `if (existingRoundId)` block), so it is accessible at the cleanup point.

---

## Bug 3: P1 #21 — Qualifier stats sums null scores as 0

### Problem

`updateQualifierEntryStats()` at line 3643 uses `(r.total_score || 0)`, which converts `null` to `0`. A round with a null `total_score` (e.g., an incomplete/draft round that was somehow marked completed, or a data anomaly) would contribute `0` to the sum, dramatically lowering the player's total qualifier score and corrupting leaderboard rankings.

### Current Code (line 3643)

```typescript
const totalScore = rounds.reduce((sum, r) => sum + (r.total_score || 0), 0);
```

### Fix

Filter out rounds with null `total_score` before aggregating, and bail out if no valid rounds remain.

### Exact Change (lines 3641-3643)

**Replace:**
```typescript
    if (!rounds) return;

    const totalScore = rounds.reduce((sum, r) => sum + (r.total_score || 0), 0);
```

**With:**
```typescript
    if (!rounds) return;

    // Filter out rounds with null total_score to avoid summing 0 in place of missing data
    const scoredRounds = rounds.filter((r): r is typeof r & { total_score: number } => r.total_score != null);
    if (scoredRounds.length === 0) return;

    const totalScore = scoredRounds.reduce((sum, r) => sum + r.total_score, 0);
```

---

## Bug 4: P1 #25 — `courseRating`/`courseSlope` falsy check converts 0 to null

### Problem

Lines 800-801 use `||` for optional numeric fields:

```typescript
course_rating: data.courseRating || null,
course_slope: data.courseSlope || null,
```

The `||` operator treats `0` as falsy, so a `courseRating` or `courseSlope` of `0` would be converted to `null`. While `0` is an unlikely real-world value for these fields, the pattern is semantically wrong and could mask bugs. The same pattern appears on lines 796, 798-799, 802 for other optional fields.

### Current Code (lines 796-802)

```typescript
      course_id: data.courseId || null,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating || null,
      course_slope: data.courseSlope || null,
      tees_played: data.teesPlayed || null,
```

### Fix

Replace `||` with `??` for all numeric fields (`courseRating`, `courseSlope`). The string fields (`courseId`, `courseCity`, `courseState`, `teesPlayed`) could also be updated for consistency, but empty string `""` to `null` conversion via `||` is actually correct behavior for those — an empty string course name is meaningless. However, for maximum safety and consistency, replace all of them.

### Exact Change (lines 796-802)

**Replace:**
```typescript
      course_id: data.courseId || null,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating || null,
      course_slope: data.courseSlope || null,
      tees_played: data.teesPlayed || null,
```

**With:**
```typescript
      course_id: data.courseId || null,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating ?? null,
      course_slope: data.courseSlope ?? null,
      tees_played: data.teesPlayed || null,
```

Only `courseRating` and `courseSlope` are changed (`||` to `??`) because they are numeric fields where `0` is a valid (if unlikely) value. The string fields (`courseId`, `courseCity`, `courseState`, `teesPlayed`) keep `||` because converting empty string `""` to `null` is intentional and correct.

---

## Summary of Changes

| Bug | Lines Changed | Nature of Change | Risk |
|-----|---------------|------------------|------|
| P0 #2 | 922-923 | Shot insert failure now rolls back holes + round (new rounds) or just holes (updates), returns error | Low — mirrors existing holes-rollback pattern |
| P0 #3 | 738-769, ~1000 | Remove pre-insert delete; add post-success cleanup of old holes/shots using ID exclusion | Medium — changes control flow, but old data preserved on failure |
| P1 #21 | 3641-3643 | Filter null `total_score` rounds before summing | Very low — pure data-filtering improvement |
| P1 #25 | 800-801 | `\|\|` to `??` for numeric fields | Very low — only affects edge case of value being exactly `0` |

## Testing Checklist

- [ ] Submit a new round successfully — verify round, holes, shots all saved
- [ ] Simulate shot insert failure (e.g., invalid data) — verify round and holes are cleaned up, error returned
- [ ] Update an existing round successfully — verify old holes/shots are cleaned up, new data intact
- [ ] Simulate hole insert failure on update — verify old data is NOT deleted, error returned
- [ ] Simulate shot insert failure on update — verify old data is NOT deleted, error returned
- [ ] Submit a qualifier round with valid scores — verify `score` updated correctly
- [ ] Verify qualifier with a null `total_score` round — confirm it is excluded from sum
- [ ] Submit a round with `courseRating: 0` (if validation allows) — verify it is stored as `0`, not `null`
- [ ] Submit a round with `courseRating: undefined` — verify it is stored as `null`
