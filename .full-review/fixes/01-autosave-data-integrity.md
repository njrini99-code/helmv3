# Fix Plan: Auto-Save Data Integrity (5 Bugs)

**File:** `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx`
**Date:** 2026-03-04

---

## Bug 1 (P0 #1): Auto-save uses stale closure state

**Problem:** On line 691, `handleAutoSave` calls `buildPartialRoundData()` inside a fire-and-forget IIFE. Because React batches state updates, the `setInProgressShotsByHole` call on line 666 has not yet flushed when `buildPartialRoundData()` executes. `buildPartialRoundData` closes over the stale `completedHoleStats` and `inProgressShotsByHole` from the previous render cycle, so the server save persists outdated data.

**Root cause:** `buildPartialRoundData()` on line 696 reads from closure state (`completedHoleStats`, `inProgressShotsByHole`) that hasn't been updated yet by the `setInProgressShotsByHole` call on line 666.

**Fix:** Pass the current shots and hole index explicitly to `buildPartialRoundData` using its override parameters, so the server save uses the data passed into `handleAutoSave` rather than stale closure values.

**Lines:** 695-698

### Old code (lines 695-698):
```typescript
        try {
          const result = await savePartialRound(
            buildPartialRoundData(),
            savedRoundIdRef.current ?? undefined
```

### New code:
```typescript
        try {
          const mergedInProgress = { ...inProgressShotsByHole, [holeIndex]: shots };
          const result = await savePartialRound(
            buildPartialRoundData(undefined, holeIndex, mergedInProgress),
            savedRoundIdRef.current ?? undefined
```

**Why:** By constructing `mergedInProgress` from the current closure's `inProgressShotsByHole` merged with the fresh `shots` parameter, and passing it as the `overrideInProgress` argument, `buildPartialRoundData` uses the authoritative data instead of waiting for React's batched state update to flush. The `holeIndex` parameter is also passed as `overrideCurrentHole` to ensure the correct hole index is used.

---

## Bug 2 (P0 #4): Auto-save draft overwrites other holes' in-progress shots

**Problem:** On line 682, `draftDataForDb.inProgressShots` is set to `{ [holeIndex]: shots }`, which only includes the current hole's shots. When this draft is saved, all other holes' in-progress shots are lost. For example, if a player has entered 3 shots on hole 5, navigates to hole 6 and enters 2 shots, then auto-save triggers -- only hole 6's shots are saved to the draft, and hole 5's 3 shots are gone.

**Root cause:** The draft data object literal on line 682 creates a fresh object with only one key instead of merging with the existing `inProgressShotsByHole` map.

**Fix:** Spread all existing in-progress shots and override only the current hole.

**Line:** 682

### Old code (line 682):
```typescript
      inProgressShots: { [holeIndex]: shots },
```

### New code:
```typescript
      inProgressShots: { ...inProgressShotsByHole, [holeIndex]: shots },
```

**Why:** This preserves in-progress shots from all holes while still updating the current hole with the latest shots. The `inProgressShotsByHole` state contains shots for holes the player has navigated away from without completing, and these must be preserved in the draft.

---

## Bug 3 (P1 #11): Concurrent auto-saves silently dropped

**Problem:** On lines 692-693, the `serverSaveInProgressRef` mutex causes new saves to be silently dropped if a save is already in-flight:
```typescript
if (serverSaveInProgressRef.current) return;
serverSaveInProgressRef.current = true;
```
On slow cellular connections (common on a golf course), saves can take several seconds. Any auto-save triggered during that window is permanently lost -- there is no queue, no retry, and no notification to the user.

**Root cause:** The mutex pattern protects against concurrent requests but discards pending data entirely instead of queuing it.

**Fix:** Implement a "latest wins" pending-save pattern. Instead of returning early, store the latest save data in a ref. When the current save completes, check if new data arrived and execute one more save with the most recent data.

**Lines:** 183-184 (new ref declaration) and 690-725 (the IIFE in `handleAutoSave`)

### Step 1: Add a new ref for pending save data

#### Old code (lines 183-184):
```typescript
  const serverSaveInProgressRef = useRef(false);
  const consecutiveSaveFailuresRef = useRef(0);
```

#### New code:
```typescript
  const serverSaveInProgressRef = useRef(false);
  const pendingServerSaveRef = useRef<{ shots: ShotRecord[]; holeIndex: number } | null>(null);
  const consecutiveSaveFailuresRef = useRef(0);
```

