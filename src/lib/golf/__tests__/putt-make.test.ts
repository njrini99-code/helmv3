import { describe, it, expect } from 'vitest';
import {
  MAX_PUTT_FEET,
  PUTT_MAKE_BANDS,
  PUTT_REPORT_BAND_OF,
  bandedPutt,
  isPuttMade,
  normalizePuttFeet,
  puttMakeBandFor,
  puttMakeStartFeet,
  tallyPuttMakes,
} from '@/lib/golf/putt-make';

/**
 * The ONE putt make % definition (owner decision Q-93): start distance from
 * distance_to_hole_before in feet (clamped, never unit-converted), made =
 * result 'hole' OR putt_made true, putts without a start distance are not
 * banded, bands are cut (lo, hi] (upper-inclusive). Same rule as the SQL cache
 * writer update_player_putt_make_pct.
 */
describe('putt-make — the one make % definition', () => {
  describe('start distance', () => {
    it('reads distance_to_hole_before as feet and clamps to 0..MAX_PUTT_FEET', () => {
      expect(puttMakeStartFeet({ distance_to_hole_before: 12 })).toBe(12);
      expect(puttMakeStartFeet({ distance_to_hole_before: -4 })).toBe(0);
      expect(puttMakeStartFeet({ distance_to_hole_before: 390 })).toBe(MAX_PUTT_FEET);
      expect(normalizePuttFeet(500)).toBe(120);
      expect(MAX_PUTT_FEET).toBe(120);
    });

    it('does NOT convert a yards-tagged putt (a putt is always feet)', () => {
      expect(
        puttMakeStartFeet({ distance_to_hole_before: 4, distance_unit_before: 'yards' } as never),
      ).toBe(4);
    });

    it('is null when there is no usable start distance, never 0', () => {
      expect(puttMakeStartFeet({ distance_to_hole_before: null })).toBeNull();
      expect(puttMakeStartFeet({})).toBeNull();
      expect(puttMakeStartFeet({ distance_to_hole_before: Number.NaN })).toBeNull();
      expect(puttMakeStartFeet({ distance_to_hole_before: Number.POSITIVE_INFINITY })).toBeNull();
    });
  });

  describe('made', () => {
    it("counts result 'hole' as a make even when putt_made is null", () => {
      expect(isPuttMade({ result: 'hole', putt_made: null })).toBe(true);
    });

    it('counts putt_made true as a make whatever the result says', () => {
      expect(isPuttMade({ result: 'green', putt_made: true })).toBe(true);
    });

    it("lets result 'hole' win over a stale putt_made false (the SQL writer's rule)", () => {
      expect(isPuttMade({ result: 'hole', putt_made: false })).toBe(true);
    });

    it('is a miss when neither says holed, including a null putt_made', () => {
      expect(isPuttMade({ result: 'green', putt_made: null })).toBe(false);
      expect(isPuttMade({ result: 'green', putt_made: false })).toBe(false);
      expect(isPuttMade({})).toBe(false);
    });
  });

  describe('bands are cut (lo, hi]', () => {
    it.each([
      [0, '0_3'],
      [3, '0_3'],
      [3.01, '3_5'],
      [5, '3_5'],
      [5.01, '5_10'],
      [10, '5_10'],
      [10.01, '10_15'],
      [15, '10_15'],
      [15.01, '15_20'],
      [20, '15_20'],
      [20.01, '20_25'],
      [25, '20_25'],
      [25.01, '25_30'],
      [30, '25_30'],
      [30.01, '30_35'],
      [35, '30_35'],
      [35.01, '35_plus'],
      [120, '35_plus'],
    ])('%s ft is in %s', (feet, band) => {
      expect(puttMakeBandFor(feet)).toBe(band);
    });

    it('every fine band belongs to exactly one reporting band, and the edges line up', () => {
      expect(PUTT_MAKE_BANDS.map((b) => b.id)).toEqual(Object.keys(PUTT_REPORT_BAND_OF));
      expect(PUTT_REPORT_BAND_OF['15_20']).toBe('15_25');
      expect(PUTT_REPORT_BAND_OF['20_25']).toBe('15_25');
      expect(PUTT_REPORT_BAND_OF['25_30']).toBe('25_plus');
      expect(PUTT_REPORT_BAND_OF['35_plus']).toBe('25_plus');
      expect(PUTT_REPORT_BAND_OF['0_3']).toBe('0_3');
    });
  });

  describe('bandedPutt / tallyPuttMakes', () => {
    it('does not band a putt without a start distance', () => {
      expect(bandedPutt({ distance_to_hole_before: null, result: 'hole' })).toBeNull();
      expect(tallyPuttMakes([{ distance_to_hole_before: null, result: 'hole' }])).toEqual({});
    });

    it('tallies made / total per fine band', () => {
      const tally = tallyPuttMakes([
        { distance_to_hole_before: 3, result: 'hole', putt_made: null },
        { distance_to_hole_before: 3, result: 'green', putt_made: false },
        { distance_to_hole_before: 5, result: 'green', putt_made: true },
        { distance_to_hole_before: 5.5, result: 'green', putt_made: null },
      ]);
      expect(tally['0_3']).toEqual({ made: 1, total: 2 });
      expect(tally['3_5']).toEqual({ made: 1, total: 1 });
      expect(tally['5_10']).toEqual({ made: 0, total: 1 });
    });
  });
});
