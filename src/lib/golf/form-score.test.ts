import { describe, expect, it } from 'vitest';
import {
  FORM_EARLY_READ_LABEL,
  FORM_MAX,
  computeFormFromCountableRounds,
  computeFormScore,
  describeFormFormula,
  formCurve,
  type FormRoundInput,
} from './form-score';
import { withCanonicalRoundTotal } from './round-total';
import { isCountableRound } from './round-countable';
import { computeCompositeRating } from '@/lib/coachhelm/composite-rating';

const r = (score_to_par: number, holes_played = 18) => ({ score_to_par, holes_played });

/** A full, countable 18-hole row at par 72. */
const row18 = (total: number, extra: Partial<FormRoundInput> = {}): FormRoundInput => ({
  status: 'completed',
  holes_played: 18,
  total_score: total,
  front_nine: Math.floor(total / 2),
  back_nine: total - Math.floor(total / 2),
  total_putts: 32,
  score_to_par: total - 72,
  ...extra,
});

describe('formCurve', () => {
  it('keeps the old anchors: par 80, +10 50, +20 20', () => {
    expect(Math.round(formCurve(0))).toBe(80);
    expect(Math.round(formCurve(10))).toBe(50);
    expect(Math.round(formCurve(20))).toBe(20);
  });

  it('is monotonic and never reaches 100 for any countable average', () => {
    // −22 is the stroke floor (50 strokes on a par 72).
    expect(Math.round(formCurve(-22))).toBeLessThan(100);
    expect(formCurve(-5)).toBeGreaterThan(formCurve(-4));
    expect(formCurve(30)).toBeLessThan(formCurve(29));
  });
});

describe('computeFormFromCountableRounds', () => {
  it('is null with no rounds, never a fabricated 50', () => {
    const f = computeFormFromCountableRounds([]);
    expect(f.score).toBeNull();
    expect(f.quality).toBe('none');
    expect(f.qualityLabel).toBeNull();
  });

  it('labels fewer than 5 countable rounds as an early read', () => {
    const f = computeFormFromCountableRounds([r(2), r(4)]);
    expect(f.quality).toBe('early');
    expect(f.qualityLabel).toBe(FORM_EARLY_READ_LABEL);
    expect(f.score).toBe(Math.round(formCurve(3)));
  });

  it('is established at 5 rounds and reads only the last 5', () => {
    const f = computeFormFromCountableRounds([r(0), r(0), r(0), r(0), r(0), r(30), r(30)]);
    expect(f.quality).toBe('established');
    expect(f.qualityLabel).toBeNull();
    expect(f.roundsCounted).toBe(7);
    expect(f.roundsInWindow).toBe(5);
    expect(f.score).toBe(80);
  });

  it('normalizes 9-hole rounds to 18', () => {
    expect(computeFormFromCountableRounds([r(5, 9)]).score).toBe(computeFormFromCountableRounds([r(10)]).score);
  });

  it('subtracts 5 per severe pattern, at most 20, and ignores others', () => {
    const five = [r(0), r(0), r(0), r(0), r(0)];
    expect(computeFormFromCountableRounds(five, [{ severity: 'high' }]).score).toBe(75);
    expect(computeFormFromCountableRounds(five, [{ severity: 'low' }, { severity: 'medium' }]).score).toBe(80);
    const six = Array.from({ length: 6 }, () => ({ severity: 'critical' }));
    const f = computeFormFromCountableRounds(five, six);
    expect(f.patternPenalty).toBe(20);
    expect(f.score).toBe(60);
  });

  it('never prints 100, even for an exceptional player', () => {
    const f = computeFormFromCountableRounds([r(-12), r(-12), r(-12), r(-12), r(-12)]);
    expect(f.score).not.toBeNull();
    expect(f.score!).toBeLessThanOrEqual(FORM_MAX);
    expect(f.score!).toBeLessThan(100);
  });

  it('drops a to par below the stroke floor instead of pinning the score', () => {
    const f = computeFormFromCountableRounds([r(-35), r(4)]);
    expect(f.roundsCounted).toBe(1);
    expect(f.score).toBe(Math.round(formCurve(4)));
  });
});

describe('computeFormScore (raw rows)', () => {
  it('applies the countable rule: the Sep 17 37-stroke round does not count', () => {
    const sep17 = row18(37, { front_nine: 19, back_nine: 18, total_putts: 18, strokes_gained_total: 34.51 });
    const f = computeFormScore([sep17, row18(76), row18(78)]);
    expect(f.roundsCounted).toBe(2);
    expect(f.quality).toBe('early');
    expect(f.score).toBe(Math.round(formCurve(5)));
  });

  it('skips hole-less rounds', () => {
    const holeless = row18(74, { front_nine: null, back_nine: null });
    expect(computeFormScore([holeless]).score).toBeNull();
  });

  it('reads to par from the hole-summed total, not a stale total_score', () => {
    // total_score says 75 (+3) but the holes sum to 76: to par is +4.
    const drifted = row18(75, { front_nine: 38, back_nine: 38 });
    expect(computeFormScore([drifted]).averageToPar18).toBe(4);
  });

  it('agrees with the countable-rounds entry point on the same rounds', () => {
    const rows = [row18(74), row18(79), row18(71), row18(80), row18(77)];
    const viaRaw = computeFormScore(rows, [{ severity: 'critical' }]);
    const viaCountable = computeFormFromCountableRounds(
      rows.map((x) => ({ score_to_par: x.score_to_par, holes_played: x.holes_played })),
      [{ severity: 'critical' }],
    );
    expect(viaRaw).toEqual(viaCountable);
  });
});

describe('describeFormFormula', () => {
  it('shows the player sum and the early-read note', () => {
    const lines = describeFormFormula(computeFormFromCountableRounds([r(10), r(10)], [{ severity: 'high' }]));
    expect(lines.join(' ')).toContain('+10.0 over 2 rounds → 50.0, minus 5 for patterns = 45.');
    expect(lines.join(' ')).toContain('Early read: 2 of 5');
  });

  it('says there is no score when there are no rounds', () => {
    expect(describeFormFormula(computeFormFromCountableRounds([])).at(-1)).toContain('no score');
  });
});

describe('one number on every path (OD-02 parity, drifted totals)', () => {
  it('Scouting (computeFormScore), Team Stats and Fingerprint (canonical + countable loaders) agree', () => {
    // total_score says 75 but the nines sum to 76; another says 80, nines 41/40.
    const rows = [
      row18(75, { front_nine: 38, back_nine: 38 }),
      row18(80, { front_nine: 41, back_nine: 40 }),
      row18(74),
      row18(78),
      row18(72),
      row18(37, { front_nine: 19, back_nine: 18, total_putts: 18, strokes_gained_total: 34.51 }),
    ];
    const patterns = [{ severity: 'high' }, { severity: 'low' }];
    const scouting = computeFormScore(rows, patterns);
    // Team Stats page and player-fingerprint.ts loaders: canonical total, then the countable rule.
    const loaded = rows.map(withCanonicalRoundTotal).filter(isCountableRound);
    const teamStats = computeFormFromCountableRounds(loaded, patterns);
    const fingerprint = computeCompositeRating(loaded, patterns);
    expect(scouting.averageToPar18).toBe(4.2); // +4 +9 +2 +6 0 (hole-summed), Sep 17 excluded
    expect(teamStats).toEqual(scouting);
    expect(fingerprint.form).toEqual(scouting);
    expect(fingerprint.rating).toBe(scouting.score);
  });
});
