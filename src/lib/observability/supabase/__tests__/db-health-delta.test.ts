import { describe, it, expect } from 'vitest';
import { computeDbHealthDelta, type DbHealthCurrentSnapshot, type DbHealthRawSnapshot } from '../db-health-delta';

function currentSnapshot(overrides: Partial<DbHealthCurrentSnapshot> = {}): DbHealthCurrentSnapshot {
  return {
    sampledAt: '2026-09-03T12:05:00.000Z',
    statsResetAt: null,
    xactCommit: 1_000,
    xactRollback: 100,
    deadlocks: 0,
    conflicts: 0,
    tupReturned: 50_000,
    tupFetched: 40_000,
    tupInserted: 500,
    tupUpdated: 400,
    tupDeleted: 10,
    tempFiles: 5,
    tempBytes: 1_000_000,
    blksRead: 200,
    blksHit: 9_800,
    connectionsTotal: 22,
    connectionsActive: 1,
    connectionsIdleInTx: 0,
    connectionsWaitingLock: 0,
    longestActiveMs: 50,
    longestIdleInTxMs: 0,
    longestLockWaitMs: 0,
    dbSizeBytes: 953_068_691,
    maxConnections: 60,
    ...overrides,
  };
}

function rawSnapshot(overrides: Partial<DbHealthRawSnapshot> = {}): DbHealthRawSnapshot {
  return {
    statsResetAt: null,
    xactCommit: 900,
    xactRollback: 90,
    deadlocks: 0,
    conflicts: 0,
    tupReturned: 45_000,
    tupFetched: 36_000,
    tupInserted: 450,
    tupUpdated: 350,
    tupDeleted: 8,
    tempFiles: 4,
    tempBytes: 900_000,
    blksRead: 150,
    blksHit: 9_000,
    ...overrides,
  };
}

describe('computeDbHealthDelta — first sample', () => {
  it('marks first_sample and returns null deltas when there is no prior row', () => {
    const result = computeDbHealthDelta(currentSnapshot(), null);
    expect(result.collectorStatus).toBe('first_sample');
    expect(result.deltas.xactCommit).toBeNull();
    expect(result.deltas.blksHit).toBeNull();
  });

  it('still computes connectionsPctMax on the first sample (not counter-derived)', () => {
    const result = computeDbHealthDelta(currentSnapshot({ connectionsTotal: 30, maxConnections: 60 }), null);
    expect(result.connectionsPctMax).toBeCloseTo(0.5, 4);
  });
});

describe('computeDbHealthDelta — normal window', () => {
  it('computes correct deltas for every counter', () => {
    const result = computeDbHealthDelta(currentSnapshot(), rawSnapshot());
    expect(result.collectorStatus).toBe('ok');
    expect(result.deltas.xactCommit).toBe(100);
    expect(result.deltas.xactRollback).toBe(10);
    expect(result.deltas.tupInserted).toBe(50);
    expect(result.deltas.blksHit).toBe(800);
    expect(result.deltas.blksRead).toBe(50);
  });

  it('computes cache hit ratio over the WINDOW, not cumulatively', () => {
    // window: 800 hits / (800 hits + 50 reads) — very different from the
    // cumulative ratio (9800 / 10000), which is the point of this test.
    const result = computeDbHealthDelta(currentSnapshot(), rawSnapshot());
    expect(result.cacheHitRatio).toBeCloseTo(800 / 850, 4);
  });

  it('returns null cache hit ratio when the window had zero reads and zero hits', () => {
    const current = currentSnapshot({ blksHit: 100, blksRead: 100 });
    const prior = rawSnapshot({ blksHit: 100, blksRead: 100 });
    const result = computeDbHealthDelta(current, prior);
    expect(result.cacheHitRatio).toBeNull();
  });
});

describe('computeDbHealthDelta — reset detection (two signals)', () => {
  it('detects a reset via a CHANGED stats_reset_at', () => {
    const current = currentSnapshot({ statsResetAt: '2026-09-03T10:00:00.000Z', xactCommit: 50 });
    const prior = rawSnapshot({ statsResetAt: '2026-02-03T22:57:27.000Z' });
    const result = computeDbHealthDelta(current, prior);
    expect(result.collectorStatus).toBe('reset_detected');
    expect(result.deltas.xactCommit).toBeNull();
  });

  it('detects a reset via a NEGATIVE counter delta even when stats_reset_at is unchanged (e.g. both null)', () => {
    // Production measured stats_reset as NULL (never explicitly reset) — a
    // timestamp-only check would miss a reset in that shape entirely.
    const current = currentSnapshot({ statsResetAt: null, xactCommit: 10 }); // less than prior's 900
    const prior = rawSnapshot({ statsResetAt: null, xactCommit: 900 });
    const result = computeDbHealthDelta(current, prior);
    expect(result.collectorStatus).toBe('reset_detected');
    expect(result.deltas.xactCommit).toBeNull();
    expect(result.deltas.blksHit).toBeNull(); // EVERY delta withheld, not just the negative one
  });

  it('does not false-positive a reset when both current and previous null stats_reset_at and all counters are non-decreasing', () => {
    const result = computeDbHealthDelta(currentSnapshot({ statsResetAt: null }), rawSnapshot({ statsResetAt: null }));
    expect(result.collectorStatus).toBe('ok');
  });

  it('a reset never fabricates a delta from the raw current value', () => {
    const current = currentSnapshot({ statsResetAt: '2026-09-03T10:00:00.000Z', deadlocks: 3 });
    const prior = rawSnapshot({ statsResetAt: '2026-02-03T22:57:27.000Z', deadlocks: 0 });
    const result = computeDbHealthDelta(current, prior);
    // Must be null, not 3 (the raw current value) and not 0.
    expect(result.deltas.deadlocks).toBeNull();
  });
});

describe('computeDbHealthDelta — connectionsPctMax', () => {
  it('reflects the measured production max_connections=60, not an assumed 200', () => {
    const result = computeDbHealthDelta(currentSnapshot({ connectionsTotal: 22, maxConnections: 60 }), rawSnapshot());
    expect(result.connectionsPctMax).toBeCloseTo(22 / 60, 4);
  });

  it('is 0 when maxConnections is not (yet) known rather than dividing by zero', () => {
    const result = computeDbHealthDelta(currentSnapshot({ maxConnections: 0 }), rawSnapshot());
    expect(result.connectionsPctMax).toBe(0);
  });
});
