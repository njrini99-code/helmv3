import { describe, it, expect } from 'vitest';
import { getExpectedStrokes } from '@/lib/utils/golf-stats-calculator-shots';
import { sgNormalizeLie, shotSgForRound, type RawShotRow } from '../shot-sg';

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
  it('an approach from 150 yd to 20 ft: E(fairway,150) − E(green,20 ft) − 1', () => {
    const [s] = shotSgForRound([row({})], PARS, 1);
    const want = getExpectedStrokes('fairway', 150) - getExpectedStrokes('green', 20 / 3, 20) - 1;
    expect(s!.category).toBe('approach');
    expect(s!.sg).toBeCloseTo(want, 6);
  });

  it('missing finish falls back to the NEXT shot (LEAD), missing next → no contribution', () => {
    const a = row({ shot_number: 2, distance_to_hole_after: null, lie_after: null, result: 'rough', distance_to_hole_before: 190 });
    const b = row({ shot_number: 3, shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 30, distance_unit_before: 'yards' });
    const out = shotSgForRound([b, a], PARS, 1);
    const sa = out.find((x) => x.shotId === a.id)!;
    expect(sa.sg).toBeCloseTo(getExpectedStrokes('fairway', 190) - getExpectedStrokes('rough', 30) - 1, 6);
    const lone = shotSgForRound([row({ distance_to_hole_after: null, lie_after: null, result: 'rough' })], PARS, 1);
    expect(lone).toHaveLength(0);
  });

  it('a par-3 tee-lie penalty is filed as an approach penalty (−1); a par-4 one is off the tee', () => {
    const p3 = shotSgForRound([row({ hole_id: 'h3', is_penalty: true, lie_before: 'tee', shot_type: 'tee' })], PARS, 1)[0]!;
    expect(p3).toMatchObject({ category: 'approach', sg: -1 });
    const p4 = shotSgForRound([row({ is_penalty: true, lie_before: 'tee', shot_type: 'tee' })], PARS, 1)[0]!;
    expect(p4.category).toBe('off_tee');
  });

  it('skips shots with no hole_id or no positive start distance (the DB join/WHERE)', () => {
    expect(shotSgForRound([row({ hole_id: null })], PARS, 1)).toHaveLength(0);
    expect(shotSgForRound([row({ distance_to_hole_before: 0 })], PARS, 1)).toHaveLength(0);
  });
});
