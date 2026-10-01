import { describe, it, expect } from 'vitest';
import {
  aggregateApproachBuckets,
  aggregatePuttBuckets,
  LEAK_BUCKET_MIN_N,
} from '@/lib/golf/leak-map-buckets';

const noRefs = new Map();

// One putting shot row, on the shared make % definition (owner decision Q-93,
// src/lib/golf/putt-make.ts): start distance = distance_to_hole_before,
// made = result 'hole' OR putt_made true. (These fixtures used to carry
// putt_distance_feet, the field the leak map read before it moved to the
// shared definition.)
const puttRow = (feet: number | null, made: boolean | null, result: string | null = made ? 'hole' : 'green') => ({
  distance_to_hole_before: feet,
  result,
  putt_made: made,
});

describe('audit rows 9 / 32 — leak-map buckets', () => {
  describe('putting', () => {
    it('withholds a make % below the bucket floor but keeps its n', () => {
      const rows = [
        ...Array.from({ length: 3 }, () => puttRow(12, true)),
      ];
      const b = aggregatePuttBuckets(rows, noRefs).find((x) => x.bucket_id === '10_15')!;
      expect(LEAK_BUCKET_MIN_N).toBe(10);
      expect(b.sample_n).toBe(3);
      expect(b.team_value).toBeNull();
      expect(b.below_floor).toBe(true);
    });

    it('reports a make % at the floor with its 95% interval', () => {
      const rows = Array.from({ length: 10 }, (_, i) => puttRow(4, i < 7));
      const b = aggregatePuttBuckets(rows, noRefs).find((x) => x.bucket_id === '3_5')!;
      expect(b.team_value).toBe(70);
      expect(b.ci_low!).toBeGreaterThan(30);
      expect(b.ci_low!).toBeLessThan(70);
      expect(b.ci_high!).toBeGreaterThan(70);
      expect(b.below_floor).toBe(false);
    });

    it("counts a holed putt whose putt_made is null as a make (result 'hole')", () => {
      // The old path dropped every putt_made-null row, so these 10 holed putts
      // read as no sample at all.
      const rows = Array.from({ length: 10 }, () => ({
        distance_to_hole_before: 4,
        result: 'hole',
        putt_made: null,
      }));
      const b = aggregatePuttBuckets(rows, noRefs).find((x) => x.bucket_id === '3_5')!;
      expect(b.sample_n).toBe(10);
      expect(b.team_value).toBe(100);
    });

    it('counts a putt with no holed signal and a null putt_made as an attempt that missed', () => {
      const rows = [
        ...Array.from({ length: 5 }, () => ({ distance_to_hole_before: 4, result: 'green', putt_made: null })),
        ...Array.from({ length: 5 }, () => ({ distance_to_hole_before: 4, result: 'hole', putt_made: null })),
      ];
      const b = aggregatePuttBuckets(rows, noRefs).find((x) => x.bucket_id === '3_5')!;
      expect(b.sample_n).toBe(10);
      expect(b.team_value).toBe(50);
    });

    it('starts from distance_to_hole_before, not putt_distance_feet', () => {
      const rows = Array.from({ length: 10 }, () => ({
        distance_to_hole_before: 4,
        putt_distance_feet: 80,
        result: 'hole',
        putt_made: true,
      }));
      const buckets = aggregatePuttBuckets(rows, noRefs);
      expect(buckets.find((x) => x.bucket_id === '3_5')!.sample_n).toBe(10);
      expect(buckets.find((x) => x.bucket_id === '25_plus')!.sample_n).toBe(0);
    });

    it('does not band a putt without a start distance', () => {
      const rows = Array.from({ length: 12 }, () => puttRow(null, true));
      const total = aggregatePuttBuckets(rows, noRefs).reduce((n, b) => n + b.sample_n, 0);
      expect(total).toBe(0);
    });

    it('cuts bands (lo, hi]: 3 ft is 0-3, 5 ft is 3-5, 25 ft is 15-25, 25.5 ft is 25+', () => {
      const rows = [
        ...Array.from({ length: 10 }, () => puttRow(3, true)),
        ...Array.from({ length: 10 }, () => puttRow(5, true)),
        ...Array.from({ length: 10 }, () => puttRow(10, true)),
        ...Array.from({ length: 10 }, () => puttRow(15, true)),
        ...Array.from({ length: 10 }, () => puttRow(25, true)),
        ...Array.from({ length: 10 }, () => puttRow(25.5, true)),
      ];
      const buckets = Object.fromEntries(aggregatePuttBuckets(rows, noRefs).map((b) => [b.bucket_id, b.sample_n]));
      expect(buckets).toEqual({ '0_3': 10, '3_5': 10, '5_10': 10, '10_15': 10, '15_25': 10, '25_plus': 10 });
    });

    it('clamps a mis-keyed putt distance to the 120 ft ceiling (25+ band), as the calculator does', () => {
      const rows = Array.from({ length: 10 }, () => puttRow(390, false));
      expect(aggregatePuttBuckets(rows, noRefs).find((x) => x.bucket_id === '25_plus')!.sample_n).toBe(10);
    });

    it('carries the Tour reference only (no Division 1 value)', () => {
      const refs = new Map([['putts_made_3_5ft_pct', { pga_tour_value: 91 }]]);
      const rows = Array.from({ length: 10 }, () => puttRow(4, true));
      const b = aggregatePuttBuckets(rows, refs).find((x) => x.bucket_id === '3_5')!;
      expect(b.pga_value).toBe(91);
      expect('div1_value' in b).toBe(false);
    });
  });

  describe('approach proximity is unconditional (all shots, misses included)', () => {
    const shot = (o: Record<string, unknown>) => ({
      distance_to_hole_before: 150, distance_unit_before: 'yards',
      distance_to_hole_after: 20, distance_unit_after: 'feet',
      result: 'green', lie_after: 'green', par: 4, ...o,
    });

    it('averages misses too, so missing more greens cannot make proximity look better', () => {
      // 5 greens at 20 ft + 5 misses left 15 yd (45 ft) out.
      // Green-hit-only (the old basis) read 20 ft; all-shot reads 32.5 ft.
      const rows = [
        ...Array.from({ length: 5 }, () => shot({})),
        ...Array.from({ length: 5 }, () =>
          shot({ result: 'rough', lie_after: 'rough', distance_to_hole_after: 15, distance_unit_after: 'yards' })),
      ];
      const b = aggregateApproachBuckets(rows, noRefs).find((x) => x.bucket_id === '125_175')!;
      expect(b.sample_n).toBe(10);
      expect(b.team_value).toBe(32.5);
      expect(b.green_hit_pct).toBe(50);
      expect(b.basis).toBe('all_shot');
      expect(b.ci_low!).toBeLessThan(32.5);
      expect(b.ci_high!).toBeGreaterThan(32.5);
    });

    it('drops an impossible on-green leave (> 150 ft) but keeps a long miss', () => {
      const rows = [
        ...Array.from({ length: 10 }, () => shot({})),
        shot({ distance_to_hole_after: 200 }), // "on the green" at 200 ft: mis-entry
        shot({ result: 'rough', lie_after: 'rough', distance_to_hole_after: 60, distance_unit_after: 'yards' }),
      ];
      const b = aggregateApproachBuckets(rows, noRefs).find((x) => x.bucket_id === '125_175')!;
      expect(b.sample_n).toBe(11);
    });

    it('reads a feet-tagged before distance in yards', () => {
      const rows = Array.from({ length: 10 }, () => shot({ distance_to_hole_before: 450, distance_unit_before: 'feet' }));
      expect(aggregateApproachBuckets(rows, noRefs).find((x) => x.bucket_id === '125_175')!.sample_n).toBe(10);
    });

    it('leaves par-5 lay-ups out of the 175+ band (intent from the leave)', () => {
      const long = (o: Record<string, unknown>) => shot({ distance_to_hole_before: 230, par: 5, ...o });
      const rows = [
        ...Array.from({ length: 10 }, () => long({})),
        long({ result: 'fairway', lie_after: 'fairway', distance_to_hole_after: 100, distance_unit_after: 'yards' }),
        long({ result: 'sand', lie_after: 'sand', distance_to_hole_after: 15, distance_unit_after: 'yards' }),
      ];
      const b = aggregateApproachBuckets(rows, noRefs).find((x) => x.bucket_id === '175_plus')!;
      expect(b.sample_n).toBe(11); // the greenside bunker miss stays, the lay-up does not
      expect(b.excluded_layups).toBe(1);
    });

    it('carries the Tour reference only: a PgaRef with a div1 value (Clubhouse builds div1_avg_value: null) emits no div1_value', () => {
      const refs = new Map([['approach_proximity_125_175ft', { pga_tour_value: 40, div1_avg_value: 55 }]]);
      const rows = Array.from({ length: 10 }, () => shot({}));
      const b = aggregateApproachBuckets(rows, refs).find((x) => x.bucket_id === '125_175')!;
      expect(b.pga_value).toBe(40);
      expect('div1_value' in b).toBe(false);
    });

    it('withholds a proximity below the bucket floor', () => {
      const b = aggregateApproachBuckets([shot({})], noRefs).find((x) => x.bucket_id === '125_175')!;
      expect(b.team_value).toBeNull();
      expect(b.sample_n).toBe(1);
    });
  });
});
