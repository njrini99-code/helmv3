# Fix Plan 06: Auto-Save UX, Undo Feedback, and isStartingRound Lock

**Bugs addressed:** P0 #10, P1 #32, P1 #12
**Files modified:** 3
**Risk:** Low -- all changes are additive state fields, new reducer branches, and guard resets

---

## Bug 1: P0 #10 — Auto-save error clears after 3 seconds with no retry

### Problem

In `src/hooks/golf/use-shot-state-machine.ts` lines 548-553, when auto-save fails, the error status is cleared after a 3-second timeout, reverting to `'idle'`. The user never sees the error (or sees it briefly and it vanishes). There is no retry mechanism, so shots silently remain unsaved until the next shot triggers a new auto-save cycle.

**Current code (lines 548-553):**
```typescript
} catch {
  dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'error' });
  if (autoSaveStatusTimeoutRef.current) clearTimeout(autoSaveStatusTimeoutRef.current);
  autoSaveStatusTimeoutRef.current = setTimeout(() => {
    dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'idle' });
  }, 3000);
}
```

### Fix Design

1. **New state fields** on `ShotTrackingState`:
   - `pendingSaveCount: number` — how many unsaved shot changes exist (incremented on shot record, decremented on successful save)
   - `autoSaveRetryAttempt: number` — current retry attempt (0 = no retry in progress)

2. **New action types:**
   - `AUTO_SAVE_RETRY_SCHEDULED` — sets `autoSaveRetryAttempt` to the attempt number
   - `AUTO_SAVE_RESET` — called on successful save; resets retry attempt and pending count
   - `INCREMENT_PENDING_SAVE` — incremented when shots change and haven't been saved

3. **Remove the error-clearing timeout.** On error, status stays `'error'` until a successful save sets it to `'saved'` (then `'idle'` after 2s as today).

4. **Exponential backoff retry** (3 attempts: 5s, 15s, 30s) implemented in the auto-save effect using a new `autoSaveRetryTimeoutRef`.

### Exact Changes

#### File: `src/hooks/golf/use-shot-state-machine.ts`

**Change 1 — Add state fields to `ShotTrackingState` interface (after line 47):**

```typescript
// REPLACE:
  // Auto-save
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';

// WITH:
  // Auto-save
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  pendingSaveCount: number;
  autoSaveRetryAttempt: number;
```

**Change 2 — Add new action types to `ShotAction` union (after line 85):**

```typescript
// REPLACE:
  // Auto-save
  | { type: 'SET_AUTO_SAVE_STATUS'; payload: 'idle' | 'saving' | 'saved' | 'error' }

// WITH:
  // Auto-save
  | { type: 'SET_AUTO_SAVE_STATUS'; payload: 'idle' | 'saving' | 'saved' | 'error' }
  | { type: 'AUTO_SAVE_RETRY_SCHEDULED'; payload: number }
  | { type: 'AUTO_SAVE_RESET' }
  | { type: 'INCREMENT_PENDING_SAVE' }
```

**Change 3 — Add reducer cases (after the `SET_AUTO_SAVE_STATUS` case, line 246):**

```typescript
// REPLACE:
    case 'SET_AUTO_SAVE_STATUS':
      return { ...state, autoSaveStatus: action.payload };

// WITH:
    case 'SET_AUTO_SAVE_STATUS':
      return { ...state, autoSaveStatus: action.payload };

    case 'AUTO_SAVE_RETRY_SCHEDULED':
      return { ...state, autoSaveRetryAttempt: action.payload };

    case 'AUTO_SAVE_RESET':
      return { ...state, autoSaveRetryAttempt: 0, pendingSaveCount: 0 };

    case 'INCREMENT_PENDING_SAVE':
      return { ...state, pendingSaveCount: state.pendingSaveCount + 1 };
```

**Change 4 — Initialize new fields in `computeInitialState` (after line 454):**

