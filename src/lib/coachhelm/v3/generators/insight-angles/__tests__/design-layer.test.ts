import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => flag.on) }));
// The generators' loader is server-only; these tests inject stub loaders.
vi.mock('../load-angle-data', () => ({ createAngleLoaders: vi.fn() }));
// Any database write or sweep would go through the admin client.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('no database in this test');
  }),
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
import { angleReadFamilyKey } from '../angle-generator';
import { FAMILY_FLOORS, evaluateReadFloor } from '@/lib/coachhelm/v3/engine/read-floors';
import { familyFor } from '@/lib/coachhelm/v3/support/families';
import { createAngleLoaders } from '../load-angle-data';
import { ApproachMissCompassGenerator } from '../approach-miss-compass';
import { BadDayFloorGenerator } from '../bad-day-floor';
import { LieApproachGenerator } from '../lie-approach';
import { TeeMissCostGenerator } from '../tee-miss-cost';
import { ThreePuttChainGenerator } from '../three-putt-chain';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { createAdminClient } from '@/lib/supabase/admin';
import { METRIC_IDS, getMetricDirection } from '@/lib/coachhelm/v3/metrics/registry';
import { lookupMetricSource } from '@/lib/coachhelm/v3/causality/metric-sources';
import { PLAYER, mkData, stubLoaders } from './fixtures';