### Step 2: Replace the fire-and-forget IIFE in `handleAutoSave`

#### Old code (lines 690-726):
```typescript
    // Background save proper shot/hole data to database (non-blocking)
    if (navigator.onLine) {
      void (async () => {
        if (serverSaveInProgressRef.current) return;
        serverSaveInProgressRef.current = true;
        try {
          const result = await savePartialRound(
            buildPartialRoundData(),
            savedRoundIdRef.current ?? undefined
          );
          if (result.success) {
            consecutiveSaveFailuresRef.current = 0;
            if (!savedRoundIdRef.current) {
              savedRoundIdRef.current = result.data.roundId;
              setSavedRoundId(result.data.roundId);
            }
          } else {
            consecutiveSaveFailuresRef.current++;
            if (consecutiveSaveFailuresRef.current >= 2) {
              showToast(
                'Auto-save is having trouble. Your draft is saved locally, but server sync may be delayed.',
                'warning'
              );
            }
          }
        } catch {
          consecutiveSaveFailuresRef.current++;
          if (consecutiveSaveFailuresRef.current >= 2) {
            showToast(
              'Auto-save is having trouble. Your draft is saved locally, but server sync may be delayed.',
              'warning'
            );
          }
        } finally {
          serverSaveInProgressRef.current = false;
        }
      })();
    }
```

#### New code:
```typescript
    // Background save proper shot/hole data to database (non-blocking)
    if (navigator.onLine) {
      if (serverSaveInProgressRef.current) {
        // Queue this save — it will execute after the current one completes
        pendingServerSaveRef.current = { shots, holeIndex };
      } else {
        const executeServerSave = async (saveShots: ShotRecord[], saveHoleIndex: number) => {
          serverSaveInProgressRef.current = true;
          try {
            const mergedInProgress = { ...inProgressShotsByHole, [saveHoleIndex]: saveShots };
            const result = await savePartialRound(
              buildPartialRoundData(undefined, saveHoleIndex, mergedInProgress),
              savedRoundIdRef.current ?? undefined
            );
            if (result.success) {
              consecutiveSaveFailuresRef.current = 0;
              if (!savedRoundIdRef.current) {
                savedRoundIdRef.current = result.data.roundId;
                setSavedRoundId(result.data.roundId);
              }
            } else {
              consecutiveSaveFailuresRef.current++;
              if (consecutiveSaveFailuresRef.current >= 2) {
                showToast(
                  'Auto-save is having trouble. Your draft is saved locally, but server sync may be delayed.',
                  'warning'
                );
              }
            }
          } catch {
            consecutiveSaveFailuresRef.current++;
            if (consecutiveSaveFailuresRef.current >= 2) {
              showToast(
                'Auto-save is having trouble. Your draft is saved locally, but server sync may be delayed.',
                'warning'
              );
            }
          } finally {
            serverSaveInProgressRef.current = false;
            // If a newer save was queued while we were saving, execute it now
            const pending = pendingServerSaveRef.current;
            if (pending) {
              pendingServerSaveRef.current = null;
              void executeServerSave(pending.shots, pending.holeIndex);
            }
          }
        };
        void executeServerSave(shots, holeIndex);
      }
    }
```

**Why:** The "latest wins" pattern ensures that the most recent shot data always gets persisted. If multiple auto-saves fire while one is in-flight, only the latest data is kept in the pending ref (older intermediate states are overwritten, which is correct since only the latest state matters). When the in-flight save completes, it checks for pending data and executes one final save. This also incorporates the fix from Bug 1 -- using explicit parameters to `buildPartialRoundData` instead of stale closure state.

---

## Bug 4 (P1 #14): Draft resume does not restore `holesPerRound`

**Problem:** On line 363, `handleResumeDraft` restores `step`, `setupData`, `holes`, `completedHoleStats`, `currentHoleIndex`, `inProgressShots`, `selectedQualifierId`, and `selectedRoundNumber` from the draft -- but not `holesPerRound`. This means a 9-hole round that is resumed will default to `holesPerRound = 18`, which could cause issues if the player navigates back to setup or if any logic depends on this value.

**Root cause:** `holesPerRound` was not included in `RoundDraftData` when the draft system was built, so it is neither saved to the draft nor restored from it.