```typescript
// REPLACE:
    autoSaveStatus: 'idle',

// WITH:
    autoSaveStatus: 'idle',
    pendingSaveCount: 0,
    autoSaveRetryAttempt: 0,
```

**Change 5 — Add retry ref alongside existing refs (after line 503):**

```typescript
// REPLACE:
  const autoSaveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// WITH:
  const autoSaveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
```

**Change 6 — Increment pending count when shots are recorded.** Add a new effect after the auto-save effect (after line 561):

```typescript
  // ---- EFFECT: Track pending saves when shot history changes ----
  useEffect(() => {
    if (state.shotHistory.length === 0) return;
    const currentFingerprint = computeShotFingerprint(state.shotHistory);
    if (currentFingerprint !== lastSavedShotsRef.current) {
      dispatch({ type: 'INCREMENT_PENDING_SAVE' });
    }
  }, [state.shotHistory]);
```

**Change 7 — Replace the auto-save effect's catch block AND add retry logic (lines 526-561).**

Replace the entire auto-save effect:

```typescript
  // ---- EFFECT: Auto-save ----
  useEffect(() => {
    if (!onAutoSaveRef.current || state.shotHistory.length === 0) return;

    const currentFingerprint = computeShotFingerprint(state.shotHistory);
    if (currentFingerprint === lastSavedShotsRef.current) return;

    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    autoSaveTimeoutRef.current = setTimeout(async () => {
      const freshFingerprint = computeShotFingerprint(shotHistoryRef.current);
      if (freshFingerprint === lastSavedShotsRef.current) return;

      try {
        dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'saving' });
        await onAutoSaveRef.current?.(shotHistoryRef.current, currentHoleIndexRef.current);
        lastSavedShotsRef.current = freshFingerprint;
        dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'saved' });
        dispatch({ type: 'AUTO_SAVE_RESET' });

        // Clear any pending retry since save succeeded
        if (autoSaveRetryTimeoutRef.current) {
          clearTimeout(autoSaveRetryTimeoutRef.current);
          autoSaveRetryTimeoutRef.current = null;
        }

        if (autoSaveStatusTimeoutRef.current) clearTimeout(autoSaveStatusTimeoutRef.current);
        autoSaveStatusTimeoutRef.current = setTimeout(() => {
          dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'idle' });
        }, 2000);
      } catch {
        dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'error' });

        // Schedule retry with exponential backoff (max 3 attempts: 5s, 15s, 30s)
        const RETRY_DELAYS = [5000, 15000, 30000];
        const currentAttempt = state.autoSaveRetryAttempt;
        if (currentAttempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[currentAttempt]!;
          dispatch({ type: 'AUTO_SAVE_RETRY_SCHEDULED', payload: currentAttempt + 1 });

          if (autoSaveRetryTimeoutRef.current) clearTimeout(autoSaveRetryTimeoutRef.current);
          autoSaveRetryTimeoutRef.current = setTimeout(async () => {
            const retryFingerprint = computeShotFingerprint(shotHistoryRef.current);
            if (retryFingerprint === lastSavedShotsRef.current) {
              // Data was saved by another path (e.g. hole complete); clear error
              dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'idle' });
              dispatch({ type: 'AUTO_SAVE_RESET' });
              return;
            }

            try {
              dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'saving' });
              await onAutoSaveRef.current?.(shotHistoryRef.current, currentHoleIndexRef.current);
              lastSavedShotsRef.current = retryFingerprint;
              dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'saved' });
              dispatch({ type: 'AUTO_SAVE_RESET' });

              if (autoSaveStatusTimeoutRef.current) clearTimeout(autoSaveStatusTimeoutRef.current);
              autoSaveStatusTimeoutRef.current = setTimeout(() => {
                dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'idle' });
              }, 2000);
            } catch {
              // Retry failed — keep error status visible (no auto-clear)
              dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'error' });
            }
          }, delay);
        }
        // After 3 retries exhausted: error status stays visible permanently
        // until a new shot triggers a new auto-save cycle that succeeds
      }
    }, autoSaveInterval);

    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (autoSaveStatusTimeoutRef.current) clearTimeout(autoSaveStatusTimeoutRef.current);
      if (autoSaveRetryTimeoutRef.current) clearTimeout(autoSaveRetryTimeoutRef.current);
    };
  }, [state.shotHistory, currentHoleIndex, autoSaveInterval, state.autoSaveRetryAttempt]);
```

