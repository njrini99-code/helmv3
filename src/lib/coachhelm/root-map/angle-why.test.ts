import { describe, expect, it } from 'vitest';
import { angleWhyOf, countLabel, exampleHref } from './angle-why';
import {
  EXAMPLE_ROUND_ID,
  approachMissEvidence,
  floorEvidence,
  lieEvidence,
  teeMissEvidence,
  threePuttEvidence,
} from './angle-why.fixtures';

describe('angleWhyOf', () => {
  it('reads each tagged angle into its view', () => {
    expect(angleWhyOf(lieEvidence)?.kind).toBe('lie_approach');
    expect(angleWhyOf(floorEvidence)?.kind).toBe('bad_day_floor');
    expect(angleWhyOf(threePuttEvidence)?.kind).toBe('three_putt');
    expect(angleWhyOf(teeMissEvidence)?.kind).toBe('tee_miss');
    expect(angleWhyOf(approachMissEvidence)?.kind).toBe('approach_miss');
  });

  it('returns null for a legacy three_putt_chain row without the angle tag', () => {
    const legacy = { metric: 'three_putt_chain', detail: { pathways: threePuttEvidence.detail.pathways } };
    expect(angleWhyOf(legacy)).toBeNull();
    expect(angleWhyOf({ metric: 'three_putt_chain' })).toBeNull();
  });

  it('returns null for a mismatched tag, an unknown metric or junk', () => {
    expect(angleWhyOf({ ...floorEvidence, metric: 'tee_miss_next_shot_cost' })).toBeNull();
    expect(angleWhyOf({ metric: 'something_else', detail: floorEvidence.detail })).toBeNull();
    expect(angleWhyOf(null)).toBeNull();
    expect(angleWhyOf('x')).toBeNull();
    expect(angleWhyOf({ metric: 'round_bad_day_floor', detail: { angle: 'bad_day_floor' } })).toBeNull();
  });

  it('keeps the receipts: window, denominators, exclusions and only well-formed examples', () => {
    const v = angleWhyOf(lieEvidence)!;
    expect(v.receipts.windowStart).toBe('2026-06-01');
    expect(v.receipts.windowEnd).toBe('2026-09-01');
    expect(v.receipts.samples).toEqual([
      { key: 'rough_approaches_in_tested_bands', label: 'rough approaches in tested bands', n: 22 },
      { key: 'rounds', label: 'rounds', n: 14 },
    ]);
    expect(v.receipts.exclusions).toEqual([{ key: 'recovery_lies', label: 'recovery lies', n: 3 }]);
    expect(v.receipts.examples.map((e) => e.holeNumber)).toEqual([7, 12]);
  });

  it('reads bad-day counts from the receipts and the approach sides in full', () => {
    const f = angleWhyOf(floorEvidence);
    expect(f?.kind === 'bad_day_floor' && [f.badRounds, f.middleRounds]).toEqual([2, 3]);
    const a = angleWhyOf(approachMissEvidence);
    expect(a?.kind === 'approach_miss' && a.sides.short).toEqual({ side: 'short', n: 30, costed: 28, cost: 0.35, upDownPct: 38 });
    // a tee compass needs both miss sides
    const oneSided = { ...teeMissEvidence, detail: { ...teeMissEvidence.detail, compass: teeMissEvidence.detail.compass.slice(0, 2) } };
    expect(angleWhyOf(oneSided)).toBeNull();
  });
});

describe('angle helpers', () => {
  it('labels counts in plain words', () => {
    expect(countLabel('holes_175_plus_par4')).toBe('holes 175+ par 4');
    expect(countLabel('sg_rounds')).toBe('SG rounds');
  });

  it('links an example hole only for a round UUID', () => {
    expect(exampleHref(EXAMPLE_ROUND_ID)).toBe(`/golf/dashboard/rounds/${EXAMPLE_ROUND_ID}`);
    expect(exampleHref('not-a-uuid')).toBeNull();
  });
});