/** Every `metric: '<id>'` literal a producer outside the angles writes (src/lib, tests excluded). */
function producerMetricIds(): Set<string> {
  const libRoot = join(process.cwd(), 'src', 'lib');
  const anglesDir = join(libRoot, 'coachhelm', 'v3', 'generators', 'insight-angles');
  const out = new Set<string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (p === anglesDir || name === '__tests__' || name === 'node_modules') continue;
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/\bmetric:\s*'([A-Za-z0-9_<>+.-]+)'/g)) out.add(m[1]!);
    }
  };
  walk(libRoot);
  return out;
}

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

  it('no angle metric reuses a metric id that already exists (canonical, or written by another producer)', () => {
    const existing = producerMetricIds();
    // The scan does see real producers (composite C6 writes `three_putt_chain`).
    expect(existing.has('three_putt_chain')).toBe(true);
    for (const id of ids) {
      const m = ANGLE_FAMILIES[id].metric;
      expect((METRIC_IDS as readonly string[]).includes(m), `${m} is a canonical metric id`).toBe(false);
      expect(existing.has(m), `${m} is already written by another producer`).toBe(false);
    }
  });

  it('every angle metric has its own direction and source alias', () => {
    for (const id of ids) {
      const m = ANGLE_FAMILIES[id].metric;
      expect(lookupMetricSource(m), m).not.toBeNull();
    }
    expect(getMetricDirection('three_putts_per_18')).toBe('lower_better');
  });

  it('three-putt κ is stated in holes, the unit of its gap input (about 5 rounds)', () => {
    expect(ANGLE_FAMILIES.three_putt_chain.sample_unit).toBe('holes');
    expect(ANGLE_FAMILIES.three_putt_chain.kappa).toEqual({ value: 90, unit: 'holes' });
  });

  it("each generator's insight type is its family's", () => {
    const loaders = stubLoaders(mkData([], [], []));
    expect(new ThreePuttChainGenerator(PLAYER, loaders).insightType).toBe(ANGLE_FAMILIES.three_putt_chain.insight_type);
    expect(new BadDayFloorGenerator(PLAYER, loaders).insightType).toBe(ANGLE_FAMILIES.bad_day_floor.insight_type);
    expect(new TeeMissCostGenerator(PLAYER, loaders).insightType).toBe(ANGLE_FAMILIES.tee_miss_cost.insight_type);
    expect(new ApproachMissCompassGenerator(PLAYER, loaders).insightType).toBe(ANGLE_FAMILIES.approach_miss_compass.insight_type);
    // Before any compose the lie generator reads as rough execution.
    expect(new LieApproachGenerator(PLAYER, loaders).insightType).toBe(ANGLE_FAMILIES.lie_rough_execution.insight_type);
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
  beforeEach(() => {
    vi.mocked(isFlagEnabled).mockClear();
    vi.mocked(createAngleLoaders).mockReset();
    vi.mocked(createAngleLoaders).mockReturnValue(stubLoaders(mkData([], [], [])));
  });

  it('returns no entries while the flag is off, so no angle generator runs', () => {
    flag.on = false;
    expect(insightAngleGenerators('p1')).toEqual([]);
    expect(isFlagEnabled).toHaveBeenCalledWith(INSIGHT_ANGLES_FLAG);
    expect(createAngleLoaders).not.toHaveBeenCalled();
  });

  it('returns the five angle generators when the flag is on, sharing one set of loaders for the call', () => {
    flag.on = true;
    const entries = insightAngleGenerators('p1');
    expect(createAngleLoaders).toHaveBeenCalledTimes(1);
    expect(createAngleLoaders).toHaveBeenCalledWith('p1');
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

describe('AngleGenerator.run with the flag off (no read, no write, no sweep)', () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockClear();
  });

  it('every angle generator returns gated, retracts nothing and touches neither loaders nor the database', async () => {
    flag.on = false;
    const loaders = stubLoaders(mkData([], [], []));
    const gens = [
      new LieApproachGenerator(PLAYER, loaders),
      new BadDayFloorGenerator(PLAYER, loaders),
      new ThreePuttChainGenerator(PLAYER, loaders),
      new TeeMissCostGenerator(PLAYER, loaders),
      new ApproachMissCompassGenerator(PLAYER, loaders),
    ];
    for (const g of gens) {
      await expect(g.run()).resolves.toEqual({ id: null, gated: true, status: 'gated', retracted: 0 });
    }
    expect(loaders.calls).toEqual({ data: 0, teamRounds: 0, tourThreePutt: 0 });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('with the flag on, run goes on to read (the gate is the only difference)', async () => {
    flag.on = true;
    const loaders = stubLoaders(mkData([], [], []));
    await new TeeMissCostGenerator(PLAYER, loaders).run().catch(() => undefined);
    expect(loaders.calls.data).toBe(1);
    flag.on = false;
  });
});

describe('Slice 0b read floors (angles read under their own family key)', () => {
  const ids = Object.keys(ANGLE_FAMILIES) as AngleFamilyId[];

  it('each angle row is judged as angle:<family>, never by its shared insight type', () => {
    for (const id of ids) {
      const key = angleReadFamilyKey({ evidence: { detail: { family: id } } as never }, ANGLE_FAMILIES[id].insight_type);
      expect(key).toBe(`angle:${id}`);
      // The two tee angles get different keys.
      expect(key).not.toBe(ANGLE_FAMILIES[id].insight_type);
    }
    expect(angleReadFamilyKey({ evidence: {} as never }, 'tee')).toBe('angle:tee');
  });

  it('no 0b floor holds an angle back: its own ANGLE_FAMILIES floors apply in compute instead', () => {
    for (const id of ids) {
      expect(FAMILY_FLOORS[`angle:${id}`]).toBeUndefined();
      expect(evaluateReadFloor(`angle:${id}`, { sample_n: 1, rounds_n: 1, detail: {} })).toBeNull();
    }
  });
});

describe('Slice 1 support registry (support/families.ts on main)', () => {
  it('has one entry per angle family (Slice 1c), matched by metric, never to a wrong family', () => {
    for (const id of Object.keys(ANGLE_FAMILIES) as AngleFamilyId[]) {
      const f = familyFor(ANGLE_FAMILIES[id].insight_type, ANGLE_FAMILIES[id].metric);
      expect(f.family, id).toBe(id);
      expect(f.shape).toBe(ANGLE_FAMILIES[id].gap_kind);
      expect(f.untestableReason).toBeUndefined();
    }
  });
});
