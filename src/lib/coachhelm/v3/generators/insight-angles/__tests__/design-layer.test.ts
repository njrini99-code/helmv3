import { beforeEach, describe, expect, it, vi } from 'vitest';

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => flag.on) }));
// The generators' loader is server-only; the call-site test never runs them.
vi.mock('../load-angle-data', () => ({
  loadAngleData: vi.fn(),
  loadTeamPeerRounds: vi.fn(),
}));

import {
  ANGLE_FAMILIES,
  INSIGHT_ANGLES_FLAG,
  OBSERVED_MIN_EVENTS,
  angleTest,
  floorGapBootstrapSe,
  meetsObservedFloors,
  newestFirstIds,
  normalSf,
  welchDf,
  welchSe,
  type AngleFamilyId,
} from '../angle-data';
import { insightAngleGenerators } from '../index';
import { isFlagEnabled } from '@/lib/flags/is-enabled';

describe('ANGLE_FAMILIES (02 §7, 04 §2)', () => {
  const ids = Object.keys(ANGLE_FAMILIES) as AngleFamilyId[];

  it('every family holds at least the 3-round floor and a per-side floor that fits its total', () => {
    for (const id of ids) {
      const f = ANGLE_FAMILIES[id];
      expect(f.family).toBe(id);
      expect(f.round_floor).toBeGreaterThanOrEqual(3);
      if (f.per_side_floor !== null && f.gap_kind === 'mean' && f.benchmark === 'self_other') {
        expect(f.floor).toBe(f.per_side_floor * 2);
      }
      expect(f.citations.length).toBeGreaterThan(0);
    }
  });

  it('tee-miss cost and fairway exposure are rough estimates; bad-day floor caps at Likely', () => {
    expect(ANGLE_FAMILIES.tee_miss_cost.impact).toBe('rough_estimate');
    expect(ANGLE_FAMILIES.lie_fairway_exposure.impact).toBe('rough_estimate');
    expect(ANGLE_FAMILIES.bad_day_floor.cap).toBe('likely');
    // A rough estimate can never sit above Likely (04 §1.1: estimated is false at Observed or above).
    for (const id of ids) {
      if (ANGLE_FAMILIES[id].impact === 'rough_estimate') expect(['likely', 'working_hypothesis']).toContain(ANGLE_FAMILIES[id].cap);
    }
  });

  it('every metric is distinct (one Slice 1 registry entry each)', () => {
    const metrics = ids.map((id) => ANGLE_FAMILIES[id].metric);
    expect(new Set(metrics).size).toBe(metrics.length);
  });
});

describe('statistics helpers', () => {
  it('normalSf matches the one-sided normal tail', () => {
    expect(normalSf(0)).toBeCloseTo(0.5, 6);
    expect(normalSf(1.645)).toBeCloseTo(0.05, 3);
    expect(normalSf(-1.645)).toBeCloseTo(0.95, 3);
    expect(normalSf(Infinity)).toBe(0);
  });

  it('angleTest carries z, its one-sided p and the family pass line', () => {
    expect(angleTest(2)).toEqual({ statistic: 'z', z: 2, p_one_sided: 0.0228, min_z: 1.645 });
    expect(angleTest(null).p_one_sided).toBeNull();
  });

  it('welchSe and welchDf are defined only with two values a side', () => {
    expect(welchSe([1], [1, 2])).toBeNull();
    expect(welchDf([1, 2, 3], [2, 4, 6, 8])).toBeGreaterThanOrEqual(1);
    expect(welchSe([1, 2, 3], [2, 4, 6, 8])).toBeCloseTo(Math.sqrt(1 / 3 + (20 / 3) / 4), 6);
  });

  it('the bad-day bootstrap SE is deterministic and positive', () => {
    const vals = [2, 3, 4, 4, 5, 6, 7, 8, 10, 14, 3, 5];
    const a = floorGapBootstrapSe(vals);
    expect(a).not.toBeNull();
    expect(a!).toBeGreaterThan(0);
    expect(floorGapBootstrapSe(vals)).toBe(a);
    expect(floorGapBootstrapSe([1, 2])).toBeNull();
  });

  it('Observed floors (02 §6): ≥ 10 events over ≥ 3 rounds, leading path ≥ 4 and ≥ 30%', () => {
    expect(meetsObservedFloors({ occurrences: 3, of: 10, distinct_rounds: 3 })).toBe(false);
    expect(meetsObservedFloors({ occurrences: 4, of: 10, distinct_rounds: 3 })).toBe(true);
    expect(meetsObservedFloors({ occurrences: 4, of: 14, distinct_rounds: 3 })).toBe(false);
    expect(meetsObservedFloors({ occurrences: 9, of: OBSERVED_MIN_EVENTS - 1, distinct_rounds: 5 })).toBe(false);
    expect(meetsObservedFloors({ occurrences: 6, of: 12, distinct_rounds: 2 })).toBe(false);
  });

  it('newestFirstIds orders by date whatever the input order', () => {
    expect(
      newestFirstIds([
        { id: 'a', date: '2026-01-02' },
        { id: 'b', date: '2026-03-01' },
        { id: 'c', date: '2026-02-01' },
      ]),
    ).toEqual(['b', 'c', 'a']);
  });
});

describe('insightAngleGenerators (the one orchestrator call site)', () => {
  beforeEach(() => vi.mocked(isFlagEnabled).mockClear());

  it('returns no entries while the flag is off, so no angle generator runs', () => {
    flag.on = false;
    expect(insightAngleGenerators('p1')).toEqual([]);
    expect(isFlagEnabled).toHaveBeenCalledWith(INSIGHT_ANGLES_FLAG);
  });

  it('returns the five angle generators when the flag is on', () => {
    flag.on = true;
    const entries = insightAngleGenerators('p1');
    expect(entries.map((e) => e.name)).toEqual([
      'v3.angles.lieApproach',
      'v3.angles.badDayFloor',
      'v3.angles.threePuttChain',
      'v3.angles.teeMissCost',
      'v3.angles.approachMissCompass',
    ]);
    flag.on = false;
  });
});
