// =============================================================================
// src/lib/baseball/__tests__/exercise-conflict.test.ts
//
// Unit tests for the Wave 4 exercise conflict-score engine.
//
// Invariants tested:
//   - Empty soreness always produces level 'none' with score 0
//   - Non-overlapping regions produce no conflict
//   - Boundary cases for all three levels (none/caution/high)
//   - stressRegions carry higher weight than primaryBodyRegions (1.5× vs 0.75×)
//   - A region in both sets is counted once at stress weight (no double-count)
//   - Pitcher-sensitive amplification fires only when a throwing-arm region overlaps
//   - Amplification can push caution scores into high
//   - Warning language never contains 'injury' or 'must'
//   - Caution warnings contain 'worth reviewing' or 'associated with'
//   - High warnings contain 'consider' or 'soreness'
//   - affectedRegions lists only the regions that are both in the exercise AND sore
//   - affectedRegions deduplicates
//   - suggestSubstitutions: same category + movementPattern, lower score only
//   - suggestSubstitutions: excludes the input exercise itself
//   - suggestSubstitutions: sorted ascending by conflict score
//   - suggestSubstitutions: returns [] when library is empty
//   - suggestSubstitutions: strict less-than (equal score excluded)
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  scoreExerciseConflict,
  suggestSubstitutions,
  type BuilderExercise,
  type GroupSorenessFlag,
} from '@/lib/baseball/exercise-conflict';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeExercise(overrides: Partial<BuilderExercise> = {}): BuilderExercise {
  return {
    id: 'ex-default',
    name: 'Default Exercise',
    category: 'strength',
    movementPattern: 'push',
    primaryBodyRegions: [],
    secondaryBodyRegions: [],
    stressRegions: [],
    throwingArmStress: 'none',
    spineLoading: 'none',
    lowerBodyLoading: 'none',
    rotationalStress: 'none',
    gripStress: 'none',
    isPitcherSensitive: false,
    equipment: [],
    demoVideoUrl: null,
    ...overrides,
  };
}

function makeFlag(
  bodyRegion: string,
  count: number,
  maxSeverity: number,
): GroupSorenessFlag {
  return { bodyRegion, count, maxSeverity };
}

// ─── scoreExerciseConflict — empty soreness ───────────────────────────────────

describe('scoreExerciseConflict — empty soreness', () => {
  it('returns level none, score 0, no warnings when soreness list is empty', () => {
    const ex = makeExercise({ stressRegions: ['right_shoulder'] });
    const result = scoreExerciseConflict(ex, []);
    expect(result.level).toBe('none');
    expect(result.score).toBe(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.affectedRegions).toHaveLength(0);
  });

  it('returns level none when no sore region overlaps with the exercise at all', () => {
    const ex = makeExercise({ stressRegions: ['right_shoulder'] });
    // lower_back is sore but right_shoulder is the exercise's stress region
    const result = scoreExerciseConflict(ex, [makeFlag('lower_back', 5, 9)]);
    expect(result.level).toBe('none');
    expect(result.score).toBe(0);
    expect(result.affectedRegions).toHaveLength(0);
  });

  it('returns level none for an exercise with no body regions regardless of soreness', () => {
    const ex = makeExercise({
      stressRegions: [],
      primaryBodyRegions: [],
    });
    const result = scoreExerciseConflict(ex, [
      makeFlag('right_shoulder', 5, 9),
      makeFlag('left_quad', 3, 8),
    ]);
    expect(result.level).toBe('none');
    expect(result.score).toBe(0);
  });
});

// ─── scoreExerciseConflict — level thresholds (none / caution / high) ─────────

