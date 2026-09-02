// =============================================================================
// Error-rate trend — the one "compared to what" on the Errors tab.
//
// Two honesty rules are pinned here. A prior window of zero yields NO
// percentage (there is no base to divide by, and "+100%" would be a lie), and
// an unreadable count comes out as `unknown`, never as a fabricated flat 0%.
// The hourly fold is pinned against the clock it was built on: a bucket
// index is only an hour relative to the window end the builder used.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { computeAppHourlyBuckets } from '@/lib/admin/data/errors';
import { sumHourlyBuckets, describeWindowDelta, HOUR_MS } from '@/lib/admin/error-trend';

const NOW = Date.parse('2026-09-01T12:00:00.000Z');

describe('sumHourlyBuckets', () => {
  it('folds many per-fingerprint histograms into one hourly series, on the builder’s own clock', () => {
    const events = [
      { id: '1', fingerprint: 'a', created_at: new Date(NOW - 23.5 * HOUR_MS).toISOString() },
      { id: '2', fingerprint: 'a', created_at: new Date(NOW - 0.5 * HOUR_MS).toISOString() },
      { id: '3', fingerprint: 'b', created_at: new Date(NOW - 0.5 * HOUR_MS).toISOString() },
    ];
    const buckets = computeAppHourlyBuckets(events, 24, NOW);
    const points = sumHourlyBuckets(buckets, NOW);

    expect(points).toHaveLength(24);
    expect(points[0]!.timestamp).toBe(NOW - 24 * HOUR_MS);
    expect(points[23]!.timestamp).toBe(NOW - HOUR_MS);
    expect(points[0]!.total).toBe(1);
    expect(points[23]!.total).toBe(2);
    expect(points.reduce((sum, p) => sum + p.total, 0)).toBe(3);
    // `accepted` mirrors `total` — app rows have no dropped/accepted split,
    // and the chart reads `total`.
    expect(points.every((p) => p.accepted === p.total)).toBe(true);
  });

  it('returns nothing at all for no buckets, so the caller can show its own empty state', () => {
    expect(sumHourlyBuckets({}, NOW)).toEqual([]);
  });
});

describe('describeWindowDelta', () => {
  it('states both numbers and a signed whole percent', () => {
    const up = describeWindowDelta(120, 100, 72);
    expect(up.direction).toBe('up');
    expect(up.deltaPct).toBe(20);
    expect(up.label).toBe('120 error rows this window vs 100 in the prior 72h (+20%).');

    const down = describeWindowDelta(75, 100, 24);
    expect(down.direction).toBe('down');
    expect(down.deltaPct).toBe(-25);
    expect(down.label).toContain('(-25%)');

    const flat = describeWindowDelta(100, 100, 24);
    expect(flat.direction).toBe('flat');
    expect(flat.deltaPct).toBe(0);
  });

  it('refuses a percentage against a zero prior window', () => {
    const fromNothing = describeWindowDelta(8, 0, 24);
    expect(fromNothing.deltaPct).toBeNull();
    expect(fromNothing.direction).toBe('up');
    expect(fromNothing.label).toBe('8 error rows this window vs 0 in the prior 24h.');

    const nothingToNothing = describeWindowDelta(0, 0, 24);
    expect(nothingToNothing.direction).toBe('flat');
    expect(nothingToNothing.deltaPct).toBeNull();
  });

  it('reads an unreadable count as unknown, never as a flat zero', () => {
    const noPrior = describeWindowDelta(40, null, 72);
    expect(noPrior.direction).toBe('unknown');
    expect(noPrior.deltaPct).toBeNull();
    expect(noPrior.label).toMatch(/could not be read/);
    expect(noPrior.label).toContain('40');

    const noCurrent = describeWindowDelta(null, 40, 72);
    expect(noCurrent.direction).toBe('unknown');
    expect(noCurrent.label).toMatch(/could not be read/);
  });
});
