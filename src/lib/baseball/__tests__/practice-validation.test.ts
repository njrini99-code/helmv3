// =============================================================================
// src/lib/baseball/__tests__/practice-validation.test.ts
//
// Direct unit coverage for validatePracticeForPublish — the PURE, framework-
// free publish gate that both the client TimeRailBuilder and the server-side
// publishPractice action (practice.ts:415) call. Before this file there was
// zero direct test coverage for this validator anywhere in the repo (only
// exercised indirectly through UI components), even though it is the single
// source of truth for every PracticeValidationIssue code the coach sees.
//
// Every ValidatableBlock below is intentionally minimal — only the fields the
// assertion under test cares about are varied; everything else uses a
// reasonable non-triggering default so each test isolates ONE issue code.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  validatePracticeForPublish,
  type ValidatableBlock,
} from '@/lib/baseball/practice-validation';

/** A single, non-overlapping, fully-valid block — the "nothing wrong" baseline. */
function validBlock(overrides: Partial<ValidatableBlock> = {}): ValidatableBlock {
  return {
    startOffsetMin: 0,
    durationMin: 15,
    activity: 'Warmup',
    coachOwnerId: 'coach-1',
    isMeasured: false,
    measurementTarget: null,
    ...overrides,
  };
}

describe('validatePracticeForPublish — baseline', () => {
  it('a single well-formed block passes with no errors or warnings', () => {
    const result = validatePracticeForPublish([validBlock()]);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('validatePracticeForPublish — no_blocks', () => {
  it('an empty block list is a hard error and short-circuits (no other checks run)', () => {
    const result = validatePracticeForPublish([]);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      { code: 'no_blocks', message: 'Add at least one block before publishing.' },
    ]);
    expect(result.warnings).toEqual([]);
  });
});

describe('validatePracticeForPublish — zero_duration', () => {
  it('flags a block with durationMin <= 0 as a hard error, not a warning', () => {
    const result = validatePracticeForPublish([validBlock({ durationMin: 0 })]);
    expect(result.ok).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('zero_duration');
  });

  it('a negative duration is also a zero_duration error', () => {
    const result = validatePracticeForPublish([validBlock({ durationMin: -5 })]);
    expect(result.errors.some((e) => e.code === 'zero_duration')).toBe(true);
  });
});

describe('validatePracticeForPublish — missing_headline', () => {
  it('flags a block whose activity is blank/whitespace-only as a hard error', () => {
    const result = validatePracticeForPublish([validBlock({ activity: '   ' })]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'missing_headline')).toBe(true);
  });
});

describe('validatePracticeForPublish — overlap', () => {
  it('flags two blocks that occupy the same minutes on the time rail as a hard error', () => {
    const result = validatePracticeForPublish([
      validBlock({ startOffsetMin: 0, durationMin: 20, coachOwnerId: 'coach-1' }),
      validBlock({ startOffsetMin: 10, durationMin: 20, coachOwnerId: 'coach-2' }),
    ]);
    expect(result.ok).toBe(false);
    const overlap = result.errors.find((e) => e.code === 'overlap');
    expect(overlap).toBeDefined();
    expect(overlap!.blockKeys).toHaveLength(2);
  });

  it('back-to-back blocks (end === next start) do NOT overlap', () => {
    const result = validatePracticeForPublish([
      validBlock({ startOffsetMin: 0, durationMin: 20 }),
      validBlock({ startOffsetMin: 20, durationMin: 20 }),
    ]);
    expect(result.errors.some((e) => e.code === 'overlap')).toBe(false);
  });
});

describe('validatePracticeForPublish — unassigned_owner', () => {
  it('flags a block with no coachOwnerId as a warning, not a blocking error', () => {
    const result = validatePracticeForPublish([validBlock({ coachOwnerId: null })]);
    expect(result.ok).toBe(true); // warning-only, publish is not blocked
    expect(result.warnings.some((w) => w.code === 'unassigned_owner')).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('validatePracticeForPublish — owner_conflict', () => {
  it('flags the SAME staff owner assigned to two time-overlapping blocks as a warning', () => {
    const result = validatePracticeForPublish([
      validBlock({ startOffsetMin: 0, durationMin: 30, coachOwnerId: 'coach-1' }),
      validBlock({ startOffsetMin: 15, durationMin: 30, coachOwnerId: 'coach-1' }),
    ]);
    // Two overlapping blocks also trip the hard `overlap` error; owner_conflict
    // is the ADDITIONAL, distinct warning this test is isolating.
    expect(result.warnings.some((w) => w.code === 'owner_conflict')).toBe(true);
  });

  it('does NOT flag owner_conflict when two DIFFERENT staff own overlapping blocks', () => {
    const result = validatePracticeForPublish([
      validBlock({ startOffsetMin: 0, durationMin: 30, coachOwnerId: 'coach-1' }),
      validBlock({ startOffsetMin: 15, durationMin: 30, coachOwnerId: 'coach-2' }),
    ]);
    expect(result.warnings.some((w) => w.code === 'owner_conflict')).toBe(false);
  });

  it('does NOT flag owner_conflict when the same staff owns two NON-overlapping blocks', () => {
    const result = validatePracticeForPublish([
      validBlock({ startOffsetMin: 0, durationMin: 15, coachOwnerId: 'coach-1' }),
      validBlock({ startOffsetMin: 15, durationMin: 15, coachOwnerId: 'coach-1' }),
    ]);
    expect(result.warnings.some((w) => w.code === 'owner_conflict')).toBe(false);
  });
});

describe('validatePracticeForPublish — measured_without_target', () => {
  it('flags a measured station with no measurement target as a warning', () => {
    const result = validatePracticeForPublish([
      validBlock({ isMeasured: true, measurementTarget: null }),
    ]);
    expect(result.ok).toBe(true); // warning-only
    expect(result.warnings.some((w) => w.code === 'measured_without_target')).toBe(true);
  });

  it('does NOT flag a measured station once a measurement target is set', () => {
    const result = validatePracticeForPublish([
      validBlock({ isMeasured: true, measurementTarget: 'exit_velocity' }),
    ]);
    expect(result.warnings.some((w) => w.code === 'measured_without_target')).toBe(false);
  });

  it('does NOT flag an unmeasured station for missing a target', () => {
    const result = validatePracticeForPublish([
      validBlock({ isMeasured: false, measurementTarget: null }),
    ]);
    expect(result.warnings.some((w) => w.code === 'measured_without_target')).toBe(false);
  });
});

describe('validatePracticeForPublish — distinctness of errors vs warnings', () => {
  it('a publish-blocking error set and a warning-only set are never conflated: ok tracks errors only', () => {
    // unassigned_owner (warning) + owner_conflict (warning) + measured_without_target
    // (warning) all present, but zero hard errors -> ok must still be true.
    const result = validatePracticeForPublish([
      validBlock({ startOffsetMin: 0, durationMin: 15, coachOwnerId: null, isMeasured: true, measurementTarget: null }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.ok).toBe(true);
  });
});
