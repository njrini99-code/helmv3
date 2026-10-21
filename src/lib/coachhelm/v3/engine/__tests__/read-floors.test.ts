import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

import {
  FAMILY_FLOORS,
  MIN_ROUNDS_PER_READ,
  countdownText,
  evaluateReadFloor,
  sampleUnitFor,
} from '../read-floors';

describe('FAMILY_FLOORS', () => {
  it('never lets a family say anything from fewer than 3 countable rounds', () => {
    for (const [family, floor] of Object.entries(FAMILY_FLOORS)) {
      expect(floor.min_rounds, family).toBeGreaterThanOrEqual(MIN_ROUNDS_PER_READ);
    }
  });

  it('puts Clear at twice the floor for the rate families (04 §2)', () => {
    for (const family of ['putt_distance', 'putt_bias', 'approach_miss', 'scrambling', 'tee_strategy']) {
      const f = FAMILY_FLOORS[family];
      expect(f?.clear_n, family).toBe((f?.say_n ?? 0) * 2);
    }
    expect(FAMILY_FLOORS.putt_distance?.say_n).toBe(20);
    expect(FAMILY_FLOORS.approach_miss?.say_n).toBe(20);
  });

  it('names the unit sample_n counts', () => {
    expect(sampleUnitFor('putt_distance')).toBe('putts');
    expect(sampleUnitFor('scrambling')).toBe('opportunities');
    expect(sampleUnitFor('composite:closing_hole_fatigue')).toBe('rounds');
    expect(sampleUnitFor('composite:lag_distance_3putt')).toBeNull();
    expect(sampleUnitFor('unknown')).toBeNull();
  });
});

describe('evaluateReadFloor', () => {
  it('passes a read that clears rounds and attempts', () => {
    expect(evaluateReadFloor('putt_distance', { sample_n: 24, rounds_n: 6 })).toBeNull();
  });

  it('holds back a sand-save read from two rounds even with enough attempts', () => {
    expect(evaluateReadFloor('scrambling', { sample_n: 14, rounds_n: 2 })).toEqual({
      family: 'scrambling',
      needs: [{ unit: 'rounds', have_n: 2, need_n: 4 }],
    });
  });

  it('holds back a read below its attempt floor', () => {
    expect(evaluateReadFloor('putt_bias', { sample_n: 11, rounds_n: 9 })?.needs).toEqual([
      { unit: 'putts', have_n: 11, need_n: 20 },
    ]);
  });

  it('checks per-arm minimums from evidence.detail', () => {
    const r = evaluateReadFloor('pressure_gap', {
      sample_n: 14,
      rounds_n: 14,
      detail: { practice_rounds: 4, competitive_rounds: 10 },
    });
    expect(r?.needs).toEqual([{ unit: 'rounds', have_n: 4, need_n: 6 }]);
  });

  it('judges on attempts alone when the stamp failed (no rounds_n)', () => {
    expect(evaluateReadFloor('putt_distance', { sample_n: 30 })).toBeNull();
  });

  it('never suppresses an unknown family', () => {
    expect(evaluateReadFloor('something_new', { sample_n: 1, rounds_n: 1 })).toBeNull();
  });

  it('insight composites carry only the round floor', () => {
    expect(evaluateReadFloor('composite:lag_distance_3putt', { sample_n: 6, rounds_n: 5 })).toBeNull();
    expect(evaluateReadFloor('composite:lag_distance_3putt', { sample_n: 60, rounds_n: 2 })?.needs).toEqual([
      { unit: 'rounds', have_n: 2, need_n: 3 },
    ]);
  });
});

describe('countdownText', () => {
  it('says what is still needed in plain words', () => {
    expect(
      countdownText({
        family: 'scrambling',
        needs: [
          { unit: 'rounds', have_n: 2, need_n: 4 },
          { unit: 'opportunities', have_n: 11, need_n: 12 },
          { unit: 'tee_shots', have_n: 10, need_n: 12 },
        ],
      }),
    ).toBe('2 more rounds, 1 more opportunity, 2 more tee shots');
  });
});
