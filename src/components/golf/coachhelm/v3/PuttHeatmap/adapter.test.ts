/**
 * buildPuttRecordsFromShotRows — adapter tests.
 *
 * Pins the row-filtering + unit-conversion contract described in adapter.ts:
 * unknown outcomes and missing distances are dropped rather than guessed,
 * yards convert to feet, and every other field passes through unchanged.
 */

import { describe, it, expect } from 'vitest';
import { buildPuttRecordsFromShotRows, type PuttShotRow } from './adapter';

describe('buildPuttRecordsFromShotRows', () => {
  it('returns an empty array for empty input', () => {
    expect(buildPuttRecordsFromShotRows([])).toEqual([]);
  });

  it('maps a made putt with distance already in feet', () => {
    const rows: PuttShotRow[] = [
      {
        putt_made: true,
        distance_to_hole_before: 6,
        distance_unit_before: 'feet',
        miss_direction: null,
        hole_number: 4,
        round_id: 'round-1',
      },
    ];
    const out = buildPuttRecordsFromShotRows(rows);
    expect(out).toEqual([
      {
        distance_feet: 6,
        made: true,
        miss_direction: null,
        hole_number: 4,
        round_id: 'round-1',
      },
    ]);
  });

  it('converts yards to feet (x3) when distance_unit_before is "yards"', () => {
    const rows: PuttShotRow[] = [
      { putt_made: false, distance_to_hole_before: 4, distance_unit_before: 'yards', miss_direction: 'left' },
    ];
    const out = buildPuttRecordsFromShotRows(rows);
    expect(out[0]!.distance_feet).toBe(12);
  });

  it('treats a null/missing distance_unit_before as feet (no conversion)', () => {
    const rows: PuttShotRow[] = [
      { putt_made: true, distance_to_hole_before: 9, distance_unit_before: null },
      { putt_made: true, distance_to_hole_before: 9 },
    ];
    const out = buildPuttRecordsFromShotRows(rows);
    expect(out[0]!.distance_feet).toBe(9);
    expect(out[1]!.distance_feet).toBe(9);
  });

  it('drops rows with a null or undefined putt_made (unknown outcome)', () => {
    const rows: PuttShotRow[] = [
      { putt_made: null, distance_to_hole_before: 5 },
      { putt_made: undefined as unknown as null, distance_to_hole_before: 5 },
      { putt_made: true, distance_to_hole_before: 5 },
    ];
    const out = buildPuttRecordsFromShotRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.made).toBe(true);
  });

  it('drops rows with a null, undefined, or non-finite distance_to_hole_before', () => {
    const rows: PuttShotRow[] = [
      { putt_made: true, distance_to_hole_before: null },
      { putt_made: true, distance_to_hole_before: undefined as unknown as null },
      { putt_made: true, distance_to_hole_before: Number.NaN },
      { putt_made: true, distance_to_hole_before: 3 },
    ];
    const out = buildPuttRecordsFromShotRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.distance_feet).toBe(3);
  });

  it('passes miss_direction through unchanged, including free-form strings', () => {
    const rows: PuttShotRow[] = [
      { putt_made: false, distance_to_hole_before: 10, miss_direction: 'Past hole' },
    ];
    const out = buildPuttRecordsFromShotRows(rows);
    expect(out[0]!.miss_direction).toBe('Past hole');
  });

  it('defaults hole_number and round_id to null when absent', () => {
    const rows: PuttShotRow[] = [{ putt_made: true, distance_to_hole_before: 2 }];
    const out = buildPuttRecordsFromShotRows(rows);
    expect(out[0]!.hole_number).toBe(null);
    expect(out[0]!.round_id).toBe(null);
  });

  it('preserves input order (geometry.ts seeds jitter off array index)', () => {
    const rows: PuttShotRow[] = [
      { putt_made: true, distance_to_hole_before: 1, hole_number: 1 },
      { putt_made: true, distance_to_hole_before: 2, hole_number: 2 },
      { putt_made: true, distance_to_hole_before: 3, hole_number: 3 },
    ];
    const out = buildPuttRecordsFromShotRows(rows);
    expect(out.map((r) => r.hole_number)).toEqual([1, 2, 3]);
  });
});
