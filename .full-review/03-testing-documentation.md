# Phase 3: Testing & Documentation Review

**Date**: 2026-03-04
**Scope**: Full working tree (~39 files, ~2,170 insertions, ~1,429 deletions)

## Executive Summary

Test coverage for the working tree changes is approximately **8-10%** — only 2 test files exist (36 test cases) covering Zod schemas and 2 utility functions. The most critical business logic (617-line state machine reducer, async edit/undo hooks, server action authorization, SECURITY DEFINER RPC) has **zero test coverage**. Documentation is significantly stale — the memory context files, CLAUDE.md, and feature references have not been updated to reflect the hook extraction, new migrations, or architectural changes.

---

## Test Coverage Findings

### Critical (3)

#### T-1. State Machine Reducer Untested — 617 Lines of Critical Business Logic

**File**: `src/hooks/golf/use-shot-state-machine.ts`

Pure `useReducer` with 27+ action types and complex state transitions. The reducer, `computeInitialState`, and `computeRestoredState` are pure functions testable without React. Key untested risks:
- `UNDO_COMPLETE` restores wrong distance when history is empty (uses stale `distanceToHole` instead of hole yardage)
- `HANDLE_RESULT_SELECT` has complex clearing rules for miss-direction fields
- `CONFIRM_PENALTY` increments `currentShot` differently than `RECORD_SHOT`
- `computeInitialState` parses string distances from DB via `parseFloat` type-cast

**Recommended**: ~40 unit test cases covering all action types, empty-history edge cases, string parsing, and penalty asymmetry.

---

#### T-2. `calculateShotDistanceWithDirection` Untested — Critical for Data Accuracy

**File**: `src/lib/utils/shot-helpers.ts`, lines 73-97

Directional distance math with 0.7 diagonal factor. Used by edit modal for every shot edit. Zero test coverage despite being a pure function.

**Recommended**: ~10 test cases covering all 6 directions, zero distance, negative clamping, null direction.

---

#### T-3. `z.any()` Schema Gap Not Tested

**File**: `src/app/golf/actions/__tests__/golf-schemas.test.ts`

Existing schema tests pass `holes: []` for `partialRoundSchema` but never test that arbitrary/malicious objects pass through the `z.any()` hole. Should document the gap with a failing test.

---

### High (5)

| # | Finding | File | Recommendation |
|---|---------|------|----------------|
| T-4 | `lieFromShotResult` untested — penalty fallback has complex logic | `shot-helpers.ts` | ~7 test cases |
| T-5 | Edit modal cascade failure path untested | `use-edit-shot-modal.ts` | Integration test with mocked `updateShot` |
| T-6 | Undo + penalty handler guards untested | `use-undo-manager.ts`, `use-penalty-handler.ts` | ~6 test cases |
| T-7 | `round-drafts.ts` — 5 exports, zero validation, zero tests | `round-drafts.ts` | Auth rejection + draft lifecycle tests |
| T-8 | RPC authorization bypass — no security test | migration `000001` | Test that direct RPC with wrong player_id fails |

### Medium (4)

| # | Finding |
|---|---------|
| T-9 | `computeShotFingerprint` untested — auto-save dedup depends on it |
| T-10 | Webhook handler untested — signature verification, error paths |
| T-11 | Auto-save race conditions — no concurrency test for dual save triggers |
| T-12 | No component tests for 1,948-line ShotTrackingComprehensive |

### Low (3)

| # | Finding |
|---|---------|
| T-13 | No test factories for `ShotRecord`, `RoundHole`, `ShotTrackingState` |
| T-14 | Schema rejection tests don't assert specific error messages |
| T-15 | No coverage thresholds enforced in test config |

### Existing Test Quality

**Strengths**: Behavior-focused, good boundary condition coverage for schemas, tests both accept and reject cases.

**Weaknesses**: Binary pass/fail assertions (no error message verification), no mock factories, no server action testing pattern established.

### Test Pyramid

| Layer | Count | Assessment |
|-------|-------|------------|
| Unit (pure functions, schemas) | 36 cases / 2 files | Very narrow scope |
| Integration (hook + server action) | 0 | **None** |
| Component (React rendering) | 0 | **None** |
| E2E | 0 (in working tree) | **None** |
| Security | 0 | **None** |

---

## Documentation Findings

### Critical (4)

#### D-1. Hook Extraction Not Reflected in Any Context File

The 4 new hooks (`use-shot-state-machine`, `use-edit-shot-modal`, `use-undo-manager`, `use-penalty-handler`) are not in:
- `memory/projects/golfhelm.md` (says "12 hooks")
- `CLAUDE.md` (says "12 hooks")
- `memory/context/golfhelm-features.md` Feature #1

A developer consulting these files gets a stale monolithic-component mental model.

---

#### D-2. Shot State Machine Has No State/Transition Documentation

`use-shot-state-machine.ts` implements 27 action types and 22 state fields with no file-level JSDoc, no state diagram, and no explanation of clearing rules in `HANDLE_RESULT_SELECT`.

---

#### D-3. Dual Save-Path Architecture Undocumented

Two distinct save mechanisms (JSONB draft vs relational atomic RPC) exist with no documentation of which owns which lifecycle, how they converge, or why both exist.

---

#### D-4. New Developer Cannot Understand Shot Tracking from Docs

The gap between documentation (monolithic component) and code (hook-based decomposition) would cause significant confusion during onboarding.

---

### High (7)

| # | Finding | Location |
|---|---------|----------|
| D-5 | `RoundDraftData` duplicated, no documented canonical location | `round-drafts.ts` + `use-auto-save-round.ts` |
| D-6 | New tables/columns not in database reference | `memory/context/golfhelm-database.md`, `memory/glossary.md` |
| D-7 | Webhook handler route not documented | Missing from `projects/golfhelm.md` |
| D-8 | `createAdminClient` pattern not in CLAUDE.md | `@/lib/supabase/admin` |
| D-9 | Hook count stale (12 -> 16+) | CLAUDE.md, golfhelm.md |
| D-10 | "Draft in notes" gap resolved but not marked | `golfhelm-features.md` |
| D-11 | Atomic RPC missing `putt_miss_tags`, `approach_miss_direction`, `approach_miss_lie_type` columns in INSERT — possible data loss bug | migration `000001` |

### Medium (5)

| # | Finding |
|---|---------|
| D-12 | Round Tracking data flow description stale in feature context |
| D-13 | Draft migration lacks rollback documentation |
| D-14 | Atomic RPC missing column-level documentation |
| D-15 | CRM send-email API route not documented |
| D-16 | `shot-helpers.ts` not referenced in feature context |

### Low (5)

| # | Finding |
|---|---------|
| D-17 | `computeShotFingerprint` auto-save connection implicit |
| D-18 | `deriveLieAfter` vs `deriveLieAfterFromResult` usage guidance missing |
| D-19 | Service role key not labeled as webhook runtime dependency |
| D-20 | `svix` dependency purpose undocumented |
| D-21 | No testing section in CLAUDE.md |

### Positive Documentation
- CRM email tracking migration has excellent inline comments
- `.env.example` properly documents new RESEND variables
- `shot-helpers.ts` functions have good JSDoc