**Key behavioral changes:**
- Error status **never auto-clears**. It stays visible until a successful save.
- On failure, retries are scheduled at 5s, 15s, 30s with exponential backoff.
- After 3 failed retries, error persists permanently until the next shot triggers a new save cycle.
- `pendingSaveCount` lets the UI show "X unsaved changes" if desired.
- `autoSaveRetryAttempt` lets the UI show "Retrying (2/3)..." if desired.
- Successful save (including retries) resets all retry/pending state.
- Retry timeouts are cleaned up in the effect's cleanup function.

---

## Bug 2: P1 #32 — Undo failure provides zero user feedback

### Problem

In `src/hooks/golf/use-undo-manager.ts` lines 47-50, when `deleteShot` returns `{ success: false }`, the `UNDO_FAIL` action is dispatched. The reducer (line 292 of `use-shot-state-machine.ts`) only sets `undoSaving: false`. Since `showUndoConfirm` is not explicitly kept `true`, the dialog closes (the component likely hides when `undoSaving` becomes false with no error). The user gets no feedback that the undo failed.

**Current UNDO_FAIL reducer (line 291-292):**
```typescript
case 'UNDO_FAIL':
  return { ...state, undoSaving: false };
```

**Current undo manager dispatch (lines 48-49):**
```typescript
if (!result.success) {
  dispatch({ type: 'UNDO_FAIL' });
  return;
}
```

### Fix Design

1. **New state field** on `ShotTrackingState`:
   - `undoError: string | null` — error message to display in the undo confirmation dialog

2. **Update `UNDO_FAIL` action** to accept an optional error message payload.

3. **Update reducer** to set `undoError`, keep `showUndoConfirm: true`, and clear `undoSaving`.

4. **Update `useUndoManager`** to pass error messages to `UNDO_FAIL`.

5. **Clear `undoError`** when `SHOW_UNDO_CONFIRM` or `HIDE_UNDO_CONFIRM` is dispatched.

### Exact Changes

#### File: `src/hooks/golf/use-shot-state-machine.ts`

**Change 1 — Add `undoError` field to `ShotTrackingState` (after line 53):**

```typescript
// REPLACE:
  // Undo
  showUndoConfirm: boolean;
  undoSaving: boolean;

// WITH:
  // Undo
  showUndoConfirm: boolean;
  undoSaving: boolean;
  undoError: string | null;
```

**Change 2 — Update `UNDO_FAIL` action type to accept a payload (line 96):**

```typescript
// REPLACE:
  | { type: 'UNDO_FAIL' }

// WITH:
  | { type: 'UNDO_FAIL'; payload?: string }
```

**Change 3 — Update `SHOW_UNDO_CONFIRM` reducer case to clear previous errors (line 269):**

```typescript
// REPLACE:
    case 'SHOW_UNDO_CONFIRM':
      return { ...state, showUndoConfirm: true };

// WITH:
    case 'SHOW_UNDO_CONFIRM':
      return { ...state, showUndoConfirm: true, undoError: null };
```

**Change 4 — Update `HIDE_UNDO_CONFIRM` reducer case to clear errors (line 271):**

```typescript
// REPLACE:
    case 'HIDE_UNDO_CONFIRM':
      return { ...state, showUndoConfirm: false };

// WITH:
    case 'HIDE_UNDO_CONFIRM':
      return { ...state, showUndoConfirm: false, undoError: null };
```

**Change 5 — Update `UNDO_FAIL` reducer case (lines 291-292):**

