import { describe, expect, it } from 'vitest';
import {
  COUNTING_FLOOR,
  METRICS,
  METRIC_KEYS,
  SOLID_AT,
  allMetrics,
  closingNine,
  countRate,
  dropDiff,
  exclusionWords,
  gapToDrop,
  matchRounds,
  metric,
  r36Split,
  tourSampleState,
  type TourHoleRow,
  type TourMetricRound,
  type TourRoundCounting,
} from '../metrics';

/* Fixtures ------------------------------------------------------------------------------------------------------------- */

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];

/** Hole rows from per-hole deltas to par; greens and fairways hit wherever the hole was par or better. */
function holes(deltas: number[], first = 1, extra: (h: TourHoleRow) => Partial<TourHoleRow> = () => ({})): TourHoleRow[] {
  return deltas.map((d, i) => {
    const n = first + i;
    const par = PARS[n - 1] ?? 4;
    const row: TourHoleRow = { n, par, score: par + d, putts: 2, gir: d <= 0, fir: d <= 0 };
    return { ...row, ...extra(row) };
  });
}

let seq = 0;
function round(over: Partial<TourMetricRound> = {}): TourMetricRound {
  seq += 1;
  return { id: `r${seq}`, playerId: 'ava', date: '2026-10-01', holes: 18, totalOnly: false, score: 72, toPar: 0, ...over };
}

// H1: +3 (75). Par 3s: 0, 1, 0, 2. Par 5s: −1, 0, 0, 0. Bogeys on 2, 7, 10, 16, each followed by a par.
const H1 = [0, 1, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, -1, 0, 2, 0, 0];
// H2: E (72). Bogey on 5 then birdie on 6 (a bounce back). Bogey on 18: no next hole.
const H2 = [-1, 0, 0, 0, 1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];

const counting = (over: Partial<TourRoundCounting> = {}): TourRoundCounting => ({ counted: true, tie: false, line: 73, drop: 75, lineupSize: 5, ...over });

const event = (n: number, over: Partial<TourMetricRound> = {}) =>
  round({ context: 'event', eventId: 'e1', roundEventId: `e1-r${n}`, roundNumber: n, roundsInEvent: 3, role: 'lineup', counting: counting(), ...over });

/* Catalogue ------------------------------------------------------------------------------------------------------------ */

