import { describe, it, expect } from 'vitest';
import {
  computeTableSampleDelta,
  evaluateTableHealth,
  DEAD_RATIO_WARNING,
  HIGH_WRITE_DELTA_THRESHOLD,
  SEQ_SCAN_GROWTH_THRESHOLD,
  WRITE_CONCENTRATION_MIN_TOTAL,
  type TableCurrentSnapshot,
  type TablePriorSnapshot,
  type TableSampleDelta,
} from '../table-health';

function current(overrides: Partial<TableCurrentSnapshot> = {}): TableCurrentSnapshot {
  return {
    relationName: 'golf_rounds',
    nLiveTup: 10_000,
    nDeadTup: 100,
    lastAutovacuum: '2026-09-03T00:00:00.000Z',
    lastAutoanalyze: '2026-09-03T00:00:00.000Z',
    seqScan: 10,
    idxScan: 1_000,
    nTupIns: 500,
    nTupUpd: 200,
    nTupDel: 10,
    totalBytes: 1_000_000,
    indexBytes: 200_000,
    ...overrides,
  };
}

function prior(overrides: Partial<TablePriorSnapshot> = {}): TablePriorSnapshot {
  return { seqScan: 5, idxScan: 900, nTupIns: 400, nTupUpd: 150, nTupDel: 5, nDeadTup: 80, ...overrides };
}

describe('computeTableSampleDelta', () => {
  it('returns first_sample with every delta null when there is no prior row', () => {
    const result = computeTableSampleDelta(current(), null);
    expect(result.collectorStatus).toBe('first_sample');
    expect(result.seqScanDelta).toBeNull();
    expect(result.nDeadTupDelta).toBeNull();
    expect(result.deadRatio).toBeCloseTo(100 / 10100, 4);
  });

  it('computes deltas normally when counters only grow', () => {
    const result = computeTableSampleDelta(current(), prior());
    expect(result.collectorStatus).toBe('ok');
    expect(result.seqScanDelta).toBe(5);
    expect(result.idxScanDelta).toBe(100);
    expect(result.nTupInsDelta).toBe(100);
  });

  it('a SHRINKING dead-tuple count is normal (autovacuum ran) and is not treated as a reset', () => {
    const result = computeTableSampleDelta(current({ nDeadTup: 20 }), prior({ nDeadTup: 500 }));
    expect(result.collectorStatus).toBe('ok');
    expect(result.nDeadTupDelta).toBe(-480);
  });

  it('detects a reset when a genuinely monotonic counter (seq_scan) goes backwards', () => {
    const result = computeTableSampleDelta(current({ seqScan: 1 }), prior({ seqScan: 50 }));
    expect(result.collectorStatus).toBe('reset_detected');
    expect(result.seqScanDelta).toBeNull();
    expect(result.nTupInsDelta).toBeNull();
  });

  it('returns a null deadRatio when the table has zero live and zero dead tuples', () => {
    const result = computeTableSampleDelta(current({ nLiveTup: 0, nDeadTup: 0 }), null);
    expect(result.deadRatio).toBeNull();
  });
});

function delta(overrides: Partial<TableSampleDelta> = {}): TableSampleDelta {
  return {
    relationName: 'golf_rounds',
    nLiveTup: 10_000,
    nDeadTup: 100,
    deadRatio: 0.01,
    lastAutovacuum: '2026-09-03T00:00:00.000Z',
    lastAutoanalyze: '2026-09-03T00:00:00.000Z',
    seqScan: 10,
    idxScan: 1_000,
    nTupIns: 500,
    nTupUpd: 200,
    nTupDel: 10,
    totalBytes: 1_000_000,
    indexBytes: 200_000,
    nDeadTupDelta: 5,
    seqScanDelta: 1,
    idxScanDelta: 50,
    nTupInsDelta: 100,
    nTupUpdDelta: 50,
    nTupDelDelta: 5,
    collectorStatus: 'ok',
    ...overrides,
  };
}

const NOW = new Date('2026-09-03T12:00:00.000Z');