```typescript
// REPLACE:
    case 'UNDO_FAIL':
      return { ...state, undoSaving: false };

// WITH:
    case 'UNDO_FAIL':
      return {
        ...state,
        undoSaving: false,
        undoError: action.payload ?? 'Failed to undo shot. Please try again.',
        showUndoConfirm: true,
      };
```

**Change 6 — Clear `undoError` on successful undo in `UNDO_COMPLETE` (line 286, inside the return):**

```typescript
// REPLACE:
        undoSaving: false,
        showUndoConfirm: false,

// WITH:
        undoSaving: false,
        undoError: null,
        showUndoConfirm: false,
```

**Change 7 — Initialize `undoError` in `computeInitialState` (after line 458):**

```typescript
// REPLACE:
    showUndoConfirm: false,
    undoSaving: false,

// WITH:
    showUndoConfirm: false,
    undoSaving: false,
    undoError: null,
```

#### File: `src/hooks/golf/use-undo-manager.ts`

**Change 1 — Pass error messages to `UNDO_FAIL` dispatch (lines 48-50):**

```typescript
// REPLACE:
        if (!result.success) {
          dispatch({ type: 'UNDO_FAIL' });
          return;
        }

// WITH:
        if (!result.success) {
          dispatch({ type: 'UNDO_FAIL', payload: 'Server failed to delete the shot. Your data is safe — please try again.' });
          return;
        }
```

**Change 2 — Pass error messages in the catch block (lines 68-70):**

```typescript
// REPLACE:
      console.error('Error undoing shot:', error instanceof Error ? error.message : String(error));
      dispatch({ type: 'UNDO_FAIL' });

// WITH:
      console.error('Error undoing shot:', error instanceof Error ? error.message : String(error));
      dispatch({ type: 'UNDO_FAIL', payload: 'A network error occurred while undoing the shot. Check your connection and try again.' });
```

**UI note:** The undo confirmation dialog component (inside `ShotTrackingComprehensive.tsx`) should be updated to display `state.undoError` when present. This is a separate UI change but the state machinery is now in place. A simple addition would be:

```tsx
{state.undoError && (
  <p className="text-sm text-red-600 mt-2">{state.undoError}</p>
)}
```

This should be added inside the undo confirmation dialog, above the action buttons. The dialog stays open because `showUndoConfirm` remains `true` on failure, letting the user see the error and retry.

---

## Bug 3: P1 #12 — `isStartingRound` lock never released on success paths

### Problem

In `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx`, the `handleSetupSubmit` function sets `setIsStartingRound(true)` at line 445. On validation failure (lines 447-463), it correctly calls `setIsStartingRound(false)`. However, on the two success paths:

1. **Preloaded configs path** (lines 467-478): Sets holes and transitions to `'tracking'` step, but never resets `isStartingRound`.
2. **New course path** (lines 479-482): Transitions to `'holes'` step, but never resets `isStartingRound`.

This means after successful setup submission, `isStartingRound` stays `true` forever. The Cancel button is `disabled={isStartingRound}` (line 1494) and the submit button is `disabled={isStartingRound}` (line 1501). If the user navigates back from the tracking or holes step to setup (via the "Back" button at line 1635), both buttons remain permanently disabled.

**Current code (lines 467-483):**
```typescript
    // If using a saved course with hole configs, skip the hole configuration step
    if (preloadedHoleConfigs && preloadedHoleConfigs.length > 0) {
      // Slice to match selected hole count
      const configs = preloadedHoleConfigs.slice(0, holesPerRound);
      const initialHoles: Hole[] = configs.map((h) => ({
        number: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        score: null,
      }));
      setHoles(initialHoles);
      setCompletedHoleStats([]);
      setStep('tracking');
    } else {
      // Go to hole configuration step for new courses
      setStep('holes');
    }
  };
```

### Exact Changes

#### File: `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx`

