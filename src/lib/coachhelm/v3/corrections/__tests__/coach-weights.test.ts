import { describe, expect, it } from 'vitest';
import {
  W_MAX,
  W_MIN,
  computeCoachWeights,
  latestPerRead,
  mergeCoachWeights,
  stepCoachWeight,
  type WeightCorrection,
} from '../coach-weights';
import type { CorrectionKind } from '../types';

const COACH = 'coach-user-a';
const OTHER_COACH = 'coach-user-b';

let seq = 0;
function corr(
  kind: CorrectionKind,
  overrides: Partial<WeightCorrection> = {},
): WeightCorrection {
  seq += 1;
  return {
    insight_id: `insight-${seq}`,
    author_user_id: COACH,
    author_role: 'coach',
    kind,
    created_at: `2026-10-${String(1 + (seq % 28)).padStart(2, '0')}T12:00:${String(seq % 60).padStart(2, '0')}Z`,
    family: 'putt_distance',
    ...overrides,
  };
}

/** n corrections of one kind on distinct reads, strictly increasing times. */
function many(kind: CorrectionKind, n: number, family = 'putt_distance', start = 0): WeightCorrection[] {
  return Array.from({ length: n }, (_, i) =>
    corr(kind, {
      family,
      insight_id: `${family}-${kind}-${start + i}`,
      created_at: new Date(Date.UTC(2026, 8, 1, 0, start + i)).toISOString(),
    }),
  );
}

describe('stepCoachWeight', () => {
  it('moves -0.1 on Not this and +0.05 on Good read', () => {
    expect(stepCoachWeight(1, 'not_this')).toBe(0.9);
    expect(stepCoachWeight(1, 'confirm')).toBe(1.05);
  });

  it('does not move on Wrong cause, Already on it or Show later', () => {
    for (const kind of ['wrong_cause', 'already_on_it', 'snooze'] as const) {
      expect(stepCoachWeight(1.2, kind)).toBe(1.2);
    }
  });

  it('clamps to [0.5, 1.5] at every step', () => {
    expect(stepCoachWeight(0.5, 'not_this')).toBe(W_MIN);
    expect(stepCoachWeight(0.55, 'not_this')).toBe(W_MIN);
    expect(stepCoachWeight(1.5, 'confirm')).toBe(W_MAX);
    expect(stepCoachWeight(1.48, 'confirm')).toBe(W_MAX);
  });

  it('has no floating-point drift after many steps', () => {
    let w = 1;
    for (let i = 0; i < 3; i += 1) w = stepCoachWeight(w, 'not_this');
    expect(w).toBe(0.7);
    for (let i = 0; i < 3; i += 1) w = stepCoachWeight(w, 'confirm');
    expect(w).toBe(0.85);
  });
});

describe('computeCoachWeights', () => {
  it('returns {} when the coach has no corrections (neutral W)', () => {
    expect(computeCoachWeights([], COACH)).toEqual({});
  });

  it('steps per family, oldest first', () => {
    const rows = [...many('not_this', 2, 'putt_distance'), ...many('confirm', 3, 'approach_miss')];
    expect(computeCoachWeights(rows, COACH)).toEqual({ putt_distance: 0.8, approach_miss: 1.15 });
  });

  it('floors at 0.5 after many Not this', () => {
    expect(computeCoachWeights(many('not_this', 12), COACH)).toEqual({ putt_distance: 0.5 });
  });

  it('caps at 1.5 and a later Not this starts from the cap', () => {
    const rows = [...many('confirm', 15), ...many('not_this', 1, 'putt_distance', 100)];
    expect(computeCoachWeights(rows, COACH)).toEqual({ putt_distance: 1.4 });
  });

  it('counts one vote per read: the author’s newest correction wins', () => {
    const t = (m: number) => new Date(Date.UTC(2026, 9, 1, 0, m)).toISOString();
    const rows = [
      corr('not_this', { insight_id: 'r1', created_at: t(1) }),
      corr('not_this', { insight_id: 'r1', created_at: t(2) }),
      corr('not_this', { insight_id: 'r1', created_at: t(3) }),
    ];
    expect(computeCoachWeights(rows, COACH)).toEqual({ putt_distance: 0.9 });

    const changedMind = [
      corr('not_this', { insight_id: 'r2', created_at: t(1) }),
      corr('confirm', { insight_id: 'r2', created_at: t(5) }),
    ];
    expect(computeCoachWeights(changedMind, COACH)).toEqual({ putt_distance: 1.05 });
  });

  it('ignores other authors and player-authored rows', () => {
    const rows = [
      ...many('not_this', 3),
      corr('not_this', { author_user_id: OTHER_COACH }),
      corr('not_this', { author_role: 'player' }),
    ];
    expect(computeCoachWeights(rows, COACH)).toEqual({ putt_distance: 0.7 });
  });

  it('omits a family that is back at exactly 1.0', () => {
    const rows = [...many('not_this', 1), ...many('confirm', 2, 'putt_distance', 50)];
    expect(computeCoachWeights(rows, COACH)).toEqual({});
  });

  it('hands a family off once it has >= 10 verdicts', () => {
    const rows = [...many('not_this', 2, 'putt_distance'), ...many('not_this', 2, 'approach_miss')];
    expect(
      computeCoachWeights(rows, COACH, { verdictsByFamily: { putt_distance: 10, approach_miss: 9 } }),
    ).toEqual({ approach_miss: 0.8 });
  });

  it('is independent of input order', () => {
    const rows = [...many('confirm', 4), ...many('not_this', 2, 'putt_distance', 10)];
    expect(computeCoachWeights([...rows].reverse(), COACH)).toEqual(computeCoachWeights(rows, COACH));
  });
});

describe('latestPerRead', () => {
  it('keeps the later element on a created_at tie', () => {
    const at = '2026-10-01T00:00:00Z';
    const a = corr('not_this', { insight_id: 'x', created_at: at });
    const b = corr('confirm', { insight_id: 'x', created_at: at });
    expect(latestPerRead([a, b])).toEqual([b]);
  });
});

describe('mergeCoachWeights', () => {
  it('lets a calibrated outcome weight win over W for its family', () => {
    expect(
      mergeCoachWeights({ putt_distance: 0.8, approach_miss: 1.1 }, { putt_distance: 1.6 }),
    ).toEqual({ putt_distance: 1.6, approach_miss: 1.1 });
  });
});
