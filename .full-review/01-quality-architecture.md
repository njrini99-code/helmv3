# Phase 1: Code Quality & Architecture Review

**Date**: 2026-03-04
**Scope**: Full working tree (~39 files, ~2,170 insertions, ~1,429 deletions)

## Executive Summary

The working tree represents a substantial refactor of the shot tracking system with excellent architectural direction: extraction of a reducer-based state machine, custom hooks, centralized types, atomic database saves, and hardened Zod validation. However, there are 3 critical issues (1 security, 2 data integrity), 6 high-priority issues, and numerous medium/low items that should be addressed.

| Severity | Code Quality | Architecture | Combined |
|----------|-------------|--------------|----------|
| Critical | 2 | 1 | 3 |
| High | 3 | 3 | 6 |
| Medium | 7 | 5 | 12 |
| Low | 4 | 5 | 9 |

---

## Critical Findings

### CQ-1. `save_partial_round_atomic` RPC trusts client-supplied `player_id` — Authorization Bypass

**Source**: Architecture Review
**File**: `supabase/migrations/20260304000001_atomic_partial_round_save.sql` (lines 28-35)

The RPC is `SECURITY DEFINER` (bypasses RLS), granted to all `authenticated` users, and extracts `player_id` from the client-supplied JSONB payload:

```sql
v_player_id := (p_round_data->>'player_id')::UUID;
```

Any authenticated user can call this via PostgREST and supply another player's `player_id`/`round_id` to overwrite their round data. The application-layer auth check in `golf.ts` is insufficient because the RPC is directly callable.

**Fix**: Replace client-supplied `player_id` with `auth.uid()` lookup:
```sql
SELECT gp.id INTO v_player_id FROM golf_players gp WHERE gp.user_id = auth.uid();
IF v_player_id IS NULL THEN
  RETURN jsonb_build_object('success', false, 'error', 'Player profile not found');
END IF;
```

---

### CQ-2. Stale Closures in `useUndoManager` and `useEditShotModal` — Data Loss on Rapid Operations

**Source**: Both Reviews (convergent finding)
**Files**:
- `src/hooks/golf/use-undo-manager.ts` (lines 25-58)
- `src/hooks/golf/use-edit-shot-modal.ts` (lines 51-180, 182-217)

Both hooks accept the full `state` object and reference `state.shotHistory` in async `useCallback` closures. When the async body begins executing (after `await updateShot(...)` or `await deleteShot(...)`), it holds a stale snapshot of state. Rapid operations (double-tap undo, quick edit-save) can corrupt shot data by operating on outdated history.

**Fix**: Use refs for latest state in async callbacks (pattern already established in `use-shot-state-machine.ts` lines 502-507):
```typescript
const stateRef = useRef(state);
stateRef.current = state;
const handleUndoLastShot = useCallback(async () => {
  const currentState = stateRef.current;
  // ... use currentState throughout
}, [dispatch, /* stable deps only */]);
```

---

### CQ-3. `UNDO_COMPLETE` / `DELETE_COMPLETE` Reducer Uses Wrong Distance for Reset

**Source**: Code Quality Review
**File**: `src/hooks/golf/use-shot-state-machine.ts` (UNDO_COMPLETE and DELETE_COMPLETE cases)

When undoing/deleting all shots on a hole, the reducer restores `distanceToHole` from `state.distanceToHole` (the *current* shot position) rather than the original hole yardage. This leaves the player at an incorrect distance for the first shot re-entry.

**Fix**: Use the hole's original yardage when shot history is empty:
```typescript
distanceToHole: action.payload.previousShot
  ? action.payload.previousShot.distanceAfter
  : state.holes[state.currentHoleIndex].yardage,
```

---

## High Findings

### H-1. Dual Save-Path Architecture Creates Data Divergence Risk

**Source**: Architecture Review
**Files**: `src/app/golf/actions/golf.ts` (`savePartialRound`), `src/app/golf/actions/round-drafts.ts` (`saveRoundDraft`)

Two distinct save mechanisms exist:
1. `savePartialRound` — normalizes into relational tables (`golf_holes`, `golf_shots`), uses atomic RPC
2. `saveRoundDraft` — stores entire client state as JSONB blob in `golf_rounds.draft_data`

A round saved by one path cannot be reliably loaded by the other. If a user starts a round (draft path) then navigates to "continue round" (relational path), data may not be found.

**Fix**: Converge on the atomic RPC approach. Use JSONB draft as a lightweight local cache only, or add cross-path detection logic.

---

### H-2. `calculateHoleStats` Defined in Component Body, Passed as Unstable Prop

**Source**: Architecture Review
**File**: `src/components/golf/ShotTrackingComprehensive.tsx` (lines 107-272)

This 165-line pure function is defined inside the component body (not memoized) and passed to 3 hooks (`usePenaltyHandler`, `useEditShotModal`, `useUndoManager`). It recreates on every render, forcing all hooks' `useCallback` instances to also recreate — defeating memoization.

**Fix**: Move to `src/lib/utils/shot-helpers.ts` and import directly in each hook. It's a pure function of `(shots, hole) → HoleStats` with no component dependencies.

---

### H-3. `comprehensiveHoleSchema` Removed `.passthrough()` Without Type Coupling

**Source**: Architecture Review
**File**: `src/app/golf/actions/golf.ts` (line ~367)

Removing `.passthrough()` is a positive validation improvement, but any future field added to `HoleStats` in `src/lib/types/golf.ts` will be silently stripped by Zod unless also added to the schema. No compile-time enforcement exists.

**Fix**: Add a comment linking the schema to the type, and add a unit test that verifies the schema accepts all `HoleStats` fields without stripping.

---

