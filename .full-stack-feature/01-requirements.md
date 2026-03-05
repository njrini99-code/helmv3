# Requirements: Bulletproof Shot Tracking & Stats Tests

## Problem Statement
The golf app's shot tracking and stats calculation pipeline has 283 Vitest tests across 4 files, but coverage needs to be bulletproof with comprehensive edge cases and mutation-style testing to catch any logic bugs.

## Acceptance Criteria
- [ ] All boundary conditions tested for every bucketing/classification function
- [ ] Null/undefined/malformed data handling tested for all public functions
- [ ] State machine reducer tested with invalid/unexpected action sequences
- [ ] Stats aggregation tested with degenerate inputs (0 holes, 1 hole, mixed round types)
- [ ] Strokes gained calculations verified against known PGA benchmarks
- [ ] Hole stats edge cases: all-penalties hole, no-putt hole-outs, 10+ strokes
- [ ] calculateShotDistanceWithDirection tested with 0/0 inputs, very large values
- [ ] computeShotFingerprint tested with identical-but-reordered shots
- [ ] All existing tests still pass after additions
- [ ] TypeScript compiles with zero errors

## Scope
### In Scope
- Edge case tests for all 4 test files
- Mutation-style testing (every input combination for key functions)
- Boundary value analysis for bucketing functions
- Degenerate input testing (empty, null, extreme values)

### Out of Scope
- Server action tests (require Supabase mocks)
- E2E/integration tests
- Component rendering tests
- Performance benchmarking

## Existing Test Files
1. `src/lib/utils/__tests__/shot-helpers.test.ts` — 49 tests
2. `src/lib/utils/__tests__/golf-stats-calculator-shots.test.ts` — 144 tests
3. `src/hooks/golf/__tests__/use-shot-state-machine.test.ts` — 48 tests
4. `src/components/golf/__tests__/calculate-hole-stats.test.ts` — 42 tests
5. `src/test/fixtures/golf-shots.ts` — shared fixtures

## Key Source Files Under Test
- `src/lib/utils/shot-helpers.ts` — distance calc, lie derivation, fingerprinting
- `src/lib/utils/golf-stats-calculator-shots.ts` — full stats pipeline
- `src/hooks/golf/use-shot-state-machine.ts` — shot tracking reducer
- `src/components/golf/ShotTrackingComprehensive.tsx` — client hole stats