**Change 1 — Add `setIsStartingRound(false)` at the end of the preloaded configs success path (after line 478, before the closing brace):**

```typescript
// REPLACE:
      setHoles(initialHoles);
      setCompletedHoleStats([]);
      setStep('tracking');
    } else {

// WITH:
      setHoles(initialHoles);
      setCompletedHoleStats([]);
      setIsStartingRound(false);
      setStep('tracking');
    } else {
```

**Change 2 — Add `setIsStartingRound(false)` at the end of the new course success path (after line 481, before the closing brace):**

```typescript
// REPLACE:
      // Go to hole configuration step for new courses
      setStep('holes');
    }
  };

// WITH:
      // Go to hole configuration step for new courses
      setIsStartingRound(false);
      setStep('holes');
    }
  };
```

---

## Summary of All State Changes

### New fields on `ShotTrackingState`:
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `pendingSaveCount` | `number` | `0` | Tracks unsaved shot changes for UI display |
| `autoSaveRetryAttempt` | `number` | `0` | Current retry attempt (0-3) for backoff logic |
| `undoError` | `string \| null` | `null` | Error message shown in undo confirmation dialog |

### New action types on `ShotAction`:
| Action | Payload | Dispatched when |
|--------|---------|----------------|
| `AUTO_SAVE_RETRY_SCHEDULED` | `number` (attempt) | Retry timer is set after a failed save |
| `AUTO_SAVE_RESET` | none | Save succeeds (including retries) |
| `INCREMENT_PENDING_SAVE` | none | Shot history changes with unsaved data |
| `UNDO_FAIL` (updated) | `string?` (error msg) | Undo operation fails |

### Modified action behaviors:
| Action | Change |
|--------|--------|
| `UNDO_FAIL` | Now accepts optional `payload` string, sets `undoError`, keeps `showUndoConfirm: true` |
| `SHOW_UNDO_CONFIRM` | Now clears `undoError` |
| `HIDE_UNDO_CONFIRM` | Now clears `undoError` |
| `UNDO_COMPLETE` | Now clears `undoError` |

### New refs in the hook:
| Ref | Type | Purpose |
|-----|------|---------|
| `autoSaveRetryTimeoutRef` | `NodeJS.Timeout \| null` | Tracks retry timeout for cleanup |

---

## Testing Checklist

### Bug 1 (Auto-save retry):
- [ ] Auto-save failure shows persistent error status (does not clear after 3s)
- [ ] After failure, retry fires at ~5s
- [ ] If first retry fails, second retry fires at ~15s
- [ ] If second retry fails, third retry fires at ~30s
- [ ] If all retries fail, error stays visible indefinitely
- [ ] If any retry succeeds, status transitions to 'saved' then 'idle'
- [ ] `pendingSaveCount` increments when shots change without a save
- [ ] `pendingSaveCount` resets to 0 on successful save
- [ ] Adding a new shot while retrying doesn't create duplicate save calls
- [ ] Navigating to a new hole cleans up all retry timeouts
- [ ] Successful save during retry window cancels pending retry

### Bug 2 (Undo error feedback):
- [ ] When `deleteShot` returns `{ success: false }`, dialog stays open with error message
- [ ] When network error occurs during undo, dialog stays open with network error message
- [ ] Error message clears when dialog is dismissed
- [ ] Error message clears when undo dialog is re-opened
- [ ] Successful undo still closes dialog normally
- [ ] User can retry undo after seeing the error (button remains clickable)

### Bug 3 (isStartingRound lock):
- [ ] After selecting a saved course and clicking "Start Round", `isStartingRound` resets to `false`
- [ ] After clicking "Next: Configure Holes", `isStartingRound` resets to `false`
- [ ] Navigating back from tracking step to setup shows enabled buttons
- [ ] Navigating back from holes step to setup shows enabled buttons
- [ ] Double-click prevention still works (rapid clicks don't create duplicate submissions)
- [ ] Validation failures still correctly reset `isStartingRound`
