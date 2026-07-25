import { describe, it, expect } from 'vitest';
import { layoutMarkerPositions, MARKER_MIN_GAP_PCT } from '../utils';

/**
 * Regression cover for the overlapping SG-rail markers (2026-07-25).
 *
 * StandingStrip keeps markers inside a 13-87 band so edge labels don't
 * overflow the card. It used to enforce that by clamping the OUTPUT of
 * layoutMarkerPositions per-marker, which collapsed every out-of-band marker
 * onto the same edge and re-collided the pair the layout had just separated —
 * drawing the Team tick underneath the You dot. The band is now passed in, so
 * the chain shifts as a unit and the gap survives.
 */
describe('layoutMarkerPositions — respects a caller-supplied band', () => {
  it('keeps the min gap when every marker sits below the band', () => {
    // Real prod values: SG Putting, you -3.00 / team -3.15 on a ±3.65 domain.
    // Both land near 7-9%, i.e. outside the 13-87 band.
    const you = ((-3.0 + 3.65) / 7.3) * 100; // ~8.9
    const team = ((-3.15 + 3.65) / 7.3) * 100; // ~6.8

    const out = layoutMarkerPositions(
      [
        { key: 'team', pct: team },
        { key: 'you', pct: you },
      ],
      MARKER_MIN_GAP_PCT,
      13,
      87,
    );

    const byKey = new Map(out.map((o) => [o.key, o.pct]));
    const gap = Math.abs(byKey.get('you')! - byKey.get('team')!);
    expect(gap).toBeGreaterThanOrEqual(MARKER_MIN_GAP_PCT - 1e-9);

    for (const o of out) {
      expect(o.pct).toBeGreaterThanOrEqual(13 - 1e-9);
      expect(o.pct).toBeLessThanOrEqual(87 + 1e-9);
    }
  });

  it('preserves true value order after banding', () => {
    const out = layoutMarkerPositions(
      [
        { key: 'team', pct: 2 },
        { key: 'you', pct: 5 },
      ],
      MARKER_MIN_GAP_PCT,
      13,
      87,
    );
    const byKey = new Map(out.map((o) => [o.key, o.pct]));
    // `you` held the larger value, so it must still draw right of `team`.
    expect(byKey.get('you')!).toBeGreaterThan(byKey.get('team')!);
  });

  it('separates three clustered markers inside the band', () => {
    const out = layoutMarkerPositions(
      [
        { key: 'team', pct: 4 },
        { key: 'you', pct: 5 },
        { key: 'pga', pct: 6 },
      ],
      MARKER_MIN_GAP_PCT,
      13,
      87,
    );
    const sorted = [...out].sort((a, b) => a.pct - b.pct);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.pct - sorted[i - 1]!.pct).toBeGreaterThanOrEqual(
        MARKER_MIN_GAP_PCT - 1e-9,
      );
    }
    for (const o of out) {
      expect(o.pct).toBeGreaterThanOrEqual(13 - 1e-9);
      expect(o.pct).toBeLessThanOrEqual(87 + 1e-9);
    }
  });

  it('defaults to the full rail when no band is given', () => {
    const out = layoutMarkerPositions([
      { key: 'a', pct: 0 },
      { key: 'b', pct: 1 },
    ]);
    expect(Math.min(...out.map((o) => o.pct))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...out.map((o) => o.pct))).toBeLessThanOrEqual(100);
  });
});