**Fix:** Two changes needed:
1. Add `holesPerRound` to the `RoundDraftData` interface.
2. Save `holesPerRound` in the draft data (already partially done via the `useEffect` auto-save, but the `handleAutoSave` path also needs it).
3. Restore `holesPerRound` in `handleResumeDraft`.

### Step 1: Update `RoundDraftData` interface

**File:** `src/hooks/golf/use-auto-save-round.ts`

#### Old code (lines 21-31):
```typescript
export interface RoundDraftData {
  step: 'setup' | 'holes' | 'tracking' | 'submitting';
  setupData: RoundSetupForm;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  currentHoleIndex: number;
  selectedQualifierId?: string | null;
  selectedRoundNumber?: number | null;
  /** In-progress shots keyed by hole index, so mid-hole data survives tab kills */
  inProgressShots?: Record<number, ShotRecord[]>;
}
```

#### New code:
```typescript
export interface RoundDraftData {
  step: 'setup' | 'holes' | 'tracking' | 'submitting';
  setupData: RoundSetupForm;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  currentHoleIndex: number;
  selectedQualifierId?: string | null;
  selectedRoundNumber?: number | null;
  /** In-progress shots keyed by hole index, so mid-hole data survives tab kills */
  inProgressShots?: Record<number, ShotRecord[]>;
  /** Number of holes in the round (9 or 18). Defaults to 18 if not present (backwards compat). */
  holesPerRound?: 9 | 18;
}
```

### Step 2: Include `holesPerRound` in the auto-save `useEffect` draft data

**File:** `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx`

#### Old code (lines 426-436):
```typescript
    const draftData: RoundDraftData = {
      step,
      setupData,
      holes,
      completedHoleStats,
      currentHoleIndex,
      selectedQualifierId,
      selectedRoundNumber,
      inProgressShots: inProgressShotsByHole,
    };
    scheduleSave(draftData);
```

#### New code:
```typescript
    const draftData: RoundDraftData = {
      step,
      setupData,
      holes,
      completedHoleStats,
      currentHoleIndex,
      selectedQualifierId,
      selectedRoundNumber,
      inProgressShots: inProgressShotsByHole,
      holesPerRound,
    };
    scheduleSave(draftData);
```

Also add `holesPerRound` to the `useEffect` dependency array:

#### Old code (line 437):
```typescript
  }, [step, setupData, holes, completedHoleStats, currentHoleIndex, selectedQualifierId, selectedRoundNumber, inProgressShotsByHole, scheduleSave, isCheckingForDraft]);
```

#### New code:
```typescript
  }, [step, setupData, holes, completedHoleStats, currentHoleIndex, selectedQualifierId, selectedRoundNumber, inProgressShotsByHole, holesPerRound, scheduleSave, isCheckingForDraft]);
```

### Step 3: Include `holesPerRound` in `handleAutoSave` draft data

#### Old code (lines 674-684):
```typescript
    const draftDataForDb: RoundDraftData = {
      step,
      setupData,
      holes,
      completedHoleStats,
      currentHoleIndex: holeIndex,
      selectedQualifierId,
      selectedRoundNumber,
      inProgressShots: { ...inProgressShotsByHole, [holeIndex]: shots },
    };
```

#### New code:
```typescript
    const draftDataForDb: RoundDraftData = {
      step,
      setupData,
      holes,
      completedHoleStats,
      currentHoleIndex: holeIndex,
      selectedQualifierId,
      selectedRoundNumber,
      inProgressShots: { ...inProgressShotsByHole, [holeIndex]: shots },
      holesPerRound,
    };
```

### Step 4: Restore `holesPerRound` in `handleResumeDraft`

#### Old code (lines 377-385):
```typescript
        // Restore in-progress shots so distance-to-hole resumes correctly
        if (draftData.inProgressShots) {
          setInProgressShotsByHole(draftData.inProgressShots);
        }
        if (draftData.selectedQualifierId) {
          setSelectedQualifierId(draftData.selectedQualifierId);
        }
        if (draftData.selectedRoundNumber) {
          setSelectedRoundNumber(draftData.selectedRoundNumber);
        }
```

#### New code:
```typescript
        // Restore in-progress shots so distance-to-hole resumes correctly
        if (draftData.inProgressShots) {
          setInProgressShotsByHole(draftData.inProgressShots);
        }
        if (draftData.holesPerRound) {
          setHolesPerRound(draftData.holesPerRound);
        }
        if (draftData.selectedQualifierId) {
          setSelectedQualifierId(draftData.selectedQualifierId);
        }
        if (draftData.selectedRoundNumber) {
          setSelectedRoundNumber(draftData.selectedRoundNumber);
        }
```

