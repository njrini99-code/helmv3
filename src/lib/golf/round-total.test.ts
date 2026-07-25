import { describe, it, expect } from 'vitest';
import {
  deriveRoundTotal,
  deriveScoreToPar,
  withCanonicalRoundTotal,
  deriveRoundTotalsFromHoles,
  type RoundTotalHoleRow,
} from './round-total';

describe('deriveRoundTotal', () => {
  it('prefers front_nine + back_nine over total_score', () => {
    // AUDIT-0724 finding #1 repro: total_score drifted to 85 but the holes
    // (represented here by front_nine+back_nine) still say 84.
    expect(
      deriveRoundTotal({ total_score: 85, front_nine: 45, back_nine: 39 })
    ).toEqual({ total: 84, source: 'holes' });
  });

  it('falls back to total_score when front/back nine are unavailable', () => {
    expect(
      deriveRoundTotal({ total_score: 72, front_nine: null, back_nine: null })
    ).toEqual({ total: 72, source: 'total_score' });
  });

  it('falls back to total_score when only one of front/back nine is present', () => {
    // A 9-hole round: back_nine is legitimately null, not stale.
    expect(
      deriveRoundTotal({ total_score: 40, front_nine: 40, back_nine: null })
    ).toEqual({ total: 40, source: 'total_score' });
  });

  it('returns null/none when nothing is available', () => {
    expect(
      deriveRoundTotal({ total_score: null, front_nine: null, back_nine: null })
    ).toEqual({ total: null, source: 'none' });
  });

  it('agrees with total_score when there is no drift (the common case)', () => {
    expect(
      deriveRoundTotal({ total_score: 84, front_nine: 45, back_nine: 39 })
    ).toEqual({ total: 84, source: 'holes' });
  });
});

describe('deriveScoreToPar', () => {
  it('shifts score_to_par by the same delta as the total correction', () => {
    // total_score 85 -> 84 (delta -1); score_to_par should shift the same way.
    expect(
      deriveScoreToPar({
        total_score: 85,
        front_nine: 45,
        back_nine: 39,
        score_to_par: 13,
      })
    ).toBe(12);
  });

  it('leaves score_to_par untouched when total_score is already correct', () => {
    expect(
      deriveScoreToPar({
        total_score: 84,
        front_nine: 45,
        back_nine: 39,
        score_to_par: 12,
      })
    ).toBe(12);
  });

  it('falls back to the raw persisted value when score_to_par is null', () => {
    expect(
      deriveScoreToPar({
        total_score: 85,
        front_nine: 45,
        back_nine: 39,
        score_to_par: null,
      })
    ).toBeNull();
  });
});

describe('withCanonicalRoundTotal', () => {
  it('corrects a drifted row and returns a new object', () => {
    const round = { total_score: 85, front_nine: 45, back_nine: 39, score_to_par: 13 };
    const fixed = withCanonicalRoundTotal(round);
    expect(fixed).toEqual({ total_score: 84, front_nine: 45, back_nine: 39, score_to_par: 12 });
    expect(fixed).not.toBe(round);
  });

  it('returns the SAME object reference when nothing needs correcting (no needless re-render)', () => {
    const round = { total_score: 84, front_nine: 45, back_nine: 39, score_to_par: 12 };
    expect(withCanonicalRoundTotal(round)).toBe(round);
  });
});

describe('deriveRoundTotalsFromHoles', () => {
  const fallback = { total_score: 85, front_nine: 45, back_nine: 39, score_to_par: 13 };

  it('sums the actual hole rows over the stale round-level columns (finding #1)', () => {
    const holes: RoundTotalHoleRow[] = [
      ...Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1, par: 4, score: 5 })), // 45
      ...Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 10, par: 4, score: 4 })), // 36
    ];
    // holes sum to 81 with par 72 -> +9, deliberately different from fallback
    // to prove the holes win over total_score/front_nine/back_nine.
    const result = deriveRoundTotalsFromHoles(holes, fallback);
    expect(result).toEqual({ total: 81, scoreToPar: 9, frontNine: 45, backNine: 36, source: 'holes' });
  });

  it('is null-honest: a hole missing a score falls back to the row-level columns', () => {
    const holes: RoundTotalHoleRow[] = [
      { hole_number: 1, par: 4, score: 4 },
      { hole_number: 2, par: 4, score: null }, // not yet scored
    ];
    const result = deriveRoundTotalsFromHoles(holes, fallback);
    expect(result.source).toBe('holes'); // fallback still routes through deriveRoundTotal, which prefers front/back nine
    expect(result.total).toBe(84); // fallback.front_nine + fallback.back_nine
  });

  it('falls back cleanly with an empty holes array', () => {
    const result = deriveRoundTotalsFromHoles([], fallback);
    expect(result).toEqual({ total: 84, scoreToPar: 13, frontNine: 45, backNine: 39, source: 'holes' });
  });

  it('recomputes scoreToPar via the delta shift when par is incomplete', () => {
    const holes: RoundTotalHoleRow[] = [
      { hole_number: 1, par: null, score: 5 },
      { hole_number: 2, par: 4, score: 4 },
    ];
    const result = deriveRoundTotalsFromHoles(holes, fallback);
    expect(result.total).toBe(9);
    expect(result.source).toBe('holes');
    // par incomplete -> scoreToPar comes from the delta-shift fallback path
    expect(result.scoreToPar).not.toBeNull();
  });
});