describe('scoreExerciseConflict — level boundaries', () => {
  it('stays below caution threshold (score < 2) with very mild single-player overlap', () => {
    // (1/10) × (1 + 1×0.3) × 1.5 = 0.1 × 1.3 × 1.5 = 0.195 → none
    const ex = makeExercise({ stressRegions: ['right_shoulder'] });
    const result = scoreExerciseConflict(ex, [makeFlag('right_shoulder', 1, 1)]);
    expect(result.level).toBe('none');
    expect(result.score).toBeLessThan(2);
  });

  it('reaches caution (score ≥ 2) with moderate soreness across a few players', () => {
    // (8/10) × (1 + 3×0.3) × 1.5 = 0.8 × 1.9 × 1.5 = 2.28 → caution
    const ex = makeExercise({ stressRegions: ['right_shoulder'] });
    const result = scoreExerciseConflict(ex, [makeFlag('right_shoulder', 3, 8)]);
    expect(result.level).toBe('caution');
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it('stays caution (score ≤ 5) with two stress regions at moderate severity + count', () => {
    // right_shoulder: 0.8 × 1.9 × 1.5 = 2.28
    // right_elbow:    0.6 × 1.6 × 1.5 = 1.44
    // sum = 3.72, no pitcher amp → caution
    const ex = makeExercise({
      stressRegions: ['right_shoulder', 'right_elbow'],
      isPitcherSensitive: false,
    });
    const result = scoreExerciseConflict(ex, [
      makeFlag('right_shoulder', 3, 8),
      makeFlag('right_elbow', 2, 6),
    ]);
    expect(result.level).toBe('caution');
    expect(result.score).toBeGreaterThan(2);
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it('reaches high (score > 5) with severe soreness across many players on two stress regions', () => {
    // left_quad:  (9/10) × (1 + 8×0.3) × 1.5 = 0.9 × 3.4 × 1.5 = 4.59
    // right_quad: (8/10) × (1 + 6×0.3) × 1.5 = 0.8 × 2.8 × 1.5 = 3.36
    // sum = 7.95 → high
    const ex = makeExercise({ stressRegions: ['left_quad', 'right_quad'] });
    const result = scoreExerciseConflict(ex, [
      makeFlag('left_quad', 8, 9),
      makeFlag('right_quad', 6, 8),
    ]);
    expect(result.level).toBe('high');
    expect(result.score).toBeGreaterThan(5);
  });

  it('score accumulates across multiple overlapping regions', () => {
    const ex = makeExercise({
      stressRegions: ['right_shoulder', 'right_elbow', 'lower_back'],
    });
    const singleRegion = makeExercise({ stressRegions: ['right_shoulder'] });
    const soreness = [makeFlag('right_shoulder', 3, 8)];

    const multi = scoreExerciseConflict(ex, soreness);
    const single = scoreExerciseConflict(singleRegion, soreness);
    // Same flags, but multi has more regions defined (only right_shoulder is sore)
    // → same score since lower_back + right_elbow are not in flags
    expect(multi.score).toBeCloseTo(single.score, 5);
  });
});

// ─── scoreExerciseConflict — pitcher-sensitive amplification ──────────────────

describe('scoreExerciseConflict — pitcher-sensitive amplification', () => {
  it('amplifies score ×1.6 when isPitcherSensitive AND a throwing-arm region overlaps', () => {
    // Without amp: (8/10) × (1 + 3×0.3) × 1.5 = 2.28
    // With amp:     2.28 × 1.6 = 3.648
    const ex = makeExercise({
      stressRegions: ['right_shoulder'],
      isPitcherSensitive: true,
    });
    const noAmpEx = makeExercise({
      stressRegions: ['right_shoulder'],
      isPitcherSensitive: false,
    });
    const soreness = [makeFlag('right_shoulder', 3, 8)];

    const withAmp = scoreExerciseConflict(ex, soreness);
    const withoutAmp = scoreExerciseConflict(noAmpEx, soreness);

    expect(withAmp.score).toBeGreaterThan(withoutAmp.score);
    expect(withAmp.score).toBeCloseTo(withoutAmp.score * 1.6, 1);
  });

  it('does NOT amplify when isPitcherSensitive but the sore region is not a throwing-arm region', () => {
    // lower_back is a spine_hip region, not throwing_arm
    const ex = makeExercise({
      stressRegions: ['lower_back'],
      isPitcherSensitive: true,
    });
    const noAmpEx = makeExercise({
      stressRegions: ['lower_back'],
      isPitcherSensitive: false,
    });
    const soreness = [makeFlag('lower_back', 3, 8)];

    const result1 = scoreExerciseConflict(ex, soreness);
    const result2 = scoreExerciseConflict(noAmpEx, soreness);
    expect(result1.score).toBeCloseTo(result2.score, 5);
  });

  it('does NOT amplify when throwing-arm region overlaps but isPitcherSensitive is false', () => {
    const ex = makeExercise({
      stressRegions: ['right_shoulder'],
      isPitcherSensitive: false,
    });
    const soreness = [makeFlag('right_shoulder', 5, 9)];
    const result = scoreExerciseConflict(ex, soreness);
    // (9/10) × (1 + 5×0.3) × 1.5 = 0.9 × 2.5 × 1.5 = 3.375, NOT amplified
    expect(result.score).toBeCloseTo(3.375, 1);
  });

  it('amplification can push a caution score into high territory', () => {
    // Without amp: 2.28 + 1.44 = 3.72 → caution
    // With pitcher amp: 3.72 × 1.6 = 5.952 → high
    const ex = makeExercise({
      stressRegions: ['right_shoulder', 'right_elbow'],
      isPitcherSensitive: true,
    });
    const noAmpEx = makeExercise({
      stressRegions: ['right_shoulder', 'right_elbow'],
      isPitcherSensitive: false,
    });
    const soreness = [
      makeFlag('right_shoulder', 3, 8),
      makeFlag('right_elbow', 2, 6),
    ];

    const withAmp = scoreExerciseConflict(ex, soreness);
    const withoutAmp = scoreExerciseConflict(noAmpEx, soreness);

    expect(withoutAmp.level).toBe('caution');
    expect(withAmp.level).toBe('high');
    expect(withAmp.score).toBeGreaterThan(5);
  });

  it('amplification also works via primaryBodyRegions (not only stressRegions)', () => {
    // right_shoulder in primaryBodyRegions (weight 0.75)
    // (8/10) × (1 + 3×0.3) × 0.75 = 0.8 × 1.9 × 0.75 = 1.14
    // With pitcher amp: 1.14 × 1.6 = 1.824 → still none (< 2) but higher than without
    const ex = makeExercise({
      stressRegions: [],
      primaryBodyRegions: ['right_shoulder'],
      isPitcherSensitive: true,
    });
    const noAmpEx = makeExercise({
      stressRegions: [],
      primaryBodyRegions: ['right_shoulder'],
      isPitcherSensitive: false,
    });
    const soreness = [makeFlag('right_shoulder', 3, 8)];

    const withAmp = scoreExerciseConflict(ex, soreness);
    const withoutAmp = scoreExerciseConflict(noAmpEx, soreness);

    expect(withAmp.score).toBeGreaterThan(withoutAmp.score);
    expect(withAmp.score).toBeCloseTo(1.14 * 1.6, 1);
  });

  it('adds pitcher-arm warning when amplification is triggered', () => {
    const ex = makeExercise({
      stressRegions: ['right_shoulder', 'right_elbow'],
      isPitcherSensitive: true,
    });
    const result = scoreExerciseConflict(ex, [
      makeFlag('right_shoulder', 3, 8),
      makeFlag('right_elbow', 2, 6),
    ]);
    expect(result.warnings.some((w) => w.includes('pitcher-sensitive'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('athletic trainer'))).toBe(true);
  });

  it('does not add pitcher-arm warning when no throwing-arm overlap (no amp triggered)', () => {
    const ex = makeExercise({
      stressRegions: ['lower_back'],
      isPitcherSensitive: true,
    });
    const result = scoreExerciseConflict(ex, [makeFlag('lower_back', 3, 8)]);
    expect(result.warnings.every((w) => !w.includes('pitcher-sensitive'))).toBe(true);
  });
});

// ─── scoreExerciseConflict — region weight hierarchy ─────────────────────────

describe('scoreExerciseConflict — stressRegions vs primaryBodyRegions weighting', () => {
  it('stressRegions weight (×1.5) is exactly 2× the primaryBodyRegions weight (×0.75)', () => {
    const soreness = [makeFlag('right_shoulder', 3, 8)];

    const exStress = makeExercise({ stressRegions: ['right_shoulder'] });
    const exPrimary = makeExercise({ primaryBodyRegions: ['right_shoulder'] });

    const stressResult = scoreExerciseConflict(exStress, soreness);
    const primaryResult = scoreExerciseConflict(exPrimary, soreness);

    expect(stressResult.score).toBeGreaterThan(primaryResult.score);
    expect(stressResult.score).toBeCloseTo(primaryResult.score * 2, 5);
  });

  it('a region in both stressRegions and primaryBodyRegions is counted once at stress weight', () => {
    const soreness = [makeFlag('right_shoulder', 3, 8)];

    // Both sets contain the region → should only apply stress weight, not double-count.
    const exBoth = makeExercise({
      stressRegions: ['right_shoulder'],
      primaryBodyRegions: ['right_shoulder'],
    });
    const exStressOnly = makeExercise({
      stressRegions: ['right_shoulder'],
    });

    const bothResult = scoreExerciseConflict(exBoth, soreness);
    const stressResult = scoreExerciseConflict(exStressOnly, soreness);

    expect(bothResult.score).toBeCloseTo(stressResult.score, 5);
  });
});

// ─── scoreExerciseConflict — warning language ─────────────────────────────────

describe('scoreExerciseConflict — warning language constraints', () => {
  it('warnings never contain the word "injury"', () => {
    const ex = makeExercise({
      stressRegions: ['right_shoulder', 'right_elbow'],
      isPitcherSensitive: true,
    });
    const result = scoreExerciseConflict(ex, [
      makeFlag('right_shoulder', 5, 9),
      makeFlag('right_elbow', 4, 8),
    ]);
    for (const w of result.warnings) {
      expect(w.toLowerCase()).not.toContain('injury');
    }
  });

  it('warnings never contain the word "must"', () => {
    const ex = makeExercise({ stressRegions: ['left_quad', 'right_quad'] });
    const result = scoreExerciseConflict(ex, [
      makeFlag('left_quad', 8, 9),
      makeFlag('right_quad', 6, 8),
    ]);
    for (const w of result.warnings) {
      expect(w.toLowerCase()).not.toContain('must');
    }
  });

  it('caution warnings contain "worth reviewing" or "associated with"', () => {
    const ex = makeExercise({ stressRegions: ['right_shoulder'] });
    const result = scoreExerciseConflict(ex, [makeFlag('right_shoulder', 3, 8)]);
    expect(result.level).toBe('caution');
    const allText = result.warnings.join(' ').toLowerCase();
    expect(allText).toMatch(/worth reviewing|associated with/);
  });

  it('high warnings contain "consider" or "soreness"', () => {
    const ex = makeExercise({ stressRegions: ['left_quad', 'right_quad'] });
    const result = scoreExerciseConflict(ex, [
      makeFlag('left_quad', 8, 9),
      makeFlag('right_quad', 6, 8),
    ]);
    expect(result.level).toBe('high');
    expect(result.warnings.length).toBeGreaterThan(0);
    const allText = result.warnings.join(' ').toLowerCase();
    expect(allText).toMatch(/consider|soreness/);
  });

  it('produces no warnings when level is none', () => {
    const ex = makeExercise({ stressRegions: ['right_shoulder'] });
    const result = scoreExerciseConflict(ex, [makeFlag('right_shoulder', 1, 1)]);
    expect(result.level).toBe('none');
    expect(result.warnings).toHaveLength(0);
  });

  it('caution warning includes the human-readable region name', () => {
    const ex = makeExercise({ stressRegions: ['right_shoulder'] });
    const result = scoreExerciseConflict(ex, [makeFlag('right_shoulder', 3, 8)]);
    const allText = result.warnings.join(' ');
    // Should convert snake_case to words
    expect(allText).toContain('right shoulder');
  });
});

// ─── scoreExerciseConflict — affectedRegions ──────────────────────────────────

describe('scoreExerciseConflict — affectedRegions', () => {
  it('lists only the sore regions that actually overlap with the exercise', () => {
    const ex = makeExercise({ stressRegions: ['right_shoulder', 'right_elbow'] });
    const result = scoreExerciseConflict(ex, [
      makeFlag('right_shoulder', 3, 8),
      makeFlag('lower_back', 2, 7), // not in the exercise's regions
    ]);
    expect(result.affectedRegions).toContain('right_shoulder');
    expect(result.affectedRegions).not.toContain('lower_back');
    // right_elbow is in the exercise but is NOT in the soreness list
    expect(result.affectedRegions).not.toContain('right_elbow');
  });

  it('deduplicates regions when the same region appears in both stressRegions and primaryBodyRegions', () => {
    const ex = makeExercise({
      stressRegions: ['right_shoulder'],
      primaryBodyRegions: ['right_shoulder'],
    });
    const result = scoreExerciseConflict(ex, [makeFlag('right_shoulder', 3, 8)]);
    const occurrences = result.affectedRegions.filter((r) => r === 'right_shoulder');
    expect(occurrences).toHaveLength(1);
  });

  it('returns empty affectedRegions when there is no overlap', () => {
    const ex = makeExercise({ stressRegions: ['right_shoulder'] });
    const result = scoreExerciseConflict(ex, [makeFlag('left_quad', 5, 9)]);
    expect(result.affectedRegions).toHaveLength(0);
  });

  it('includes regions from primaryBodyRegions when they are sore', () => {
    const ex = makeExercise({ primaryBodyRegions: ['lower_back'] });
    const result = scoreExerciseConflict(ex, [makeFlag('lower_back', 2, 6)]);
    expect(result.affectedRegions).toContain('lower_back');
  });
});

// ─── suggestSubstitutions ─────────────────────────────────────────────────────

describe('suggestSubstitutions', () => {
  // Base high-conflict exercise: pitcher-sensitive + two throwing-arm stress regions.
  // score ≈ (2.28 + 1.44) × 1.6 = 5.95 → high
  const highConflictEx = makeExercise({
    id: 'ex-high',
    name: 'Overhead Press',
    category: 'strength',
    movementPattern: 'push',
    stressRegions: ['right_shoulder', 'right_elbow'],
    isPitcherSensitive: true,
  });

  const soreness: GroupSorenessFlag[] = [
    makeFlag('right_shoulder', 3, 8),
    makeFlag('right_elbow', 2, 6),
  ];

  it('returns exercises with the same category AND movementPattern that score lower', () => {
    const lowConflict = makeExercise({
      id: 'ex-push-up',
      name: 'Push Up',
      category: 'strength',
      movementPattern: 'push',
      stressRegions: ['chest'], // chest not in soreness list → score 0
    });
    const wrongCategory = makeExercise({
      id: 'ex-wrong-cat',
      name: 'Squat',
      category: 'lower',
      movementPattern: 'squat',
    });
    const wrongPattern = makeExercise({
      id: 'ex-wrong-pat',
      name: 'Row',
      category: 'strength',
      movementPattern: 'pull',
    });

    const results = suggestSubstitutions(
      highConflictEx,
      [lowConflict, wrongCategory, wrongPattern],
      soreness,
    );

    const ids = results.map((r) => r.id);
    expect(ids).toContain('ex-push-up');
    expect(ids).not.toContain('ex-wrong-cat');
    expect(ids).not.toContain('ex-wrong-pat');
  });

  it('excludes the input exercise itself even when present in the library', () => {
    const results = suggestSubstitutions(highConflictEx, [highConflictEx], soreness);
    expect(results.map((r) => r.id)).not.toContain('ex-high');
  });

  it('excludes exercises with a conflict score equal to the input (strict less-than)', () => {
    // Same stress profile → same amplified score → NOT strictly less
    const equalConflict = makeExercise({
      id: 'ex-equal',
      name: 'Dumbbell Shoulder Press',
      category: 'strength',
      movementPattern: 'push',
      stressRegions: ['right_shoulder', 'right_elbow'],
      isPitcherSensitive: true,
    });

    const results = suggestSubstitutions(highConflictEx, [equalConflict], soreness);
    expect(results.map((r) => r.id)).not.toContain('ex-equal');
  });

  it('excludes exercises with a conflict score higher than the input', () => {
    const worseEx = makeExercise({
      id: 'ex-worse',
      name: 'Behind-neck Press',
      category: 'strength',
      movementPattern: 'push',
      stressRegions: ['right_shoulder', 'right_elbow', 'left_shoulder'],
      isPitcherSensitive: true,
    });
    // Adding left_shoulder soreness too to make it score higher
    const heavySoreness = [
      ...soreness,
      makeFlag('left_shoulder', 5, 9),
    ];

    const results = suggestSubstitutions(highConflictEx, [worseEx], heavySoreness);
    expect(results.map((r) => r.id)).not.toContain('ex-worse');
  });

  it('sorts substitutions ascending by conflict score (least conflicted first)', () => {
    // low1: chest only → score 0 (chest not in soreness)
    const low1 = makeExercise({
      id: 'ex-low1',
      name: 'Push Up',
      category: 'strength',
      movementPattern: 'push',
      stressRegions: ['chest'],
    });

    // low2: chest in stress + right_shoulder in primary → slightly higher score
    // right_shoulder primary: (8/10) × (1 + 3×0.3) × 0.75 = 1.14
    const low2 = makeExercise({
      id: 'ex-low2',
      name: 'Incline Push Up',
      category: 'strength',
      movementPattern: 'push',
      stressRegions: ['chest'],
      primaryBodyRegions: ['right_shoulder'],
    });

    // Pass in reversed order to confirm sorting is applied by score, not insertion order.
    const results = suggestSubstitutions(highConflictEx, [low2, low1], soreness);

    expect(results.length).toBe(2);
    const idx1 = results.findIndex((r) => r.id === 'ex-low1');
    const idx2 = results.findIndex((r) => r.id === 'ex-low2');
    // low1 (score 0) should come before low2 (score ~1.14)
    expect(idx1).toBeLessThan(idx2);
  });

  it('returns empty array when library is empty', () => {
    expect(suggestSubstitutions(highConflictEx, [], soreness)).toEqual([]);
  });

  it('returns empty array when no candidate matches category + movementPattern', () => {
    const unrelated = makeExercise({
      id: 'ex-unrelated',
      category: 'conditioning',
      movementPattern: 'squat',
    });
    const results = suggestSubstitutions(highConflictEx, [unrelated], soreness);
    expect(results).toEqual([]);
  });

  it('returns empty array when all candidates score >= base (base score is 0)', () => {
    // When the base exercise itself has score 0 (no overlap), nothing can score lower.
    const noConflictEx = makeExercise({
      id: 'ex-no-conflict',
      category: 'strength',
      movementPattern: 'push',
      stressRegions: [], // no stress regions → score always 0
    });
    const candidate = makeExercise({
      id: 'ex-cand',
      category: 'strength',
      movementPattern: 'push',
      stressRegions: [],
    });
    const results = suggestSubstitutions(noConflictEx, [candidate], soreness);
    expect(results).toEqual([]);
  });

  it('includes multiple valid substitutions all lower than the base', () => {
    const sub1 = makeExercise({
      id: 'ex-sub1',
      name: 'Push Up',
      category: 'strength',
      movementPattern: 'push',
      stressRegions: [], // score 0
    });
    const sub2 = makeExercise({
      id: 'ex-sub2',
      name: 'Wall Push',
      category: 'strength',
      movementPattern: 'push',
      stressRegions: [], // score 0
    });

    const results = suggestSubstitutions(highConflictEx, [sub1, sub2], soreness);
    expect(results.length).toBe(2);
    expect(results.map((r) => r.id).sort()).toEqual(['ex-sub1', 'ex-sub2'].sort());
  });
});
