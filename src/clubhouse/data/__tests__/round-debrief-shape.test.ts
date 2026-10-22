import { describe, expect, it } from 'vitest';
import type { ChReviewHole, ChReviewShot, ChRoundReview } from '../round-review-shape';
import { buildDebrief, movedNumber, readChange, roundFacts, type ChDebriefHistoryRow } from '../round-debrief-shape';
import { PREVIEW_REVIEW } from '../../preview/fixtures-round-review';

/** CoachHelm chs-30: the player's 30-second debrief, from the round, their earlier rounds and their top open read (synthetic). */

const tee = (over: Partial<ChReviewShot> = {}): ChReviewShot => ({ n: 1, kind: 'Tee', club: 'Driver', from: '400 yds', lie: 'fairway', to: '150 yds', miss: null, read: null, penalty: false, ...over });
const hole = (n: number, par: number, score: number, over: Partial<ChReviewHole> = {}): ChReviewHole => ({
  n,
  par,
  yards: 400,
  score,
  putts: 2,
  fairway: null,
  gir: null,
  penalties: 0,
  shots: par >= 4 ? [tee()] : [],
  ...over,
});
const past = (over: Partial<ChDebriefHistoryRow>, n = 6): ChDebriefHistoryRow[] =>
  Array.from({ length: n }, (_, i) => ({ total_putts: 32 + (i % 2), total_fairways_hit: 7, total_fairways: 14, total_gir: 9, total_gir_possible: 18, score_to_par: 5 + (i % 2), ...over }));
const round = (over: Partial<ChRoundReview> = {}): ChRoundReview => ({ ...PREVIEW_REVIEW, putts: 32, toPar: 5, fairways: { hit: 7, of: 14 }, greens: { hit: 9, of: 18 }, ...over });

describe('the one number that moved', () => {
  it('names the measure furthest from the player’s own average, with the average and how many rounds it is over', () => {
    const history = past({}).map((h, i) => ({ ...h, total_gir: 8 + (i % 3) }));
    expect(movedNumber(round({ putts: 28 }), history)).toEqual({ value: '28 putts', line: 'Your average over your last 6 rounds: 32.5.', tone: 'good' });
  });

  it('says a move the wrong way too, in its own tone', () => {
    expect(movedNumber(round({ toPar: 12 }), past({}))).toMatchObject({ value: '+12 to par', tone: 'bad' });
  });

  it('says nothing under three earlier rounds, or when nothing sits a full spread from the average', () => {
    expect(movedNumber(round({ putts: 25 }), past({}, 2))).toBeNull();
    expect(movedNumber(round({ putts: 32.5 }), past({}))).toBeNull();
  });
});

describe('the round’s counted facts', () => {
  it('names the doubles and, when every one began with a tee shot into the same trouble, says so as a count of this round', () => {
    const rough = { shots: [tee({ lie: 'rough', miss: 'missed right' })] };
    const holes = [hole(1, 4, 4), hole(7, 4, 6, rough), hole(14, 5, 7, rough)];
    expect(roundFacts(holes)).toBe('Two doubles or worse (holes 7 and 14); both came after a tee shot right into the rough.');
  });

  it('names the doubles alone when their tee shots differ, and one double by its hole', () => {
    expect(roundFacts([hole(7, 4, 6, { shots: [tee({ lie: 'rough' })] }), hole(14, 4, 6)])).toBe('Two doubles or worse (holes 7 and 14).');
    expect(roundFacts([hole(3, 3, 5), hole(4, 4, 4)])).toBe('One double bogey or worse (hole 3).');
  });

  it('with no double, the three-putts; with neither, that; with no holes, nothing', () => {
    expect(roundFacts([hole(4, 4, 5, { putts: 3 }), hole(9, 4, 5, { putts: 3 }), hole(10, 4, 4)])).toBe('No doubles or worse; three-putts on holes 4 and 9.');
    expect(roundFacts([hole(1, 4, 4)])).toBe('No doubles or worse and no three-putts.');
    expect(roundFacts([])).toBeNull();
  });
});

describe('what this round did to the read', () => {
  const holes = [hole(2, 5, 5), hole(7, 5, 6), hole(4, 4, 4), hole(9, 3, 5)];

  it('puts the round’s par-type average beside the read’s, and which way it moves it', () => {
    expect(readChange({ id: 'r', title: 'Par 5 scoring', metric: 'scoring_par_5', yourValue: 5.8 }, holes)).toBe(
      'Par 5s today: 5.5 a hole, against 5.8 in the read. This round moves it the right way; one round does not decide it.',
    );
    expect(readChange({ id: 'r', title: 'Par 3 scoring', metric: 'scoring_par_3', yourValue: 3.4 }, holes)).toMatch(/moves it the wrong way/);
  });

  it('counts penalty strokes and doubles or worse', () => {
    const pen = [hole(1, 4, 5, { penalties: 1 }), hole(2, 4, 4)];
    expect(readChange({ id: 'r', title: 'Penalties', metric: 'penalty_rate_per_round', yourValue: 1 }, pen)).toBe(
      'Penalty strokes today: 1, against 1.0 a round in the read. This round leaves it where it was.',
    );
    expect(readChange({ id: 'r', title: 'Big numbers', metric: 'big_number_rate', yourValue: 9 }, holes)).toBe(
      'Doubles or worse today: 1 of 4 holes (25%), against 9% in the read. This round moves it the wrong way; one round does not decide it.',
    );
  });

  it('says nothing for a measure one round’s card cannot say', () => {
    expect(readChange({ id: 'r', title: 'Putts from 5 to 10 ft', metric: 'putts_made_5_10ft_pct', yourValue: 40 }, holes)).toBeNull();
    expect(readChange({ id: 'r', title: 'No value', metric: 'scoring_par_5', yourValue: null }, holes)).toBeNull();
  });
});

describe('the debrief', () => {
  it('takes the read’s drill as the next step, else the focus area', () => {
    const r = round();
    expect(buildDebrief(r, { history: [], read: null, next: { drill: { title: 'Lag ladder', minutes: 12 }, focus: 'Lag putting' } })?.next).toBe('Lag ladder · 12 min');
    expect(buildDebrief(r, { history: [], read: null, next: { drill: null, focus: 'Lag putting' } })?.next).toBe('Lag putting');
  });

  it('is null when it has nothing to say, so the page keeps its recap', () => {
    const r = round({ holes: [], putts: null, toPar: null, fairways: null, greens: null });
    expect(buildDebrief(r, { history: past({}), read: null, next: null })).toBeNull();
  });

  it('reads no holes from a review whose holes failed', () => {
    const r = round({ holesError: true });
    expect(buildDebrief(r, { history: [], read: { id: 'r', title: 'Par 5 scoring', metric: 'scoring_par_5', yourValue: 5.6 }, next: null })).toEqual({
      moved: null,
      read: { id: 'r', title: 'Par 5 scoring', change: null },
      facts: null,
      next: null,
    });
  });
});