**Why:** The `holesPerRound` field is made optional with a comment about backwards compatibility, so existing drafts without this field will continue to work (defaulting to 18 as before). New drafts will include it and restore correctly on resume.

---

## Bug 5 (P1 #15): `handleSaveShot` appends duplicate shots

**Problem:** On line 645, `handleSaveShot` unconditionally appends the shot to the `inProgressShotsByHole` array:
```typescript
return { ...prev, [currentHoleIndex]: [...existing, shot] };
```
When a player navigates back to an uncompleted hole (via the scorecard), `handleSaveShot` is called again for each shot entry. If the component re-initializes with `initialShots` containing the existing shots AND the player re-enters a shot with the same `shotNumber`, a duplicate is appended.

**Root cause:** No deduplication check on `shot.shotNumber` before appending.

**Fix:** Check whether a shot with the same `shotNumber` already exists in the array. If it does, replace it instead of appending.

**Lines:** 645-654

### Old code (lines 645-654):
```typescript
  const handleSaveShot = (shot: ShotRecord) => {
    if (completedHoleStats[currentHoleIndex]) {
      return;
    }

    setInProgressShotsByHole((prev) => {
      const existing = prev[currentHoleIndex] ?? [];
      return { ...prev, [currentHoleIndex]: [...existing, shot] };
    });
  };
```

### New code:
```typescript
  const handleSaveShot = (shot: ShotRecord) => {
    if (completedHoleStats[currentHoleIndex]) {
      return;
    }

    setInProgressShotsByHole((prev) => {
      const existing = prev[currentHoleIndex] ?? [];
      // Prevent duplicate shots when navigating back to an uncompleted hole
      const duplicateIndex = existing.findIndex(s => s.shotNumber === shot.shotNumber);
      if (duplicateIndex >= 0) {
        const updated = [...existing];
        updated[duplicateIndex] = shot;
        return { ...prev, [currentHoleIndex]: updated };
      }
      return { ...prev, [currentHoleIndex]: [...existing, shot] };
    });
  };
```

**Why:** Each shot on a hole has a unique `shotNumber` (1, 2, 3, ...). By checking for an existing shot with the same `shotNumber`, we either replace it (if re-entering/editing) or append it (if it is genuinely new). This prevents the array from growing with duplicate entries while still allowing legitimate shot updates.

---

## Summary of All Changes

| Bug | Priority | Files Changed | Nature of Fix |
|-----|----------|---------------|---------------|
| #1 (P0) | Critical | `new-round-client.tsx` | Pass explicit params to `buildPartialRoundData` in server save IIFE |
| #4 (P0) | Critical | `new-round-client.tsx` | Spread `inProgressShotsByHole` when building draft data |
| #11 (P1) | High | `new-round-client.tsx` | Replace drop-on-conflict mutex with "latest wins" pending queue |
| #14 (P1) | High | `use-auto-save-round.ts`, `new-round-client.tsx` | Add `holesPerRound` to draft data type, save it, restore it |
| #15 (P1) | High | `new-round-client.tsx` | Dedup by `shotNumber` before appending to in-progress shots |

### Dependency Order

These fixes should be applied in the following order:

1. **Bug #14 Step 1** first (type change in `use-auto-save-round.ts`) -- other changes depend on the updated type.
2. **Bug #15** (independent, can be applied anytime).
3. **Bugs #1, #2, #3, #14 Steps 2-4** together -- these all modify `handleAutoSave` and related code in `new-round-client.tsx`. Bug #3's rewrite of the IIFE already incorporates Bug #1's fix.

### Risk Assessment

- **Low risk:** All fixes are surgical and scoped to the auto-save and shot-saving paths. No changes to submission logic, stats calculation, or UI rendering.
- **Backwards compatible:** The `holesPerRound` field is optional in `RoundDraftData`, so existing drafts in the database will continue to load correctly.
- **No new dependencies:** No new imports, hooks, or external packages required.
- **Testable:** Each fix can be verified by: (1) entering shots on multiple holes, navigating between them, and checking that all in-progress shots survive auto-save; (2) resuming a 9-hole draft and verifying `holesPerRound` is 9; (3) navigating back to a hole and entering a shot without creating duplicates.
