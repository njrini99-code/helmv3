# Fix Plan: State Machine Bugs (P1 #27, #28, #29, #16)

Four bugs in the GolfHelm shot tracking state machine that cause stale state, incorrect DB writes, missing input resets, and unreliable guard timing.

---

## Bug #27: `EDIT_SAVE_COMPLETE` does not call `computeRestoredState`

### File
`src/hooks/golf/use-shot-state-machine.ts`, lines 320-330

### Problem
When a user edits the **last** shot in history (e.g., changing its result from `fairway` to `green`), the `EDIT_SAVE_COMPLETE` reducer case updates `shotHistory` but does NOT recompute `distanceToHole`, `distanceUnit`, or `currentLie`. These values remain stale from before the edit.

Both `DELETE_COMPLETE` (line 341-357) and `UNDO_COMPLETE` (line 277-289) correctly call `computeRestoredState` to derive these values from the updated history. `EDIT_SAVE_COMPLETE` omits this.

### Current Code (lines 320-330)
```typescript
case 'EDIT_SAVE_COMPLETE':
  return {
    ...state,
    shotHistory: action.payload.updatedHistory,
    editSaving: false,
    showEditModal: false,
    editingShot: null,
    editFormData: null,
    editError: null,
    showDeleteConfirm: false,
  };
```

### Fix
Add `computeRestoredState` spread and `...CLEAR_INPUT` to mirror `DELETE_COMPLETE`. Also update `currentShot` to be consistent with the history length (the edit may not change the count, but being explicit is safer and matches the pattern).

```typescript
case 'EDIT_SAVE_COMPLETE': {
  const { updatedHistory } = action.payload;
  const restored = computeRestoredState(updatedHistory, state.holeYardage);
  return {
    ...state,
    shotHistory: updatedHistory,
    currentShot: updatedHistory.length + 1,
    ...restored,
    ...CLEAR_INPUT,
    editSaving: false,
    showEditModal: false,
    editingShot: null,
    editFormData: null,
    editError: null,
    showDeleteConfirm: false,
  };
}
```

### Why `...CLEAR_INPUT`?
After an edit completes, the user returns to the main shot-entry screen. Input state (e.g., `resultOfShot`, `missDirection`) should be clean, just like it is after `DELETE_COMPLETE` and `UNDO_COMPLETE`.

### Why `currentShot: updatedHistory.length + 1`?
An edit does not change the shot count (edits replace, not add/remove), so `updatedHistory.length + 1` equals the current value. But being explicit matches the `DELETE_COMPLETE`/`UNDO_COMPLETE` pattern and guards against future edge cases where an edit might cascade into a removal.

### Note on block scoping
The original case had no curly braces (it was a simple return). The fix introduces `const` bindings (`updatedHistory`, `restored`), which require a block scope `{ }` around the case body. This matches how `DELETE_COMPLETE` and `UNDO_COMPLETE` are already structured.

---

## Bug #28: Edit modal uses `deriveLieAfterFromResult` instead of `deriveLieAfter`

### File
`src/hooks/golf/use-edit-shot-modal.ts`, line 129

### Problem
`handleSaveEditedShot` builds the DB update payload with:
```typescript
lie_after: deriveLieAfterFromResult(editFormData.result),
```

`deriveLieAfterFromResult` is the **simple** version that only maps result strings to lie values. It does NOT account for:
1. **Penalty shots** (`isPenalty` flag) - should return `'penalty'` regardless of result.
2. **Approach miss context** (`approachMissLieType`) - e.g., an approach that misses to a bunker should have `lie_after = 'sand'`, but `deriveLieAfterFromResult('rough')` would return `'rough'`.

The **full** version, `deriveLieAfter(shot)`, handles both of these cases (see `src/lib/utils/shot-helpers.ts`, lines 36-41).

Note: the `updatedShot: ShotRecord` object is already constructed on lines 92-111 with all the needed fields (`isPenalty`, `approachMissLieType`, etc.), so `deriveLieAfter(updatedShot)` has access to the correct data.

