import { describe, it, expect } from 'vitest';
import {
  computeStatDelta,
  updateStatBaseline,
  detectQueryRegression,
  BASELINE_MIN_SAMPLES,
  type StatCurrentRow,
  type StatPriorRow,
} from '../query-regression';

function currentRow(overrides: Partial<StatCurrentRow> = {}): StatCurrentRow {
  return {
    queryid: '12345',
    calls: 1_000,
    totalExecMs: 5_000,
    maxExecMs: 50,
    rows: 1_000,
    sharedBlksHit: 10_000,
    sharedBlksRead: 100,
    tempBlksRead: 0,
    tempBlksWritten: 0,
    walBytes: 0,
    safeQueryClass: 'postgrest_query',
    sourceClass: 'helm_product',
    ...overrides,
  };
}

function priorRow(overrides: Partial<StatPriorRow> = {}): StatPriorRow {
  return {
    statsResetAt: null,
    calls: 900,
    totalExecMs: 4_000,
    rows: 900,
    sharedBlksHit: 9_000,
    sharedBlksRead: 90,
    tempBlksRead: 0,
    tempBlksWritten: 0,
    walBytes: 0,
    meanExecMsBaseline: 5,
    maxExecMsBaseline: 20,
    rowsPerCallBaseline: 1,
    sampleCount: BASELINE_MIN_SAMPLES,
    baselineStatus: 'established',
    ...overrides,
  };
}

describe('computeStatDelta', () => {
  it('marks a queryid with no prior row as isNewQuery, with null deltas but a real maxExecMsObserved', () => {
    const result = computeStatDelta(currentRow({ maxExecMs: 77 }), null, null);
    expect(result.isNewQuery).toBe(true);
    expect(result.callsDelta).toBeNull();
    expect(result.maxExecMsObserved).toBe(77);
  });

  it('computes calls/total/rows deltas correctly for a normal window', () => {
    const result = computeStatDelta(currentRow(), priorRow(), null);
    expect(result.isNewQuery).toBe(false);
    expect(result.resetDetected).toBe(false);
    expect(result.callsDelta).toBe(100);
    expect(result.totalExecMsDelta).toBe(1_000);
    expect(result.meanExecMsWindow).toBe(10); // 1000ms / 100 calls
    expect(result.rowsDelta).toBe(100);
  });

  it('meanExecMsWindow is null when callsDelta is 0 (no division by zero)', () => {
    const result = computeStatDelta(currentRow({ calls: 900, totalExecMs: 4_000 }), priorRow(), null);
    expect(result.callsDelta).toBe(0);
    expect(result.meanExecMsWindow).toBeNull();
  });

  it('detects a reset via CHANGED stats_reset_at', () => {
    const result = computeStatDelta(currentRow(), priorRow({ statsResetAt: '2026-02-03T22:57:27.000Z' }), '2026-09-03T00:00:00.000Z');
    expect(result.resetDetected).toBe(true);
    expect(result.callsDelta).toBeNull();
  });

  it('detects a reset via a NEGATIVE counter delta even with unchanged (null) stats_reset_at — the queryid-evicted-and-reappeared shape', () => {
    const result = computeStatDelta(currentRow({ calls: 5 }), priorRow({ calls: 900, statsResetAt: null }), null);
    expect(result.resetDetected).toBe(true);
    expect(result.totalExecMsDelta).toBeNull();
  });
});

describe('updateStatBaseline', () => {
  it('starts fresh (sampleCount 0-or-1, collecting) for a new query', () => {
    const delta = computeStatDelta(currentRow(), null, null);
    const baseline = updateStatBaseline(null, delta);
    expect(baseline.baselineStatus).toBe('collecting');
    expect(baseline.sampleCount).toBe(0); // no calls delta available yet
  });

  it('starts fresh after a detected reset, discarding the prior baseline', () => {
    const priorEstablished = priorRow({ sampleCount: 20, baselineStatus: 'established', meanExecMsBaseline: 999 });
    const delta = computeStatDelta(currentRow({ calls: 5 }), priorEstablished, null); // triggers reset (negative delta)
    const baseline = updateStatBaseline(priorEstablished, delta);
    expect(baseline.baselineStatus).toBe('collecting');
    expect(baseline.meanExecMsBaseline).not.toBe(999);
  });

  it('carries the baseline forward unchanged on a window with zero new calls', () => {
    const prior = priorRow({ sampleCount: 6, baselineStatus: 'established', meanExecMsBaseline: 42 });
    const delta = computeStatDelta(currentRow({ calls: prior.calls, totalExecMs: prior.totalExecMs }), prior, null);
    const baseline = updateStatBaseline(prior, delta);
    expect(baseline.sampleCount).toBe(6); // unchanged — a silent window teaches nothing
    expect(baseline.meanExecMsBaseline).toBe(42);
  });

  it('increments sampleCount and flips to established once BASELINE_MIN_SAMPLES is reached', () => {
    const prior = priorRow({ sampleCount: BASELINE_MIN_SAMPLES - 1, baselineStatus: 'collecting', meanExecMsBaseline: 5 });
    const delta = computeStatDelta(currentRow(), prior, null);
    const baseline = updateStatBaseline(prior, delta);
    expect(baseline.sampleCount).toBe(BASELINE_MIN_SAMPLES);
    expect(baseline.baselineStatus).toBe('established');
  });

  it('stays collecting below the threshold', () => {
    const prior = priorRow({ sampleCount: 1, baselineStatus: 'collecting', meanExecMsBaseline: 5 });
    const delta = computeStatDelta(currentRow(), prior, null);
    const baseline = updateStatBaseline(prior, delta);
    expect(baseline.sampleCount).toBe(2);
    expect(baseline.baselineStatus).toBe('collecting');
  });

  it('EMA-blends the mean toward the new window value rather than jumping to it', () => {
    const prior = priorRow({ meanExecMsBaseline: 10, sampleCount: BASELINE_MIN_SAMPLES, baselineStatus: 'established' });
    // window mean will be much higher than 10
    const delta = computeStatDelta(currentRow({ calls: 1_000, totalExecMs: 4_000 + 100_000 }), prior, null);
    const baseline = updateStatBaseline(prior, delta);
    expect(baseline.meanExecMsBaseline).toBeGreaterThan(10);
    expect(baseline.meanExecMsBaseline).toBeLessThan(delta.meanExecMsWindow ?? Infinity);
  });
});