describe('evaluateTableHealth', () => {
  it('produces no warnings for a healthy table', () => {
    expect(evaluateTableHealth([delta()], NOW)).toEqual([]);
  });

  it('flags dead_tuples_rising at/above the dead-ratio threshold when the delta is rising', () => {
    const result = evaluateTableHealth([delta({ deadRatio: DEAD_RATIO_WARNING, nDeadTupDelta: 10 })], NOW);
    expect(result).toEqual([
      { kind: 'dead_tuples_rising', relationName: 'golf_rounds', detail: expect.stringContaining('20.0%') },
    ]);
  });

  it('does not flag dead_tuples_rising when the ratio is high but actually falling (a vacuum just ran)', () => {
    const result = evaluateTableHealth([delta({ deadRatio: 0.5, nDeadTupDelta: -200 })], NOW);
    expect(result.find((w) => w.kind === 'dead_tuples_rising')).toBeUndefined();
  });

  it('flags no_autovacuum_high_write when writes are heavy and the last autovacuum is over 24h old', () => {
    const staleAutovacuum = new Date(NOW.getTime() - 25 * 3_600_000).toISOString();
    const result = evaluateTableHealth(
      [
        delta({
          lastAutovacuum: staleAutovacuum,
          nTupInsDelta: HIGH_WRITE_DELTA_THRESHOLD,
          nTupUpdDelta: 0,
          nTupDelDelta: 0,
        }),
      ],
      NOW,
    );
    expect(result.some((w) => w.kind === 'no_autovacuum_high_write')).toBe(true);
  });

  it('does not flag no_autovacuum_high_write when autovacuum ran recently, even under heavy writes', () => {
    const recentAutovacuum = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    const result = evaluateTableHealth(
      [delta({ lastAutovacuum: recentAutovacuum, nTupInsDelta: HIGH_WRITE_DELTA_THRESHOLD, nTupUpdDelta: 0, nTupDelDelta: 0 })],
      NOW,
    );
    expect(result.some((w) => w.kind === 'no_autovacuum_high_write')).toBe(false);
  });

  it('flags seq_scan_growth_idx_flat when seq scans grow a lot while index scans stay flat', () => {
    const result = evaluateTableHealth([delta({ seqScanDelta: SEQ_SCAN_GROWTH_THRESHOLD, idxScanDelta: 0 })], NOW);
    expect(result.some((w) => w.kind === 'seq_scan_growth_idx_flat')).toBe(true);
  });

  it('does not flag seq_scan_growth_idx_flat when index scans are also growing', () => {
    const result = evaluateTableHealth([delta({ seqScanDelta: SEQ_SCAN_GROWTH_THRESHOLD, idxScanDelta: 500 })], NOW);
    expect(result.some((w) => w.kind === 'seq_scan_growth_idx_flat')).toBe(false);
  });

  it('flags write_concentration when one table dominates the window write volume', () => {
    const dominant = delta({
      relationName: 'golf_shots',
      nTupInsDelta: WRITE_CONCENTRATION_MIN_TOTAL,
      nTupUpdDelta: 0,
      nTupDelDelta: 0,
    });
    const minor = delta({ relationName: 'golf_teams', nTupInsDelta: 10, nTupUpdDelta: 0, nTupDelDelta: 0 });
    const result = evaluateTableHealth([dominant, minor], NOW);
    expect(result.some((w) => w.kind === 'write_concentration' && w.relationName === 'golf_shots')).toBe(true);
    expect(result.some((w) => w.kind === 'write_concentration' && w.relationName === 'golf_teams')).toBe(false);
  });

  it('does not flag write_concentration when total write volume is below the meaningful floor', () => {
    const result = evaluateTableHealth(
      [delta({ nTupInsDelta: 5, nTupUpdDelta: 0, nTupDelDelta: 0 })],
      NOW,
    );
    expect(result.some((w) => w.kind === 'write_concentration')).toBe(false);
  });

  it('never treats a first_sample row (null deltas) as a warning trigger', () => {
    const firstSample = delta({
      collectorStatus: 'first_sample',
      nDeadTupDelta: null,
      seqScanDelta: null,
      idxScanDelta: null,
      nTupInsDelta: null,
      nTupUpdDelta: null,
      nTupDelDelta: null,
      deadRatio: 0.5, // still high in absolute terms
    });
    const result = evaluateTableHealth([firstSample], NOW);
    // dead_tuples_rising still fires on absolute ratio (nDeadTupDelta === null passes the "not falling" check by design)
    // but no write/scan-delta warnings can fire since every delta is null.
    expect(result.every((w) => w.kind === 'dead_tuples_rising')).toBe(true);
  });
});