### Current Code (line 4, import)
```typescript
import { deriveLieAfterFromResult, calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
```

### Current Code (line 129)
```typescript
lie_after: deriveLieAfterFromResult(editFormData.result),
```

### Fix

**Step 1: Update the import** (line 4)
```typescript
import { deriveLieAfter, calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
```

**Step 2: Replace the call** (line 129)
```typescript
lie_after: deriveLieAfter(updatedShot),
```

### Why this is safe
`deriveLieAfter` accepts a `ShotRecord` and returns `string | null`, which is the same type as `deriveLieAfterFromResult`. The `updatedShot` variable is defined earlier in the same scope (line 92) and contains the fully-populated edited shot with `isPenalty`, `result`, and `approachMissLieType`.

### Verification
After this fix, if a user edits a shot to be a penalty, the DB `lie_after` column will correctly store `'penalty'`. If a user edits an approach shot that missed into a bunker, `lie_after` will correctly store `'sand'` instead of whatever the raw `result` maps to.

---

## Bug #29: `CONFIRM_PENALTY` does not update positional state or clear inputs

### File
`src/hooks/golf/use-shot-state-machine.ts`, lines 255-262

### Problem
The `CONFIRM_PENALTY` case only does three things:
1. Appends the penalty shot to `shotHistory`
2. Increments `currentShot`
3. Closes the penalty modal

It does **not**:
- Update `currentLie` (should reflect the penalty result)
- Update `distanceToHole` / `distanceUnit` (penalty shots keep the same distance, but this should still be explicitly set)
- Clear input state (`resultOfShot`, `missDirection`, etc.)
- Update `distanceAfterUnit`

Compare with `UPDATE_AFTER_SHOT` (lines 201-212), which handles all of these.

### Current Code (lines 255-262)
```typescript
case 'CONFIRM_PENALTY':
  return {
    ...state,
    shotHistory: [...state.shotHistory, action.payload],
    currentShot: state.currentShot + 1,
    showPenaltyModal: false,
    penaltyType: null,
  };
```

### Analysis of penalty shot data
From `use-penalty-handler.ts`, the penalty shot is constructed with:
- `distanceToHoleAfter: state.distanceToHole` (same as before - ball is re-placed)
- `distanceUnitAfter: state.distanceUnit` (same unit)
- `result: 'penalty'`
- `lieBefore: state.currentLie`

After a penalty, the ball's lie is determined by `lieFromShotResult` for the penalty shot, which returns `shot.lieBefore || 'other'` for penalty results (line 112 of shot-helpers.ts). So the lie effectively stays the same.

The key values to set after a penalty:
- `currentLie`: Should be derived from the penalty shot. Use `lieFromShotResult(action.payload)` which returns `lieBefore` for penalties (the ball stays where it was, logically).
- `distanceToHole`: `action.payload.distanceToHoleAfter` (same as before for penalties)
- `distanceUnit`: `action.payload.distanceUnitAfter` (same as before for penalties)
- Clear all input state via `...CLEAR_INPUT`
- `distanceAfterUnit`: depends on whether the lie is on the green

### Fix
```typescript
case 'CONFIRM_PENALTY': {
  const penaltyShot = action.payload;
  const newLie = lieFromShotResult(penaltyShot);
  return {
    ...state,
    shotHistory: [...state.shotHistory, penaltyShot],
    currentShot: state.currentShot + 1,
    currentLie: newLie,
    distanceToHole: penaltyShot.distanceToHoleAfter,
    distanceUnit: penaltyShot.distanceUnitAfter,
    ...CLEAR_INPUT,
    distanceAfterUnit: newLie === 'green' ? 'feet' : 'yards',
    showPenaltyModal: false,
    penaltyType: null,
  };
}
```

### Why this matters
Without this fix, after a penalty:
1. `currentLie` is stale - if the user was on the green, then navigated away and came back, the lie context might be wrong.
2. Input state (`resultOfShot`, `missDirection`, etc.) is NOT cleared, so stale values from before the penalty modal was opened can leak into the next shot entry.
3. `distanceAfterUnit` is not reset, so the unit toggle could show an incorrect default.