### H-4. Fire-and-Forget Cascade Update in Edit Modal

**Source**: Both Reviews
**File**: `src/hooks/golf/use-edit-shot-modal.ts` (lines 155-161)

When editing a shot's distance-after, the next shot's distance-before is updated via fire-and-forget DB call. If it fails, local state is correct but DB is inconsistent. The next auto-save may or may not reconcile.

**Fix**: Await the cascade and trigger auto-save on failure:
```typescript
const cascadeResult = await updateShot(nextShot.id, { distance_to_hole_before: newAfter, distance_unit_before: newAfterUnit });
if (!cascadeResult.success) onAutoSave?.(updatedHistory, currentHoleIndex);
```

---

### H-5. `partialRoundSchema` Uses `z.array(z.any())` for Holes

**Source**: Code Quality Review
**File**: `src/app/golf/actions/golf.ts` (line ~424)

```typescript
holes: z.array(z.any()).max(18),
```

This bypasses all hole data validation at the server action boundary, allowing arbitrary data through.

**Fix**: Use a union type: `z.array(z.union([comprehensiveHoleSchema, z.null()])).max(18)`

---

### H-6. `round-drafts.ts` Lacks Input Validation

**Source**: Architecture Review
**File**: `src/app/golf/actions/round-drafts.ts`

`saveRoundDraft`, `clearRoundDraft`, and `convertDraftToRound` accept parameters without Zod validation, contrasting with the improved validation in `golf.ts`.

**Fix**: Add Zod validation matching the pattern in `golf.ts` (UUID validation, draft data schema).

---

## Medium Findings

| # | Finding | File(s) |
|---|---------|---------|
| M-1 | Webhook stores full `raw_payload` without size limits | `src/app/api/webhooks/resend/route.ts` |
| M-2 | Multiple `as any` type escapes for untyped Supabase RPC calls | `golf.ts`, `CRMDashboard.tsx` |
| M-3 | Component still 1,948 lines after refactor (rendering logic not extracted) | `ShotTrackingComprehensive.tsx` |
| M-4 | Migration JSON cast `notes::JSONB` may abort on invalid JSON | `20260304000002_add_draft_data_column.sql` |
| M-5 | Fire-and-forget server saves with no user error feedback | `continue-round-client.tsx` |
| M-6 | `void (5000)` dead code in auto-save hook | `use-auto-save-round.ts` |
| M-7 | No maximum shot count UI guard (Zod enforces 15 but UI doesn't) | `ShotTrackingComprehensive.tsx` |
| M-8 | GIR calculation inconsistency between client (`findIndex`) and server | `ShotTrackingComprehensive.tsx`, `golf.ts` |
| M-9 | `requestAnimationFrame` used for concurrency guard release (fragile) | `use-shot-state-machine.ts` |
| M-10 | Duplicated auto-save fingerprint JSON serialization | Multiple files |
| M-11 | Missing email format validation in CRM send-email route | `send-email/route.ts` |
| M-12 | `console.error`/`console.warn` in hooks instead of structured logging | `use-undo-manager.ts`, `use-edit-shot-modal.ts` |

---

## Low Findings

| # | Finding | File(s) |
|---|---------|---------|
| L-1 | Dead type re-exports from `ShotTrackingComprehensive` | `ShotTrackingComprehensive.tsx` |
| L-2 | `type Hole = RoundHole` alias duplicated in 7 files | Multiple |
| L-3 | No tests for 4 extracted hooks (617 lines of reducer logic untested) | `use-shot-state-machine.ts` et al |
| L-4 | `RoundDraftData` interface duplicated between server action and hook | `round-drafts.ts`, `use-auto-save-round.ts` |
| L-5 | Inline SVG icons repeated throughout component | `ShotTrackingComprehensive.tsx` |
| L-6 | `parseInt` without radix parameter | Multiple |
| L-7 | Incomplete accessibility (no aria-pressed, no role=radiogroup) | `ShotTrackingComprehensive.tsx` |
| L-8 | `editFormData` duplicates ShotRecord fields with string types | `use-edit-shot-modal.ts` |
| L-9 | Penalty shot doesn't advance distance for water/unplayable lies | `use-penalty-handler.ts` |

---

## Positive Observations

1. **Type centralization**: `ShotRecord`, `HoleStats`, `RoundHole` moved to `@/lib/types/golf.ts` — eliminates importing types from UI component
2. **State machine extraction**: `useShotStateMachine` with `useReducer`, 30+ typed action types, discriminated unions — massive improvement over scattered `useState`
3. **Atomic RPC**: `save_partial_round_atomic` wraps delete+insert in a single transaction, preventing data loss from crashes between operations
4. **Zod schema hardening**: Removed `.passthrough()`, added UUID validation, exported schemas for testing
5. **Test additions**: `shot-helpers.test.ts` and `golf-schemas.test.ts` cover extracted utilities and validation
6. **CRM email tracking**: Well-designed webhook with Svix verification, idempotent upserts, admin-only RLS
7. **Calendar fix**: `||` to `??` change correctly allows clearing optional fields
8. **Utility extraction**: `shot-helpers.ts` centralizes previously duplicated functions

---

## Critical Issues for Phase 2 Context

1. **SECURITY**: RPC authorization bypass allows any authenticated user to overwrite another player's round data
2. **DATA INTEGRITY**: Stale closures in async hooks can corrupt shot data on rapid operations
3. **DATA INTEGRITY**: Reducer distance reset bug after undo/delete all shots
4. **VALIDATION GAP**: `z.any()` in partial round schema allows arbitrary hole data through
5. **NO VALIDATION**: round-drafts.ts accepts unvalidated inputs
6. **SILENT FAILURES**: Fire-and-forget cascade updates and server saves with no user feedback
