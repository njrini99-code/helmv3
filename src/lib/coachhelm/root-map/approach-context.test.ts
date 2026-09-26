import { describe, it, expect } from 'vitest';
import { getExpectedStrokes } from '@/lib/utils/golf-stats-calculator-shots';
import {
  BAND_SG_RECONCILE_TOLERANCE,
  bandOfMetric,
  buildApproachWhyView,
  contextPathText,
  sgNormalizeLie,
  shotSgForRound,
  sizeApproachBands,
  type RawHoleRow,
  type RawShotRow,
} from './approach-context';
import type { HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';

let n = 0;
function row(over: Partial<RawShotRow>): RawShotRow {
  n += 1;
  return {
    id: `s${n}`,
    round_id: 'r1',
    hole_id: 'h1',
    hole_number: 1,
    shot_number: 1,
    shot_type: 'approach',
    club_type: null,
    lie_before: 'fairway',
    lie_after: 'green',
    result: 'green',
    distance_to_hole_before: 150,
    distance_unit_before: 'yards',
    distance_to_hole_after: 20,
    distance_unit_after: 'feet',
    is_penalty: false,
    putt_made: null,
    miss_direction: null,
    created_at: null,
    ...over,
  };
}

const PARS = new Map([['h1', 4], ['h3', 3]]);

describe('sgNormalizeLie (public.sg_normalize_lie)', () => {
  it('maps the DB vocabulary and defaults unknown/null to fairway', () => {
    expect(sgNormalizeLie('bunker')).toBe('sand');
    expect(sgNormalizeLie('fringe')).toBe('green');
    expect(sgNormalizeLie('primary_rough')).toBe('rough');
    expect(sgNormalizeLie('water')).toBe('fairway');
    expect(sgNormalizeLie(null)).toBe('fairway');
  });
});

describe('shotSgForRound (port of calculate_round_strokes_gained)', () => {
  it('an approach from 150 yd to 20 ft: E(fairway,150) − E(green,20 ft) − 1, filed under 125–175', () => {
    const [s] = shotSgForRound([row({})], PARS, 1);
    const want = getExpectedStrokes('fairway', 150) - getExpectedStrokes('green', 20 / 3, 20) - 1;
    expect(s!.category).toBe('approach');
    expect(s!.key).toBe('125_175ft');
    expect(s!.sg).toBeCloseTo(want, 6);
  });

  it('missing finish falls back to the NEXT shot (LEAD), missing next → no contribution', () => {
    const a = row({ shot_number: 2, distance_to_hole_after: null, lie_after: null, result: 'rough', distance_to_hole_before: 190 });
    const b = row({ shot_number: 3, shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 30, distance_unit_before: 'yards' });
    const out = shotSgForRound([b, a], PARS, 1);
    const sa = out.find((x) => x.shotId === a.id)!;
    expect(sa.key).toBe('175_plus_ft');
    expect(sa.sg).toBeCloseTo(getExpectedStrokes('fairway', 190) - getExpectedStrokes('rough', 30) - 1, 6);
    const lone = shotSgForRound([row({ distance_to_hole_after: null, lie_after: null, result: 'rough' })], PARS, 1);
    expect(lone).toHaveLength(0);
  });

  it('a par-3 tee-lie penalty is filed as an approach penalty (−1); a par-4 one is off the tee', () => {
    const p3 = shotSgForRound([row({ hole_id: 'h3', is_penalty: true, lie_before: 'tee', shot_type: 'tee' })], PARS, 1)[0]!;
    expect(p3).toMatchObject({ category: 'approach', key: 'penalty', sg: -1 });
    const p4 = shotSgForRound([row({ is_penalty: true, lie_before: 'tee', shot_type: 'tee' })], PARS, 1)[0]!;
    expect(p4.category).toBe('off_tee');
  });

  it('skips shots with no hole_id or no positive start distance (the DB join/WHERE)', () => {
    expect(shotSgForRound([row({ hole_id: null })], PARS, 1)).toHaveLength(0);
    expect(shotSgForRound([row({ distance_to_hole_before: 0 })], PARS, 1)).toHaveLength(0);
  });
});

describe('sizeApproachBands', () => {
  const holes: RawHoleRow[] = [{ id: 'h1', round_id: 'r1', hole_number: 1, par: 4, yardage: 400, score: 4, penalty_strokes: 0, putts: 2, gir: true }];
  const shots = [row({})];
  const sg = shotSgForRound(shots, PARS, 1)[0]!.sg;

  it('reconciles when the stored approach SG matches the recomputed sum (per 18)', () => {
    const s = sizeApproachBands([{ id: 'r1', date: '2026-09-01', holesPlayed: 9, storedApproach: sg }], shots, holes, 1)!;
    expect(s.perRound['125_175ft']).toBeCloseTo(sg * 2, 6);
    expect(s.reconciled).toBe(true);
  });

  it('does not reconcile beyond the tolerance (the map then keeps the bands unsized)', () => {
    const s = sizeApproachBands(
      [{ id: 'r1', date: '2026-09-01', holesPlayed: 18, storedApproach: sg - BAND_SG_RECONCILE_TOLERANCE - 0.01 }],
      shots,
      holes,
      1,
    )!;
    expect(s.reconciled).toBe(false);
  });

  it('null when no round carries a stored approach SG', () => {
    expect(sizeApproachBands([{ id: 'r1', date: '2026-09-01', holesPlayed: 18, storedApproach: null }], shots, holes, 1)).toBeNull();
  });
});

describe('buildApproachWhyView', () => {
  function fact(r: string, h: number, onGreen: boolean, dir: string | null): ShotFact {
    return {
      round_id: r, hole_number: h, shot_number: 2, shot_type: 'approach', club_type: null, intent: 'unknown',
      distance_to_hole_before_feet: 570, distance_to_hole_after_feet: onGreen ? 20 : 30,
      lie_before: 'fairway', lie_after: onGreen ? 'green' : 'rough', result: onGreen ? 'green' : 'rough',
      is_penalty: false, putt_made: null, miss_direction: dir, observed_at: '2026-09-01T00:00:00Z',
    };
  }
  const holes: HoleContext[] = [];
  for (let r = 0; r < 4; r++) for (let h = 1; h <= 4; h++) holes.push({ round_id: `r${r}`, course_id: null, hole_number: h, par: h === 4 ? 3 : 4, yardage: h === 4 ? 200 : 440, total_strokes: 4, penalty_strokes: 0, putts: 2, gir: null });

  it('grid + compass when the gates pass; the compass counts the chosen slice', () => {
    const facts: ShotFact[] = [];
    for (let r = 0; r < 4; r++) for (let h = 1; h <= 4; h++) facts.push(fact(`r${r}`, h, h >= 3, h < 3 ? 'short_right' : null));
    const v = buildApproachWhyView('175_plus_ft', facts, holes, 4, [], null);
    expect(v.narrowing.path).toEqual(['175+ yd', 'long par 4s', 'short-right']);
    expect(v.grid?.selectedLabel).toBe('long par 4s');
    expect(v.compass?.population).toBe('long par 4s from 175+ yd');
    expect(v.compass?.quadrants.short_right).toBe(8);
    expect(v.strokesLost).toBeNull();
  });

  it('no compass when too few misses carry a direction; no grid below the population floor', () => {
    const facts: ShotFact[] = [];
    for (let r = 0; r < 4; r++) for (let h = 1; h <= 4; h++) facts.push(fact(`r${r}`, h, h >= 3, null));
    const v = buildApproachWhyView('175_plus_ft', facts, holes, 4, [], null);
    expect(v.compass).toBeNull();
    const thin = buildApproachWhyView('175_plus_ft', facts.slice(0, 4), holes, 1, [], null);
    expect(thin.grid).toBeNull();
  });

  it('strokesLost only from a reconciled sizing with a losing band', () => {
    const sizing = { rounds: 4, perRound: { '50_125ft': 0.1, '125_175ft': 0, '175_plus_ft': -0.4, inside_50: 0, penalty: 0 }, recomputed: -0.3, stored: -0.3, reconciled: true };
    expect(buildApproachWhyView('175_plus_ft', [], holes, 4, [], sizing).strokesLost).toBeCloseTo(0.4);
    expect(buildApproachWhyView('50_125ft', [], holes, 4, [], sizing).strokesLost).toBeNull();
    expect(buildApproachWhyView('175_plus_ft', [], holes, 4, [], { ...sizing, reconciled: false }).strokesLost).toBeNull();
  });
});

describe('helpers', () => {
  it('bandOfMetric / contextPathText', () => {
    expect(bandOfMetric('approach_proximity_175_plus_ft')).toBe('175_plus_ft');
    expect(bandOfMetric('sg_ott')).toBeNull();
    expect(contextPathText(['175+ yd'])).toBeNull();
    expect(contextPathText(['175+ yd', 'par 4s', 'short'])).toBe('175+ yd → par 4s → short');
  });
});