describe('metric catalogue', () => {
  it('has every 10.1 row, each with a formula in words and a direction', () => {
    expect(METRIC_KEYS).toEqual([
      'score_avg',
      'to_par_avg',
      'vs_field',
      'count_rate',
      'gap_drop',
      'drop_diff',
      'par3',
      'par4',
      'par5',
      'birdie_rate',
      'bogey_avoid',
      'bounce_back',
      'gir',
      'fir',
      'putts',
      'sg_total',
      'sg_ott',
      'sg_app',
      'sg_arg',
      'sg_putt',
      'r36_split',
      'closing9',
    ]);
    for (const key of METRIC_KEYS) {
      const d = METRICS[key];
      expect(d.key).toBe(key);
      expect(d.formula.startsWith(d.label)).toBe(true);
      expect(`${d.label} ${d.formula}`).not.toMatch(/[!]|[A-Za-z]'[A-Za-z]|[←→]/);
      expect(d.mmd).toBeGreaterThan(0);
    }
  });

  it('labels rate differences in points, never relative percentages', () => {
    for (const key of METRIC_KEYS) {
      if (METRICS[key].unit === '%') expect(METRICS[key].diffUnit).toBe('pts');
    }
  });

  it('uses the 10.2 solid thresholds: 3 rounds for scores, holes and SG, 4 team rounds for counting rate', () => {
    expect(SOLID_AT).toEqual({ score: 3, holes: 3, sg: 3, counting: 4 });
    expect(METRICS.score_avg.solidAt).toBe(3);
    expect(METRICS.gir.solidAt).toBe(3);
    expect(METRICS.sg_total.solidAt).toBe(3);
    expect(METRICS.count_rate.solidAt).toBe(4);
  });

  it('uses the 10.4 floors: SG long and short game apart, and a counting floor of its own', () => {
    expect(METRICS.sg_total.floor).toBe('sgLong');
    expect(METRICS.sg_app.floor).toBe('sgLong');
    expect(METRICS.sg_arg.floor).toBe('sgShort');
    expect(METRICS.sg_putt.floor).toBe('sgShort');
    expect(METRICS.count_rate.floor).toBe('counting');
    expect(COUNTING_FLOOR).toEqual({ show: 2, early: 5, unit: 'team round' });
    expect(tourSampleState('counting', 1)).toBe('none');
    expect(tourSampleState('counting', 2)).toBe('early');
    expect(tourSampleState('counting', 5)).toBe('steady');
    expect(tourSampleState('score', null)).toBe('none');
    expect(tourSampleState('score', Number.NaN)).toBe('none');
  });

  it('says why a round was left out, with the holes for a WD', () => {
    expect(exclusionWords({ reason: 'nine-holes' })).toBe('Excluded: nine holes');
    expect(exclusionWords({ reason: 'individual' })).toBe('Excluded: individual entry');
    expect(exclusionWords({ reason: 'no-shot-data' })).toBe('Excluded: no shot data');
    expect(exclusionWords({ reason: 'wd', thru: 11 })).toBe('WD after 11');
    expect(exclusionWords({ reason: 'wd' })).toBe('Excluded: WD');
  });
});

/* Score metrics -------------------------------------------------------------------------------------------------------- */

describe('score metrics', () => {
  it('scoring average: mean of 18-hole scores; a nine is excluded, never doubled', () => {
    const nine = round({ holes: 9, score: 36, toPar: 0 });
    const r = metric('score_avg', [round({ score: 72 }), round({ score: 74 }), round({ score: 70 }), nine]);
    expect(r.value).toBe(72);
    expect(r.n).toBe(3);
    expect(r.solid).toBe(true);
    expect(r.excluded).toEqual([{ roundId: nine.id, reason: 'nine-holes' }]);
    expect(r.perRound.map((p) => p.value)).toEqual([72, 74, 70]);
  });

  it('a value shows from one round and is solid from three', () => {
    expect(metric('score_avg', []).value).toBeNull();
    expect(metric('score_avg', []).solid).toBe(false);
    const one = metric('score_avg', [round({ score: 71 })]);
    expect(one.value).toBe(71);
    expect(one.solid).toBe(false);
    expect(metric('score_avg', [round(), round()]).solid).toBe(false);
  });

  it('to par: mean round to par; a round without par is listed', () => {
    const noPar = round({ toPar: null });
    const r = metric('to_par_avg', [round({ toPar: 0 }), round({ toPar: 2 }), round({ toPar: -2 }), noPar]);
    expect(r.value).toBe(0);
    expect(r.n).toBe(3);
    expect(r.excluded).toEqual([{ roundId: noPar.id, reason: 'no-par' }]);
  });

  it('vs field: mean of (score − field average); a round with no field data is listed', () => {
    const noField = round({ vsField: null });
    const r = metric('vs_field', [round({ vsField: 1.5 }), round({ vsField: -0.5 }), noField]);
    expect(r.value).toBe(0.5);
    expect(r.n).toBe(2);
    expect(r.solid).toBe(false);
    expect(r.excluded).toEqual([{ roundId: noField.id, reason: 'no-field' }]);
  });

  it('totals-only and coach-entered scores count in score metrics', () => {
    const entered = round({ id: 'entered:e1-r1:ava', totalOnly: true, score: 76, toPar: 4 });
    expect(metric('score_avg', [round({ score: 72 }), entered]).value).toBe(74);
    expect(metric('to_par_avg', [round({ toPar: 0 }), entered]).value).toBe(2);
  });

  it('WD and DQ rounds are out of averages; a WD says how far the player got', () => {
    const wd = round({ status: 'wd', wdThru: 11, score: null });
    const dq = round({ status: 'dq', score: 70 });
    const markedWd = round({ excluded: 'wd', score: null });
    const markedDq = round({ excluded: 'dq' });
    const coach = round({ excluded: 'coach-excluded' });
    const r = metric('score_avg', [round({ score: 74 }), wd, dq, markedWd, markedDq, coach]);
    expect(r.value).toBe(74);
    expect(r.excluded).toEqual([
      { roundId: wd.id, reason: 'wd', thru: 11 },
      { roundId: dq.id, reason: 'dq' },
      { roundId: markedWd.id, reason: 'wd' },
      { roundId: markedDq.id, reason: 'dq' },
      { roundId: coach.id, reason: 'coach-excluded' },
    ]);
  });

  it('a round with no score, or of a length the app does not score, is listed', () => {
    const noScore = round({ score: null });
    const twelve = round({ holes: 12 });
    expect(metric('score_avg', [noScore, twelve]).excluded).toEqual([
      { roundId: noScore.id, reason: 'no-score' },
      { roundId: twelve.id, reason: 'unsupported-length' },
    ]);
  });
});

/* Stats countable rules ------------------------------------------------------------------------------------------------ */

describe('countable rounds (isScoreCountable and isCountableRound, as Stats applies them)', () => {
  const full = { status: 'completed', holes_played: 18, total_score: 72, front_nine: 36, back_nine: 36, total_putts: 30 };

  it('a fully scored linked round counts everywhere', () => {
    const r = round({ countable: full, holeRows: holes(H2) });
    expect(metric('score_avg', [r]).n).toBe(1);
    expect(metric('birdie_rate', [r]).n).toBe(1);
  });

  it('a linked round posted as a total counts in scores and is out of hole metrics', () => {
    const totalOnly = round({ countable: { ...full, front_nine: null, back_nine: null } });
    expect(metric('score_avg', [totalOnly]).n).toBe(1);
    expect(metric('birdie_rate', [totalOnly]).excluded).toEqual([{ roundId: totalOnly.id, reason: 'totals-only' }]);
    expect(metric('sg_total', [totalOnly]).excluded).toEqual([{ roundId: totalOnly.id, reason: 'totals-only' }]);
  });

  it('a round in progress, a test round, half a round or an implausible total is out of everything', () => {
    const live = round({ countable: { ...full, status: 'in_progress' } });
    const test = round({ countable: { ...full, is_test: true } });
    const half = round({ countable: { ...full, back_nine: null } });
    const silly = round({ countable: { ...full, total_score: 37, front_nine: 18, back_nine: 19 } });
    const r = metric('score_avg', [live, test, half, silly]);
    expect(r.value).toBeNull();
    expect(r.excluded.map((e) => e.reason)).toEqual(['not-finished', 'test-round', 'holes-missing', 'implausible-score']);
  });

  it('an implausible strokes-gained round is out', () => {
    const r = round({ countable: { ...full, strokes_gained_total: 30 } });
    expect(metric('score_avg', [r]).excluded).toEqual([{ roundId: r.id, reason: 'implausible-sg' }]);
  });
});

/* Hole metrics --------------------------------------------------------------------------------------------------------- */

describe('hole metrics', () => {
  const h1 = () => round({ score: 75, toPar: 3, holeRows: holes(H1) });
  const h2 = () => round({ score: 72, toPar: 0, holeRows: holes(H2) });

  it('par-3, par-4 and par-5 scoring: mean to par per hole of that par', () => {
    const rs = [h1(), h2()];
    // Par 3s: (0 + 1 + 0 + 2) + 0 over 8 holes. Par 5s: −1 + 1 over 8. Par 4s: +1 − 1 over 20.
    expect(metric('par3', rs)).toMatchObject({ value: 3 / 8, n: 2, of: 8, solid: false });
    expect(metric('par5', rs)).toMatchObject({ value: 0, of: 8 });
    expect(metric('par4', rs)).toMatchObject({ value: 0, of: 20 });
    expect(metric('par3', rs).perRound.map((p) => [p.value, p.weight])).toEqual([
      [3 / 4, 4],
      [0, 4],
    ]);
  });

  it('birdies or better and bogey avoidance: shares of holes, weighted by holes', () => {
    const rs = [h1(), h2()];
    // Birdies: 2 + 2 of 36. Par or better: 14 + 16 of 36.
    expect(metric('birdie_rate', rs)).toMatchObject({ value: (4 / 36) * 100, made: 4, of: 36 });
    expect(metric('bogey_avoid', rs)).toMatchObject({ value: (30 / 36) * 100, made: 30, of: 36 });
  });

  it('nine-hole rounds are included in hole metrics as nine holes', () => {
    const nine = round({ holes: 9, score: 36, toPar: 0, holeRows: holes([0, 0, 0, -1, 0, 0, 0, 0, 1]) });
    const r = metric('birdie_rate', [h2(), nine]);
    expect(r).toMatchObject({ n: 2, made: 3, of: 27 });
    expect(metric('score_avg', [h2(), nine]).n).toBe(1);
  });

  it('totals-only rounds and coach entries are excluded from hole metrics', () => {
    const entered = round({ id: 'entered:e1-r2:ava', totalOnly: true, score: 74 });
    for (const key of ['par3', 'par4', 'par5', 'birdie_rate', 'bogey_avoid', 'bounce_back', 'gir', 'fir', 'putts'] as const) {
      const r = metric(key, [h2(), entered]);
      expect(r.n, key).toBe(1);
      expect(r.excluded, key).toEqual([{ roundId: entered.id, reason: 'totals-only' }]);
    }
  });

  it('a round without hole rows is listed as having no hole scores', () => {
    const bare = round();
    expect(metric('par4', [bare]).excluded).toEqual([{ roundId: bare.id, reason: 'no-holes' }]);
    expect(metric('bounce_back', [bare]).excluded).toEqual([{ roundId: bare.id, reason: 'no-holes' }]);
    expect(metric('birdie_rate', [bare]).excluded).toEqual([{ roundId: bare.id, reason: 'no-holes' }]);
  });

  it('a nine without a par 5 is neither in nor out of par-5 scoring', () => {
    const nine = round({ holes: 9, holeRows: [{ n: 1, par: 4, score: 4 }, { n: 2, par: 3, score: 3 }] });
    expect(metric('par5', [nine])).toMatchObject({ value: null, n: 0, excluded: [] });
  });

  it('falls back to the round cache for the scoring mix when holes are not loaded', () => {
    const cached = round({ cache: { gir: 10, girOf: 18, fw: 8, fwOf: 14, putts: 31, birdiesPlus: 3, pars: 11 } });
    expect(metric('birdie_rate', [cached])).toMatchObject({ made: 3, of: 18 });
    expect(metric('bogey_avoid', [cached])).toMatchObject({ made: 14, of: 18 });
    const partial = round({ cache: { gir: null, girOf: null, fw: null, fwOf: null, putts: null, birdiesPlus: 3, pars: null } });
    expect(metric('bogey_avoid', [partial]).excluded).toEqual([{ roundId: partial.id, reason: 'no-holes' }]);
  });

  describe('bounce back', () => {
    it('a birdie on the hole after a bogey converts; a bogey on 18 has no next hole and is no chance', () => {
      // H2: bogey on 5 then birdie on 6 (1 of 1); bogey on 18 is not a chance.
      expect(metric('bounce_back', [h2()])).toMatchObject({ value: 100, made: 1, of: 1 });
      // H1: four bogeys, each followed by a par (0 of 4).
      expect(metric('bounce_back', [h1(), h2()])).toMatchObject({ value: 20, made: 1, of: 5 });
    });

    it('follows play order from a shotgun start: 18 leads to 1, and the last hole played has no next', () => {
      const deltas = Array.from({ length: 18 }, () => 0);
      deltas[17] = 1; // bogey on 18
      deltas[0] = -1; // birdie on 1
      deltas[5] = 1; // bogey on 6, the last hole played from a start on 7
      const r = round({ holeRows: holes(deltas), startHole: 7 });
      expect(metric('bounce_back', [r])).toMatchObject({ made: 1, of: 1 });
    });

    it('a missing hole breaks the chain: the next scored hole is not "the hole after"', () => {
      const rows = holes([1, 0, -1, 0, 0, 0, 0, 0, 0]).filter((h) => h.n !== 2);
      const r = round({ holes: 9, holeRows: rows });
      expect(metric('bounce_back', [r])).toMatchObject({ made: 0, of: 0, n: 0 });
    });

    it('a back nine played alone wraps from 18 to 10 on a start from 13', () => {
      const deltas = [-1, 0, 0, 0, 0, 0, 0, 0, 1]; // holes 10..18: birdie on 10, bogey on 18
      const r = round({ holes: 9, holeRows: holes(deltas, 10), startHole: 13 });
      expect(metric('bounce_back', [r])).toMatchObject({ made: 1, of: 1 });
    });

    it('ignores a start hole that is not among the holes', () => {
      const r = round({ holeRows: holes(H2), startHole: 30 });
      expect(metric('bounce_back', [r])).toMatchObject({ made: 1, of: 1 });
    });
  });

  it('greens in regulation: greens hit ÷ greens possible, from holes, else the cache', () => {
    // H1 hits 14 of 18 (par or better); the cached round hits 9 of 18.
    const cached = round({ cache: { gir: 9, girOf: 18, fw: 7, fwOf: 14, putts: null } });
    const none = round({ holeRows: holes(H2, 1, () => ({ gir: null })) });
    const r = metric('gir', [h1(), cached, none]);
    expect(r).toMatchObject({ made: 23, of: 36, n: 2 });
    expect(r.value).toBeCloseTo((23 / 36) * 100, 10);
    expect(r.excluded).toEqual([{ roundId: none.id, reason: 'no-gir' }]);
  });

  it('fairways: par 3s never count, even when marked', () => {
    // H1 on the 14 par 4s and 5s: misses on 2 and 10, so 12 of 14.
    expect(metric('fir', [h1()])).toMatchObject({ made: 12, of: 14 });
    const cached = round({ cache: { gir: null, girOf: null, fw: 7, fwOf: 14, putts: null } });
    expect(metric('fir', [cached])).toMatchObject({ made: 7, of: 14 });
    const none = round({ holeRows: holes(H2, 1, () => ({ fir: null })) });
    expect(metric('fir', [none]).excluded).toEqual([{ roundId: none.id, reason: 'no-fir' }]);
  });
});

/* Putts and strokes gained --------------------------------------------------------------------------------------------- */

describe('putts and strokes gained', () => {
  it('putts per round: the holes’ putts, else the cache; zero is not recorded; a nine is out', () => {
    const fromHoles = round({ holeRows: holes(H2, 1, (h) => ({ putts: h.n === 1 ? 1 : 2 })) }); // 35
    const fromCache = round({ cache: { gir: null, girOf: null, fw: null, fwOf: null, putts: 29 } });
    const zero = round({ cache: { gir: null, girOf: null, fw: null, fwOf: null, putts: 0 } });
    const partialHoles = round({ holeRows: holes(H2, 1, (h) => ({ putts: h.n === 4 ? null : 2 })), cache: { gir: null, girOf: null, fw: null, fwOf: null, putts: 33 } });
    const nine = round({ holes: 9, holeRows: holes([0, 0, 0, 0, 0, 0, 0, 0, 0]) });
    const r = metric('putts', [fromHoles, fromCache, zero, partialHoles, nine]);
    expect(r.value).toBe((35 + 29 + 33) / 3);
    expect(r.excluded).toEqual([
      { roundId: zero.id, reason: 'no-putts' },
      { roundId: nine.id, reason: 'nine-holes' },
    ]);
  });

  it('strokes gained: mean per 18-hole round with shot data, solid from 3 rounds', () => {
    const sg = (total: number | null, putt: number | null = 0.2) => ({ total, ott: 0.5, app: -0.3, arg: 0.1, putt });
    const noShots = round({ sg: null });
    const marked = round({ sg: sg(5), excluded: 'no-shot-data' });
    const rs = [round({ sg: sg(1) }), round({ sg: sg(-0.5, null) }), round({ sg: sg(2) }), noShots, marked];
    const total = metric('sg_total', rs);
    expect(total.value).toBeCloseTo(2.5 / 3, 10);
    expect(total.solid).toBe(true);
    expect(total.excluded).toEqual([
      { roundId: noShots.id, reason: 'no-shot-data' },
      { roundId: marked.id, reason: 'no-shot-data' },
    ]);
    expect(metric('sg_putt', rs)).toMatchObject({ value: 0.2, n: 2, solid: false });
    expect(metric('sg_ott', rs).value).toBe(0.5);
    expect(metric('sg_app', rs).value).toBe(-0.3);
    expect(metric('sg_arg', rs).value).toBeCloseTo(0.1, 10);
  });

  it('a nine-hole round never adds half a round of strokes gained', () => {
    const nine = round({ holes: 9, sg: { total: 3, ott: 0, app: 0, arg: 0, putt: 0 } });
    expect(metric('sg_total', [nine]).excluded).toEqual([{ roundId: nine.id, reason: 'nine-holes' }]);
  });
});

/* Counting metrics ----------------------------------------------------------------------------------------------------- */

describe('counting metrics (precomputed counting sets)', () => {
  it('counting rate: counted ÷ played as a lineup player in complete team rounds', () => {
    const rs = [
      event(1),
      event(2),
      event(3, { counting: counting({ counted: false }) }),
      round({ context: 'event', eventId: 'e2', roundEventId: 'e2-r1', roundNumber: 1, role: 'lineup', counting: counting() }),
      round({ context: 'event', eventId: 'e2', roundEventId: 'e2-r2', roundNumber: 2, role: 'lineup', counting: counting() }),
    ];
    expect(countRate(rs)).toMatchObject({ value: 80, made: 4, of: 5, n: 5, solid: true });
    expect(countRate(rs.slice(0, 3)).solid).toBe(false);
    expect(countRate([]).value).toBeNull();
  });

  it('individuals, alternates, B squads, WD, DQ and incomplete team rounds are out of counting metrics', () => {
    const ind = event(1, { role: 'individual', counting: null });
    const markedInd = event(1, { role: undefined, excluded: 'individual', counting: null });
    const alt = event(1, { role: 'alternate', counting: null });
    const b = event(1, { squad: 'b' });
    const wd = event(2, { status: 'wd', wdThru: 11, score: null });
    const dq = event(2, { status: 'dq' });
    const live = event(3, { counting: null });
    const coach = event(3, { excluded: 'coach-excluded' });
    const practice = round({ context: 'practice' });
    const r = countRate([event(1), ind, markedInd, alt, b, wd, dq, live, coach, practice]);
    expect(r).toMatchObject({ value: 100, n: 1 });
    expect(r.excluded).toEqual([
      { roundId: ind.id, reason: 'individual' },
      { roundId: markedInd.id, reason: 'individual' },
      { roundId: alt.id, reason: 'not-lineup' },
      { roundId: b.id, reason: 'b-squad' },
      { roundId: wd.id, reason: 'wd', thru: 11 },
      { roundId: dq.id, reason: 'dq' },
      { roundId: live.id, reason: 'team-incomplete' },
      { roundId: coach.id, reason: 'coach-excluded' },
    ]);
    expect(gapToDrop([ind, alt, b]).value).toBeNull();
  });

  it('an alternate who played in the lineup after a substitution counts as a lineup player', () => {
    // The loader marks the role per event round, so a substitute is `lineup` in the rounds they played.
    expect(countRate([event(2, { playerId: 'priya', role: 'lineup' })])).toMatchObject({ value: 100, n: 1 });
  });

  it('gap to drop: mean of (drop − own score) over counting rounds; dropped rounds are not in it', () => {
    const rs = [
      event(1, { score: 70, counting: counting({ drop: 75 }) }),
      event(2, { score: 72, counting: counting({ drop: 74 }) }),
      event(3, { score: 76, counting: counting({ counted: false, line: 73, drop: 76 }) }),
    ];
    expect(gapToDrop(rs)).toMatchObject({ value: 3.5, n: 2, solid: false });
    expect(gapToDrop(rs).perRound.map((p) => p.value)).toEqual([5, 2]);
  });

  it('gap to drop with dropped rounds: a dropped round adds (line − own score), zero or below', () => {
    const rs = [
      event(1, { score: 70, counting: counting({ drop: 75 }) }),
      event(2, { score: 72, counting: counting({ drop: 74 }) }),
      event(3, { score: 76, counting: counting({ counted: false, line: 73, drop: 76 }) }),
    ];
    expect(gapToDrop(rs, { includeDropped: true })).toMatchObject({ value: (5 + 2 - 3) / 3, n: 3 });
  });

  it('gap to drop: a counting round whose drop was a WD has no drop score and is listed', () => {
    const noDrop = event(1, { counting: counting({ drop: null }) });
    expect(gapToDrop([noDrop]).excluded).toEqual([{ roundId: noDrop.id, reason: 'no-drop' }]);
  });

  it('a tie on the counting line gives a gap of zero', () => {
    expect(gapToDrop([event(1, { score: 74, counting: counting({ tie: true, drop: 74 }) })]).value).toBe(0);
  });

  it('drop score differential (team): dropped mean less counting mean, per complete team round', () => {
    const team = (re: string, scores: number[], dropped: Array<number | null>) => [
      ...scores.map((s, i) => round({ playerId: `p${i}`, roundEventId: re, eventId: 'e1', role: 'lineup', score: s, counting: counting() })),
      ...dropped.map((s, i) =>
        round({ playerId: `d${i}`, roundEventId: re, eventId: 'e1', role: 'lineup', score: s, status: s == null ? 'wd' : 'ok', counting: counting({ counted: false }) }),
      ),
    ];
    const rs = [
      ...team('e1-r1', [70, 71, 72, 73], [75]), // 75 − 71.5 = 3.5
      ...team('e1-r2', [68, 70, 71, 72], [74]), // 74 − 70.25 = 3.75
      ...team('e1-r3', [70, 70, 71, 71], [null]), // drop is a WD: no dropped score
      round({ playerId: 'solo', roundEventId: 'e1-r1', eventId: 'e1', role: 'individual', score: 60, counting: null }),
    ];
    const r = dropDiff(rs);
    expect(r.value).toBeCloseTo(3.625, 10);
    expect(r.n).toBe(2);
    expect(r.solid).toBe(false);
    expect(r.excluded).toEqual([{ roundId: 'e1-r3', reason: 'no-drop' }]);
    expect(metric('drop_diff', rs).value).toBeCloseTo(3.625, 10);
  });
});

/* Event-shape metrics -------------------------------------------------------------------------------------------------- */

describe('36-hole-day split', () => {
  it('second round less first round on each 36-hole day; single-round days are out of scope', () => {
    const rs = [
      event(1, { date: '2026-10-18', score: 72 }),
      event(2, { date: '2026-10-18', score: 75 }),
      event(3, { date: '2026-10-19', score: 70 }),
      round({ eventId: 'e2', roundNumber: 1, date: '2026-09-20', score: 71 }),
      round({ eventId: 'e2', roundNumber: 2, date: '2026-09-20', score: 72 }),
      round({ context: 'practice', date: '2026-09-21', score: 70 }),
    ];
    const r = r36Split(rs);
    expect(r).toMatchObject({ value: 2, n: 2, excluded: [] });
    expect(metric('r36_split', rs).value).toBe(2);
  });

  it('a WD in the afternoon leaves the morning round unpaired', () => {
    const am = event(1, { date: '2026-10-18' });
    const pm = event(2, { date: '2026-10-18', status: 'wd', wdThru: 4, score: null });
    expect(r36Split([am, pm]).excluded).toEqual([
      { roundId: pm.id, reason: 'wd', thru: 4 },
      { roundId: am.id, reason: 'not-paired' },
    ]);
  });

  it('pairs each player’s own day', () => {
    const rs = [
      event(1, { playerId: 'ava', date: '2026-10-18', score: 70 }),
      event(2, { playerId: 'ava', date: '2026-10-18', score: 74 }),
      event(1, { playerId: 'sofia', date: '2026-10-18', score: 75 }),
      event(2, { playerId: 'sofia', date: '2026-10-18', score: 73 }),
    ];
    expect(r36Split(rs, { subject: 'team' }).value).toBe(1);
  });
});

describe('closing nine', () => {
  const back = (toPar: number) => {
    const deltas = Array.from({ length: 18 }, () => 0);
    deltas[9] = toPar;
    return holes(deltas);
  };

  it('final-round back nine to par less the back nine to par of the other rounds', () => {
    const rs = [
      event(3, { holeRows: back(2) }),
      round({ eventId: 'e2', roundNumber: 2, roundsInEvent: 2, holeRows: back(1) }),
      event(1, { holeRows: back(0) }),
      round({ holeRows: back(1) }),
      round({ totalOnly: true, nines: { front: 36, back: 37, frontPar: 36, backPar: 36 } }), // +1, entered with its nines
    ];
    const r = closingNine(rs);
    // Finals: 2 and 1 (1.5). Baseline: 0, 1, 1 (2/3).
    expect(r.value).toBeCloseTo(1.5 - 2 / 3, 10);
    expect(r.n).toBe(2);
    expect(r.solid).toBe(false);
    expect(r.perRound.map((p) => p.value)).toEqual([2 - 2 / 3, 1 - 2 / 3]);
  });

  it('is solid once three final rounds and three baseline rounds exist', () => {
    const finals = [0, 1, 2].map((i) => round({ eventId: `x${i}`, roundNumber: 3, roundsInEvent: 3, holeRows: back(1) }));
    const base = [0, 1, 2].map(() => round({ holeRows: back(0) }));
    expect(closingNine([...finals, ...base])).toMatchObject({ value: 1, n: 3, solid: true });
    expect(closingNine([...finals, ...base.slice(0, 2)]).solid).toBe(false);
  });

  it('rounds with no back nine are listed; no final round or no baseline leaves no value', () => {
    const bare = round();
    const nine = round({ holes: 9 });
    const r = closingNine([bare, nine, round({ holeRows: back(1) })]);
    expect(r.value).toBeNull();
    expect(r.excluded).toEqual([
      { roundId: bare.id, reason: 'no-back-nine' },
      { roundId: nine.id, reason: 'nine-holes' },
    ]);
    expect(closingNine([event(3, { holeRows: back(2) })])).toMatchObject({ value: null, n: 1 });
    expect(closingNine([event(3, { holeRows: back(2) })]).perRound[0]?.value).toBe(2);
    expect(metric('closing9', []).value).toBeNull();
  });
});

/* Subjects ------------------------------------------------------------------------------------------------------------- */

describe('subjects', () => {
  it('individuals count in their own player metrics and are out of a team pool, as are B squads', () => {
    const ind = event(1, { role: 'individual', score: 68, counting: null });
    const bTeam = event(1, { playerId: 'jonah', squad: 'b', score: 80 });
    const a = event(1, { playerId: 'sofia', score: 72 });
    expect(metric('score_avg', [ind]).value).toBe(68);
    const team = metric('score_avg', [ind, bTeam, a], { subject: 'team' });
    expect(team.value).toBe(72);
    expect(team.excluded).toEqual([
      { roundId: ind.id, reason: 'individual' },
      { roundId: bTeam.id, reason: 'b-squad' },
    ]);
    expect(metric('birdie_rate', [ind], { subject: 'team' }).excluded).toEqual([{ roundId: ind.id, reason: 'individual' }]);
  });

  it('matched team subjects keep only players on both sides; pooled keeps everyone', () => {
    const a = [round({ playerId: 'ava' }), round({ playerId: 'theo' })];
    const b = [round({ playerId: 'ava' }), round({ playerId: 'sofia' })];
    const m = matchRounds(a, b);
    expect(m.players).toEqual(['ava']);
    expect(m.a.map((r) => r.playerId)).toEqual(['ava']);
    expect(m.b.map((r) => r.playerId)).toEqual(['ava']);
    expect(m.excluded.a).toEqual([{ roundId: a[1]?.id, reason: 'not-matched' }]);
    expect(m.excluded.b).toEqual([{ roundId: b[1]?.id, reason: 'not-matched' }]);
    expect(exclusionWords({ reason: 'not-matched' })).toBe('Excluded: player not on both sides');
  });

  it('computes the whole catalogue over one window', () => {
    const all = allMetrics([round({ holeRows: holes(H2), sg: { total: 1, ott: 0, app: 0, arg: 0, putt: 1 } })]);
    expect(Object.keys(all)).toEqual(METRIC_KEYS);
    for (const key of METRIC_KEYS) expect(all[key].key).toBe(key);
    expect(all.score_avg.value).toBe(72);
    expect(all.count_rate.value).toBeNull();
  });

  it('a non-finite value is reported as no value', () => {
    expect(metric('vs_field', [round({ vsField: Number.POSITIVE_INFINITY })]).value).toBeNull();
  });
});