describe('detectQueryRegression', () => {
  it('flags new_query regardless of baseline maturity', () => {
    const delta = computeStatDelta(currentRow(), null, null);
    const baseline = updateStatBaseline(null, delta);
    const flags = detectQueryRegression(delta, baseline);
    expect(flags).toContain('new_query');
  });

  it('emits no flags while the baseline is still collecting', () => {
    const prior = priorRow({ baselineStatus: 'collecting', sampleCount: 1 });
    const delta = computeStatDelta(currentRow({ totalExecMs: 4_000 + 100_000 }), prior, null); // huge window, would regress if established
    const baseline = { ...updateStatBaseline(prior, delta), baselineStatus: 'collecting' as const };
    const flags = detectQueryRegression(delta, baseline);
    expect(flags).toEqual([]);
  });

  it('flags mean_3x_baseline when the window mean is >= 3x the established baseline', () => {
    const prior = priorRow({ meanExecMsBaseline: 10, baselineStatus: 'established', sampleCount: BASELINE_MIN_SAMPLES });
    // 100 calls, 3500ms total => mean 35ms, which is 3.5x baseline of 10
    const delta = computeStatDelta(currentRow({ calls: 1_000, totalExecMs: 4_000 + 3_500 }), prior, null);
    const baseline = updateStatBaseline(prior, delta);
    const flags = detectQueryRegression(delta, { ...baseline, meanExecMsBaseline: 10, baselineStatus: 'established' });
    expect(flags).toContain('mean_3x_baseline');
  });

  it('flags max_reaches_timeout when maxExecMsObserved crosses the statement timeout', () => {
    const prior = priorRow();
    const delta = computeStatDelta(currentRow({ maxExecMs: 31_000 }), prior, null);
    const baseline = updateStatBaseline(prior, delta);
    const flags = detectQueryRegression(delta, baseline, { statementTimeoutMs: 30_000 });
    expect(flags).toContain('max_reaches_timeout');
  });

  it('does not flag max_reaches_timeout below the threshold', () => {
    const prior = priorRow();
    const delta = computeStatDelta(currentRow({ maxExecMs: 100 }), prior, null);
    const baseline = updateStatBaseline(prior, delta);
    const flags = detectQueryRegression(delta, baseline, { statementTimeoutMs: 30_000 });
    expect(flags).not.toContain('max_reaches_timeout');
  });

  it('flags rows_per_call_explosion when rows/call is >= 5x the baseline', () => {
    const prior = priorRow({ rowsPerCallBaseline: 1, baselineStatus: 'established', sampleCount: BASELINE_MIN_SAMPLES });
    // callsDelta=100, rowsDelta=600 => 6 rows/call, 6x baseline of 1
    const delta = computeStatDelta(currentRow({ calls: 1_000, rows: 900 + 600 }), prior, null);
    const baseline = updateStatBaseline(prior, delta);
    const flags = detectQueryRegression(delta, { ...baseline, rowsPerCallBaseline: 1, baselineStatus: 'established' });
    expect(flags).toContain('rows_per_call_explosion');
  });

  it('a healthy window against an established baseline produces no flags', () => {
    const prior = priorRow({ meanExecMsBaseline: 10, rowsPerCallBaseline: 1, baselineStatus: 'established', sampleCount: BASELINE_MIN_SAMPLES });
    const delta = computeStatDelta(currentRow({ calls: 1_000, totalExecMs: 4_000 + 1_000, rows: 900 + 100 }), prior, null);
    const baseline = updateStatBaseline(prior, delta);
    const flags = detectQueryRegression(delta, baseline, { statementTimeoutMs: 30_000 });
    expect(flags).toEqual([]);
  });

  it('a reset window produces no comparison flags (nothing comparable)', () => {
    const prior = priorRow({ calls: 900 });
    const delta = computeStatDelta(currentRow({ calls: 5 }), prior, null); // triggers reset
    const baseline = updateStatBaseline(prior, delta);
    const flags = detectQueryRegression(delta, baseline);
    expect(flags).toEqual([]);
  });
});
