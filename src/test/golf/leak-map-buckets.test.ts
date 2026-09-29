import { describe, it, expect } from 'vitest';
import {
  aggregateApproachBuckets,
  aggregatePuttBuckets,
  LEAK_BUCKET_MIN_N,
} from '@/lib/golf/leak-map-buckets';

const noRefs = new Map();

describe('audit rows 9 / 32 — leak-map buckets', () => {
  describe('putting', () => {
    it('withholds a make % below the bucket floor but keeps its n', () => {
      const rows = [
        ...Array.from({ length: 3 }, () => ({ putt_distance_feet: 12, putt_made: true })),
      ];
      const b = aggregatePuttBuckets(rows, noRefs).find((x) => x.bucket_id === '10_15')!;
      expect(LEAK_BUCKET_MIN_N).toBe(10);
      expect(b.sample_n).toBe(3);
      expect(b.team_value).toBeNull();
      expect(b.below_floor).toBe(true);
    });

    it('reports a make % at the floor with its 95% interval', () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({ putt_distance_feet: 4, putt_made: i < 7 }));
      const b = aggregatePuttBuckets(rows, noRefs).find((x) => x.bucket_id === '3_5')!;
      expect(b.team_value).toBe(70);
      expect(b.ci_low!).toBeGreaterThan(30);
      expect(b.ci_low!).toBeLessThan(70);
      expect(b.ci_high!).toBeGreaterThan(70);
      expect(b.below_floor).toBe(false);
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

    it('withholds a proximity below the bucket floor', () => {
      const b = aggregateApproachBuckets([shot({})], noRefs).find((x) => x.bucket_id === '125_175')!;
      expect(b.team_value).toBeNull();
      expect(b.sample_n).toBe(1);
    });
  });
});
