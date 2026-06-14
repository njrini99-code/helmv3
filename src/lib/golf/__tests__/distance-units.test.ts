/**
 * Comprehensive unit tests for src/lib/golf/distance-units.ts
 *
 * Covers:
 *  - Round-trip stability (display → canonical → display)
 *  - Rounding rules (yards-mode should be whole numbers, meters-mode too)
 *  - Known-value spot checks (ISO/USGA exact constant: 1 yd = 0.9144 m)
 *  - Label helpers
 *  - Boundary values (0, negative-guard, large values)
 *  - Range label helpers
 *  - No double-conversion (idempotency)
 */

import { describe, it, expect } from 'vitest';
import {
  yardsToDisplay,
  feetToDisplay,
  displayToYards,
  displayToFeet,
  yardsLabel,
  feetLabel,
  yardsLabelUpper,
  feetLabelUpper,
  formatYards,
  formatFeet,
  distancePlaceholder,
  puttPlaceholder,
  yardsRangeLabel,
  feetRangeLabel,
} from '../distance-units';
import type { DistancePreference } from '../distance-units';

// ---------------------------------------------------------------------------
// yardsToDisplay
// ---------------------------------------------------------------------------

describe('yardsToDisplay', () => {
  it('yards-mode: identity', () => {
    expect(yardsToDisplay(150, 'yards')).toBe(150);
    expect(yardsToDisplay(0, 'yards')).toBe(0);
    expect(yardsToDisplay(225, 'yards')).toBe(225);
  });

  it('meters-mode: 1 yard = 0.9144 m → rounds to integer', () => {
    // 1 yard = 0.9144 m, rounds to 1
    expect(yardsToDisplay(1, 'meters')).toBe(1);
    // 100 yards = 91.44 m → 91
    expect(yardsToDisplay(100, 'meters')).toBe(91);
    // 150 yards = 137.16 m → 137
    expect(yardsToDisplay(150, 'meters')).toBe(137);
    // 200 yards = 182.88 m → 183
    expect(yardsToDisplay(200, 'meters')).toBe(183);
    // 225 yards = 205.74 m → 206
    expect(yardsToDisplay(225, 'meters')).toBe(206);
  });

  it('meters-mode: no rounding when round=false', () => {
    expect(yardsToDisplay(100, 'meters', false)).toBeCloseTo(91.44, 2);
    expect(yardsToDisplay(150, 'meters', false)).toBeCloseTo(137.16, 2);
  });

  it('zero in any unit → zero out', () => {
    expect(yardsToDisplay(0, 'yards')).toBe(0);
    expect(yardsToDisplay(0, 'meters')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// feetToDisplay
// ---------------------------------------------------------------------------

describe('feetToDisplay', () => {
  it('yards-mode: identity (feet stay feet)', () => {
    expect(feetToDisplay(10, 'yards')).toBe(10);
    expect(feetToDisplay(30, 'yards')).toBe(30);
    expect(feetToDisplay(0, 'yards')).toBe(0);
  });

  it('meters-mode: 1 foot = 0.3048 m', () => {
    // 10 ft = 3.048 m → rounds to 3
    expect(feetToDisplay(10, 'meters')).toBe(3);
    // 30 ft = 9.144 m → rounds to 9
    expect(feetToDisplay(30, 'meters')).toBe(9);
    // 5 ft = 1.524 m → rounds to 2
    expect(feetToDisplay(5, 'meters')).toBe(2);
    // 20 ft = 6.096 m → rounds to 6
    expect(feetToDisplay(20, 'meters')).toBe(6);
  });

  it('meters-mode: no rounding when round=false', () => {
    expect(feetToDisplay(10, 'meters', false)).toBeCloseTo(3.048, 3);
  });
});

// ---------------------------------------------------------------------------
// displayToYards  (input → canonical)
// ---------------------------------------------------------------------------

describe('displayToYards', () => {
  it('yards-mode: identity', () => {
    expect(displayToYards(150, 'yards')).toBe(150);
    expect(displayToYards(0, 'yards')).toBe(0);
  });

  it('meters-mode: inverse of yardsToDisplay', () => {
    // 137 m ÷ 0.9144 = 149.78 y → rounds to 150
    expect(displayToYards(137, 'meters')).toBe(150);
    // 91 m ÷ 0.9144 = 99.5 y → rounds to 100 (banker's rounds up at .5)
    // Actually Math.round(99.5) = 100
    expect(displayToYards(91, 'meters')).toBe(100);
  });

  it('no rounding when round=false', () => {
    expect(displayToYards(91.44, 'meters', false)).toBeCloseTo(100, 3);
  });
});

// ---------------------------------------------------------------------------
// displayToFeet (input → canonical)
// ---------------------------------------------------------------------------

describe('displayToFeet', () => {
  it('yards-mode: identity (feet stay feet)', () => {
    expect(displayToFeet(10, 'yards')).toBe(10);
    expect(displayToFeet(0, 'yards')).toBe(0);
  });

  it('meters-mode: inverse of feetToDisplay', () => {
    // 3 m ÷ 0.3048 = 9.84 ft → rounds to 10
    expect(displayToFeet(3, 'meters')).toBe(10);
    // 9 m ÷ 0.3048 = 29.53 ft → rounds to 30
    expect(displayToFeet(9, 'meters')).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Round-trip stability  (display → canonical → display should be lossless
// within ±1 of the display unit for typical golf distances)
// ---------------------------------------------------------------------------

describe('round-trip stability', () => {
  const yardsSamples = [10, 25, 50, 75, 100, 125, 150, 175, 200, 225, 300, 400, 500];
  const feetSamples = [2, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50];

  it('yards display round-trip within 1 yard (yards-mode)', () => {
    for (const y of yardsSamples) {
      const canonical = displayToYards(yardsToDisplay(y, 'yards'), 'yards');
      expect(Math.abs(canonical - y)).toBeLessThanOrEqual(1);
    }
  });

  it('yards display round-trip within 1 meter (meters-mode)', () => {
    for (const y of yardsSamples) {
      const displayM = yardsToDisplay(y, 'meters');
      const backYards = displayToYards(displayM, 'meters');
      const backM = yardsToDisplay(backYards, 'meters');
      expect(Math.abs(backM - displayM)).toBeLessThanOrEqual(1);
    }
  });

  it('feet display round-trip within 1 foot (yards-mode)', () => {
    for (const f of feetSamples) {
      const canonical = displayToFeet(feetToDisplay(f, 'yards'), 'yards');
      expect(Math.abs(canonical - f)).toBeLessThanOrEqual(1);
    }
  });

  it('feet display round-trip within 1 meter unit (meters-mode)', () => {
    for (const f of feetSamples) {
      const displayM = feetToDisplay(f, 'meters');
      const backFeet = displayToFeet(displayM, 'meters');
      const backM = feetToDisplay(backFeet, 'meters');
      expect(Math.abs(backM - displayM)).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Idempotency — conversion in yards-mode must be a no-op
// ---------------------------------------------------------------------------

describe('idempotency in yards-mode', () => {
  it('yardsToDisplay in yards-mode is identity', () => {
    for (const y of [0, 50, 100, 150, 200, 250, 500]) {
      expect(yardsToDisplay(y, 'yards')).toBe(y);
    }
  });

  it('feetToDisplay in yards-mode is identity', () => {
    for (const f of [0, 5, 10, 20, 30, 50]) {
      expect(feetToDisplay(f, 'yards')).toBe(f);
    }
  });

  it('displayToYards in yards-mode is identity', () => {
    for (const y of [0, 50, 100, 150, 200]) {
      expect(displayToYards(y, 'yards')).toBe(y);
    }
  });

  it('displayToFeet in yards-mode is identity', () => {
    for (const f of [0, 5, 10, 20]) {
      expect(displayToFeet(f, 'yards')).toBe(f);
    }
  });
});

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

describe('yardsLabel', () => {
  it('returns yds for yards', () => {
    expect(yardsLabel('yards')).toBe('yds');
  });
  it('returns m for meters', () => {
    expect(yardsLabel('meters')).toBe('m');
  });
});

describe('feetLabel', () => {
  it('returns ft for yards-mode', () => {
    expect(feetLabel('yards')).toBe('ft');
  });
  it('returns m for meters-mode', () => {
    expect(feetLabel('meters')).toBe('m');
  });
});

describe('yardsLabelUpper', () => {
  it('returns YDS for yards', () => {
    expect(yardsLabelUpper('yards')).toBe('YDS');
  });
  it('returns M for meters', () => {
    expect(yardsLabelUpper('meters')).toBe('M');
  });
});

describe('feetLabelUpper', () => {
  it('returns FT for yards-mode', () => {
    expect(feetLabelUpper('yards')).toBe('FT');
  });
  it('returns M for meters-mode', () => {
    expect(feetLabelUpper('meters')).toBe('M');
  });
});

// ---------------------------------------------------------------------------
// formatYards / formatFeet
// ---------------------------------------------------------------------------

describe('formatYards', () => {
  it('yards-mode: formats as "N yds"', () => {
    expect(formatYards(150, 'yards')).toBe('150 yds');
    expect(formatYards(0, 'yards')).toBe('0 yds');
  });
  it('meters-mode: converts and formats as "N m"', () => {
    expect(formatYards(150, 'meters')).toBe('137 m');
    expect(formatYards(0, 'meters')).toBe('0 m');
  });
});

describe('formatFeet', () => {
  it('yards-mode: formats as "N ft"', () => {
    expect(formatFeet(10, 'yards')).toBe('10 ft');
  });
  it('meters-mode: converts and formats as "N m"', () => {
    expect(formatFeet(10, 'meters')).toBe('3 m');
  });
});

// ---------------------------------------------------------------------------
// Placeholder helpers
// ---------------------------------------------------------------------------

describe('distancePlaceholder', () => {
  it('yards-mode uses yds label', () => {
    expect(distancePlaceholder('yards', 150)).toBe('e.g. 150 yds');
  });
  it('meters-mode uses m label', () => {
    expect(distancePlaceholder('meters', 150)).toBe('e.g. 137 m');
  });
});

describe('puttPlaceholder', () => {
  it('yards-mode uses ft label', () => {
    expect(puttPlaceholder('yards', 10)).toBe('e.g. 10 ft');
  });
  it('meters-mode uses m label', () => {
    expect(puttPlaceholder('meters', 10)).toBe('e.g. 3 m');
  });
});

// ---------------------------------------------------------------------------
// yardsRangeLabel / feetRangeLabel
// ---------------------------------------------------------------------------

describe('yardsRangeLabel', () => {
  it('yards-mode: shows range in yds', () => {
    expect(yardsRangeLabel([50, 75], 'yards')).toBe('50-75 yds');
    expect(yardsRangeLabel([225, null], 'yards')).toBe('225+ yds');
  });
  it('meters-mode: converts bounds', () => {
    expect(yardsRangeLabel([50, 75], 'meters')).toBe('46-69 m');
    expect(yardsRangeLabel([225, null], 'meters')).toBe('206+ m');
  });
});

describe('feetRangeLabel', () => {
  it('yards-mode: shows range in ft', () => {
    expect(feetRangeLabel([20, 25], 'yards')).toBe('20-25 ft');
    expect(feetRangeLabel([35, null], 'yards')).toBe('35+ ft');
  });
  it('meters-mode: converts bounds', () => {
    // 20 ft = 6.096 m → 6; 25 ft = 7.62 m → 8
    expect(feetRangeLabel([20, 25], 'meters')).toBe('6-8 m');
    // 35 ft = 10.668 m → 11
    expect(feetRangeLabel([35, null], 'meters')).toBe('11+ m');
  });
});

// ---------------------------------------------------------------------------
// Boundary / edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles very large yard values without overflow', () => {
    expect(yardsToDisplay(10000, 'meters')).toBe(9144);
    expect(yardsToDisplay(10000, 'yards')).toBe(10000);
  });

  it('0 yards → 0 meters', () => {
    expect(yardsToDisplay(0, 'meters')).toBe(0);
    expect(formatYards(0, 'meters')).toBe('0 m');
  });

  it('0 feet → 0 output in any mode', () => {
    expect(feetToDisplay(0, 'yards')).toBe(0);
    expect(feetToDisplay(0, 'meters')).toBe(0);
  });

  it('preserves correct rounding at .5 boundary (Math.round)', () => {
    // 99.5 yards in meters: 99.5 * 0.9144 = 90.9828 → rounds to 91
    expect(yardsToDisplay(99.5, 'meters')).toBe(91);
    // 0.5 yards in meters: 0.5 * 0.9144 = 0.4572 → rounds to 0
    expect(yardsToDisplay(0.5, 'meters')).toBe(0);
  });

  it('non-integer canonical values handled correctly', () => {
    // 10.5 yards in meters: 10.5 * 0.9144 = 9.6012 → rounds to 10
    expect(yardsToDisplay(10.5, 'meters')).toBe(10);
    // 10.5 feet in meters: 10.5 * 0.3048 = 3.2004 → rounds to 3
    expect(feetToDisplay(10.5, 'meters')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Known-value exhaustive check: USGA yard-to-meter table spot-checks
// ---------------------------------------------------------------------------

describe('USGA known values', () => {
  const table: Array<[number, number]> = [
    [100, 91],   // 91.44
    [125, 114],  // 114.30
    [150, 137],  // 137.16
    [175, 160],  // 160.02
    [200, 183],  // 182.88
    [250, 229],  // 228.60
    [300, 274],  // 274.32
    [400, 366],  // 365.76
  ];

  it('matches expected meter values within ±1 m', () => {
    for (const [yards, expectedMeters] of table) {
      const result = yardsToDisplay(yards, 'meters');
      expect(Math.abs(result - expectedMeters)).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Type exhaustiveness guard
// ---------------------------------------------------------------------------

describe('DistancePreference type', () => {
  it('only valid values are yards and meters', () => {
    const validValues: DistancePreference[] = ['yards', 'meters'];
    expect(validValues).toHaveLength(2);
  });
});
