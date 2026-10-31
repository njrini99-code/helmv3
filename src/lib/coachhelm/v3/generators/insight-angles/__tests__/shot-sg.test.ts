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

describe('shotSgForRound endpoint option (20260930150000 nx rule)', () => {
  const E = (lie: string, yd: number) => (lie === 'green' ? getExpectedStrokes('green', yd, yd * 3, 1) : getExpectedStrokes(lie, yd, undefined, 1));

  it('next_shot_start prices a shot to the next non-penalty start, skipping penalty rows; the default keeps its own finish', () => {
    const appr = row({ shot_number: 1, distance_to_hole_after: 20, distance_unit_after: 'feet', lie_after: 'green' });
    const pen = row({ shot_number: 2, shot_type: 'penalty', is_penalty: true, lie_before: 'rough', distance_to_hole_before: 30 });
    const chip = row({ shot_number: 3, shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 12, lie_after: 'green', distance_to_hole_after: 6, distance_unit_after: 'feet' });
    const shots = [appr, pen, chip];
    const own = shotSgForRound(shots, PARS, 1).find((x) => x.shotId === appr.id)!;
    expect(own.sg).toBeCloseTo(E('fairway', 150) - E('green', 20 / 3) - 1, 6);
    const nx = shotSgForRound(shots, PARS, 1, { endpoint: 'next_shot_start' }).find((x) => x.shotId === appr.id)!;
    expect(nx.sg).toBeCloseTo(E('fairway', 150) - E('rough', 12) - 1, 6);
  });

  it('next_shot_start falls back to the own finish on the last shot of a hole', () => {
    const last = row({ distance_to_hole_after: 30, distance_unit_after: 'feet', lie_after: 'green' });
    const [s] = shotSgForRound([last], PARS, 1, { endpoint: 'next_shot_start' });
    expect(s!.sg).toBeCloseTo(E('fairway', 150) - E('green', 10) - 1, 6);
  });
});

describe('next_shot_start also ports held 20261023170000 (other curve, recovery tap)', () => {
  const opts = { endpoint: 'next_shot_start' as const };
  // Par 4: drive to 'other' 150, punch to fairway 90, wedge to 20 ft.
  function hole(flag: boolean | null, withDrop = false): RawShotRow[] {
    const drive = row({ id: 'd', shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400,
      lie_after: 'other', result: 'other', distance_to_hole_after: 150, distance_unit_after: 'yards', lie_after_recovery: flag });
    const drop = row({ id: 'p', shot_number: 2, shot_type: 'penalty', is_penalty: true, lie_before: 'other',
      distance_to_hole_before: 150, lie_after: 'other', distance_to_hole_after: 150, distance_unit_after: 'yards' });
    const off = withDrop ? 1 : 0;
    const punch = row({ id: 'x', shot_number: 2 + off, lie_before: 'other', distance_to_hole_before: 150,
      lie_after: 'fairway', result: 'fairway', distance_to_hole_after: 90, distance_unit_after: 'yards' });
    const wedge = row({ id: 'w', shot_number: 3 + off, lie_before: 'fairway', distance_to_hole_before: 90 });
    return withDrop ? [drive, drop, punch, wedge] : [drive, punch, wedge];
  }
  const sgOf = (rows: RawShotRow[], o = opts) => new Map(shotSgForRound(rows, PARS, 1, o).map((s) => [s.shotId, s.sg]));

  it('keeps other and recovery only for the held curve', () => {
    expect(sgNormalizeLie('other')).toBe('fairway');
    expect(sgNormalizeLie('other', 'held')).toBe('other');
    expect(sgNormalizeLie('recovery', 'held')).toBe('recovery');
    expect(sgNormalizeLie('water', 'held')).toBe('fairway');
  });

  it('prices other on its own curve with next_shot_start, as fairway with own_finish', () => {
    const held = sgOf(hole(null));
    expect(held.get('x')).toBeCloseTo(getExpectedStrokes('other', 150) - getExpectedStrokes('fairway', 90) - 1, 6);
    const live = sgOf(hole(null), {} as typeof opts);
    expect(live.get('x')).toBeCloseTo(getExpectedStrokes('fairway', 150) - getExpectedStrokes('fairway', 90) - 1, 6);
  });

  it('a blocked tap moves the punch-out to the recovery curve and charges the drive', () => {
    const sg = sgOf(hole(true));
    expect(sg.get('d')).toBeCloseTo(getExpectedStrokes('tee', 400) - getExpectedStrokes('recovery', 150) - 1, 6);
    expect(sg.get('x')).toBeCloseTo(getExpectedStrokes('recovery', 150) - getExpectedStrokes('fairway', 90) - 1, 6);
    const plain = sgOf(hole(false));
    expect(sg.get('d')! + sg.get('x')!).toBeCloseTo(plain.get('d')! + plain.get('x')!, 6);
  });

  it('a penalty drop after the blocked drive clears the tap', () => {
    const sg = sgOf(hole(true, true));
    expect(sg.get('d')).toBeCloseTo(getExpectedStrokes('tee', 400) - getExpectedStrokes('other', 150) - 1, 6);
    expect(sg.get('x')).toBeCloseTo(getExpectedStrokes('other', 150) - getExpectedStrokes('fairway', 90) - 1, 6);
  });
});
