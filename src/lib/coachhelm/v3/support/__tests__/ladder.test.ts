import { describe, expect, it } from 'vitest';
import { assignLadder, minRung, rungAtLeast, type LadderInput } from '../ladder';

const clear: LadderInput = {
  q: 0.02,
  rangeExcludesZero: true,
  n: 45,
  floor: 20,
  roundsN: 8,
  strokes: 0.6,
  why: 'not_traced',
  stabilityAgrees: null,
  checkpointsHeld: 0,
  cap: 'seen_repeatedly',
};

describe('assignLadder: the five rungs (02 §6)', () => {
  it('Observed: q <= 0.10, range excludes 0, n >= 2 × floor, >= 3 rounds, S >= 0.3', () => {
    const r = assignLadder(clear);
    expect(r.ladder).toBe('observed');
    expect(r.what_ladder).toBe('observed');
    expect(r.clear).toBe(true);
    expect(r.reasons).toContain('one_window_only');
  });

  it('Seen repeatedly: Observed plus split-half agreement', () => {
    expect(assignLadder({ ...clear, stabilityAgrees: true }).ladder).toBe('seen_repeatedly');
  });

  it('Seen repeatedly: Observed plus two checkpoints held', () => {
    expect(assignLadder({ ...clear, checkpointsHeld: 2 }).ladder).toBe('seen_repeatedly');
    expect(assignLadder({ ...clear, checkpointsHeld: 1 }).ladder).toBe('observed');
  });

  it('Seen repeatedly with a counted path needs the path to lead in both halves', () => {
    const base = { ...clear, stabilityAgrees: true, why: 'observed_sequence' as const };
    // No evidence carries per-half paths yet, so the worded read stops at
    // Observed while the WHAT alone may still be Seen repeatedly.
    const r = assignLadder(base);
    expect(r.ladder).toBe('observed');
    expect(r.what_ladder).toBe('seen_repeatedly');
    expect(r.reasons).toContain('cause_path_one_window');
  });

  it('Likely: supported but the range includes 0', () => {
    const r = assignLadder({ ...clear, rangeExcludesZero: false });
    expect(r.ladder).toBe('likely');
    expect(r.reasons).toContain('range_includes_zero');
  });

  it('Likely: supported and the range excludes 0 but n < 2 × floor', () => {
    const r = assignLadder({ ...clear, n: 32 });
    expect(r.ladder).toBe('likely');
    expect(r.reasons).toContain('below_clear_n');
  });

  it('Likely: a Clear WHAT with a corroborated inference as the WHY', () => {
    const r = assignLadder({ ...clear, why: 'corroborated' });
    expect(r.ladder).toBe('likely');
    expect(r.what_ladder).toBe('observed');
  });

  it('Working hypothesis: supported but only just over the floor', () => {
    const r = assignLadder({ ...clear, n: 25, rangeExcludesZero: false });
    expect(r.ladder).toBe('working_hypothesis');
    expect(r.reasons).toContain('thin_support');
  });

  it('Working hypothesis: an uncorroborated cause line caps the read as worded, not the WHAT', () => {
    const r = assignLadder({ ...clear, why: 'candidate' });
    expect(r.ladder).toBe('working_hypothesis');
    expect(r.what_ladder).toBe('observed');
    expect(r.reasons).toContain('uncorroborated_cause');
  });

  it('Working hypothesis: no strokes estimate means the practical floor cannot be shown', () => {
    const r = assignLadder({ ...clear, strokes: null });
    expect(r.what_ladder).toBe('working_hypothesis');
    expect(r.reasons).toContain('no_strokes_estimate');
  });

  it.each([
    ['q above 0.10', { q: 0.2 }, 'not_supported'],
    ['untestable', { q: null }, 'untestable'],
    ['fewer than 3 rounds', { roundsN: 2 }, 'below_round_floor'],
    ['rounds unknown', { roundsN: null }, 'rounds_unknown'],
    ['below the attempt floor', { n: 19 }, 'below_attempt_floor'],
    ['below the strokes floor', { strokes: 0.2 }, 'below_strokes_floor'],
  ] as const)('Not enough yet: %s', (_label, patch, reason) => {
    const r = assignLadder({ ...clear, ...patch } as LadderInput);
    expect(r.ladder).toBe('not_enough_yet');
    expect(r.what_ladder).toBe('not_enough_yet');
    expect(r.clear).toBe(false);
    expect(r.reasons).toContain(reason);
  });

  it('holds a two-arm contrast to every arm floor, a missing arm count included', () => {
    expect(assignLadder({ ...clear, arms: [{ have: 6, need: 6 }, { have: 7, need: 6 }] }).ladder).not.toBe('not_enough_yet');
    const short = assignLadder({ ...clear, arms: [{ have: 5, need: 6 }, { have: 30, need: 6 }] });
    expect(short.ladder).toBe('not_enough_yet');
    expect(short.reasons).toEqual(['below_arm_floor']);
    expect(assignLadder({ ...clear, arms: [{ have: null, need: 6 }] }).reasons).toEqual(['below_arm_floor']);
  });

  it('puts the binding reason first, not the first check in a fixed order', () => {
    // 19 of 20 attempts is nearly there; 1 of 8 rounds is the real hold-up.
    const r = assignLadder({ ...clear, n: 19, roundsN: 1, roundFloor: 8, q: 0.3 });
    expect(r.reasons).toEqual(['below_round_floor', 'below_attempt_floor', 'not_supported']);
    const flipped = assignLadder({ ...clear, n: 2, roundsN: 7, roundFloor: 8 });
    expect(flipped.reasons[0]).toBe('below_attempt_floor');
    // Untestable always leads.
    expect(assignLadder({ ...clear, q: null, roundsN: null }).reasons).toEqual(['untestable', 'rounds_unknown']);
  });

  it('respects a family round floor above 3', () => {
    expect(assignLadder({ ...clear, roundsN: 3, roundFloor: 4 }).ladder).toBe('not_enough_yet');
  });

  it('applies the family cap to both rungs', () => {
    const r = assignLadder({ ...clear, stabilityAgrees: true, cap: 'likely' });
    expect(r.ladder).toBe('likely');
    expect(r.what_ladder).toBe('likely');
    expect(r.reasons).toContain('family_cap:likely');
  });
});

describe('rung helpers', () => {
  it('orders rungs', () => {
    expect(minRung('observed', 'likely')).toBe('likely');
    expect(rungAtLeast('seen_repeatedly', 'observed')).toBe(true);
    expect(rungAtLeast('working_hypothesis', 'likely')).toBe(false);
  });
});