### Pattern consistency
This now mirrors the `UPDATE_AFTER_SHOT` pattern: update positional state, clear inputs, set the correct `distanceAfterUnit` based on lie. The only difference is penalty shots don't change distance (the ball is re-placed), but we still set the values explicitly from the shot record for correctness.

---

## Bug #16: `requestAnimationFrame` guard release timing unreliable

### File
`src/components/golf/ShotTrackingComprehensive.tsx`, lines 432-435

### Problem
The `isProcessingShotRef` concurrency guard prevents double-tap from recording duplicate shots. It is set to `true` at the start of `handleNextShot` (line 334) and released at the end:

```typescript
// Release concurrency guard after React batches state updates
// Use requestAnimationFrame to ensure it happens after the current event loop
requestAnimationFrame(() => {
  isProcessingShotRef.current = false;
});
```

`requestAnimationFrame` has **unpredictable timing**:
- It fires before the next repaint, which is typically ~16ms, but can be delayed if the tab is backgrounded, if the browser is throttling, or if the paint is blocked.
- On mobile Safari especially, rAF can be deferred significantly during scroll or animation.
- This means the guard can either release too early (before React batches the dispatches, allowing a duplicate) or too late (blocking legitimate shots for hundreds of milliseconds).

### Current Code (lines 431-435)
```typescript
// Release concurrency guard after React batches state updates
// Use requestAnimationFrame to ensure it happens after the current event loop
requestAnimationFrame(() => {
  isProcessingShotRef.current = false;
});
```

### Fix
Replace `requestAnimationFrame` with `queueMicrotask`. Microtasks run at the end of the current task, after all synchronous code and before the browser yields to the event loop. This is the correct timing: it runs after the two synchronous `dispatch` calls have been issued (React 18+ batches them automatically within the same event handler), but before the next user interaction event can fire.

```typescript
// Release concurrency guard after dispatches are batched
queueMicrotask(() => {
  isProcessingShotRef.current = false;
});
```

### Why `queueMicrotask` is better
1. **Predictable timing**: Microtasks run immediately after the current synchronous execution completes, before any new macrotasks (like user input events). This means the guard is released after React processes the dispatches but before a user's next tap can fire `handleNextShot` again.
2. **Not affected by tab visibility**: Unlike `requestAnimationFrame`, `queueMicrotask` is not tied to the rendering pipeline and is not throttled when the tab is backgrounded.
3. **Consistent across browsers**: Microtask timing is well-specified and consistent across all modern browsers.

### Why not release synchronously?
Releasing synchronously (`isProcessingShotRef.current = false` right after the dispatches) would also work in React 18+ because `dispatch` calls within the same event handler are batched. However, `queueMicrotask` adds a minimal safety margin: it guarantees the release happens after ALL synchronous code in `handleNextShot` completes (including the `completeHole` call for hole-in scenarios), making it more robust against future refactors that might add more synchronous logic after the dispatches.

---

## Summary of Changes

| Bug | File | Change |
|-----|------|--------|
| #27 | `use-shot-state-machine.ts` | Add `computeRestoredState` + `CLEAR_INPUT` spread to `EDIT_SAVE_COMPLETE` case |
| #28 | `use-edit-shot-modal.ts` | Change import from `deriveLieAfterFromResult` to `deriveLieAfter`; call `deriveLieAfter(updatedShot)` on line 129 |
| #29 | `use-shot-state-machine.ts` | Expand `CONFIRM_PENALTY` to set `currentLie`, `distanceToHole`, `distanceUnit`, spread `CLEAR_INPUT`, and set `distanceAfterUnit` |
| #16 | `ShotTrackingComprehensive.tsx` | Replace `requestAnimationFrame` with `queueMicrotask` for guard release |

All four fixes are backward-compatible (no API changes, no new props, no type signature changes). They only correct internal state management behavior.
