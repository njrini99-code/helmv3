import { describe, it, expect } from 'vitest';
import {
  filterRunsInWindow,
  countDistinctStepKeys,
  countStepsWithIdentity,
  findZeroStepRuns,
  findDowngradedRuns,
  coverageNotGuaranteed,
  summarizeFlightRecorderAudit,
} from '../flight-recorder-audit-lib.mjs';

const NOW = new Date('2026-09-02T18:00:00.000Z').getTime();
const WINDOW_HOURS = 24;
const WINDOW_START = NOW - WINDOW_HOURS * 3600_000; // 2026-09-01T18:00:00.000Z

function run(traceId: string, startedAt: string) {
  return { trace_id: traceId, started_at: startedAt };
}

describe('filterRunsInWindow', () => {
  it('keeps only runs started at or after the window start', () => {
    const runs = [
      run('in', '2026-09-02T00:00:00.000Z'),
      run('boundary', '2026-09-01T18:00:00.000Z'),
      run('out', '2026-09-01T00:00:00.000Z'),
    ];
    expect(filterRunsInWindow(runs, WINDOW_START).map((r) => r.trace_id)).toEqual(['in', 'boundary']);
  });

  it('drops a run with no started_at rather than crashing', () => {
    const runs = [{ trace_id: 'x', started_at: null }];
    expect(filterRunsInWindow(runs, WINDOW_START)).toEqual([]);
  });

  it('is empty for an empty input', () => {
    expect(filterRunsInWindow([], WINDOW_START)).toEqual([]);
  });
});

describe('countDistinctStepKeys', () => {
  it('counts unique step_key values, ignoring duplicates', () => {
    const steps = [{ step_key: 'a' }, { step_key: 'b' }, { step_key: 'a' }];
    expect(countDistinctStepKeys(steps)).toBe(2);
  });

  it('ignores rows with no step_key', () => {
    const steps = [{ step_key: 'a' }, { step_key: null }, {}];
    expect(countDistinctStepKeys(steps)).toBe(1);
  });

  it('is 0 for no steps', () => {
    expect(countDistinctStepKeys([])).toBe(0);
  });
});

describe('countStepsWithIdentity', () => {
  it('counts a row with function_name OR table_name set', () => {
    const steps = [
      { function_name: 'submit_round_atomic' },
      { table_name: 'golf_shots' },
      { function_name: 'x', table_name: 'y' },
      {},
    ];
    expect(countStepsWithIdentity(steps)).toBe(3);
  });

  it('is 0 when nothing carries identity', () => {
    expect(countStepsWithIdentity([{ step_key: 'a' }])).toBe(0);
  });
});

describe('findZeroStepRuns', () => {
  it('returns trace ids for runs with no steps recorded', () => {
    const runs = [run('a', '2026-09-02T00:00:00.000Z'), run('b', '2026-09-02T00:00:00.000Z')];
    const counts = new Map([['a', 0], ['b', 3]]);
    expect(findZeroStepRuns(runs, counts)).toEqual(['a']);
  });

  it('treats a run absent from the count map as zero steps too', () => {
    const runs = [run('a', '2026-09-02T00:00:00.000Z')];
    expect(findZeroStepRuns(runs, new Map())).toEqual(['a']);
  });
});

describe('findDowngradedRuns', () => {
  it('returns trace ids whose metadata carries status_downgraded_from', () => {
    const rows = [
      { trace_id: 'a', metadata: { status_downgraded_from: 'success', status_downgraded_reason: 'x' } },
      { trace_id: 'b', metadata: {} },
      { trace_id: 'c', metadata: null },
    ];
    expect(findDowngradedRuns(rows)).toEqual(['a']);
  });

  it('is empty when nothing was downgraded', () => {
    expect(findDowngradedRuns([{ trace_id: 'a', metadata: {} }])).toEqual([]);
  });

  it('is unaffected by a malformed metadata value', () => {
    expect(findDowngradedRuns([{ trace_id: 'a', metadata: 'not an object' }])).toEqual([]);
  });
});

describe('coverageNotGuaranteed', () => {
  it('is true when the RPC returned exactly the cap AND the oldest of those rows is still inside the window', () => {
    // 200 rows, ordered desc by started_at (as helm_debug_list_traces returns them);
    // if row #200 (the oldest fetched) is still within the last 24h, there could be
    // MORE rows older than it that were also in the window but got truncated by the cap.
    const rows = Array.from({ length: 200 }, (_, i) => run(`t${i}`, '2026-09-02T00:00:00.000Z'));
    expect(coverageNotGuaranteed(rows, 200, WINDOW_START)).toBe(true);
  });

  it('is false when fewer rows than the cap were returned — nothing was truncated', () => {
    const rows = Array.from({ length: 50 }, (_, i) => run(`t${i}`, '2026-09-02T00:00:00.000Z'));
    expect(coverageNotGuaranteed(rows, 200, WINDOW_START)).toBe(false);
  });

  it('is false when the cap was hit but the oldest row already falls outside the window', () => {
    const rows = [
      ...Array.from({ length: 199 }, (_, i) => run(`t${i}`, '2026-09-02T00:00:00.000Z')),
      run('oldest', '2026-08-01T00:00:00.000Z'),
    ];
    expect(coverageNotGuaranteed(rows, 200, WINDOW_START)).toBe(false);
  });

  it('is false for an empty result', () => {
    expect(coverageNotGuaranteed([], 200, WINDOW_START)).toBe(false);
  });
});

describe('summarizeFlightRecorderAudit', () => {
  it('assembles the five required figures from runs + per-trace details', () => {
    const runsFromRpc = [
      run('a', '2026-09-02T00:00:00.000Z'),
      run('b', '2026-09-02T01:00:00.000Z'),
      run('old', '2026-08-01T00:00:00.000Z'), // outside the window
    ];
    const detailsByTraceId = new Map([
      ['a', { run: { metadata: {} }, steps: [{ step_key: 'x', function_name: 'f' }, { step_key: 'y' }] }],
      ['b', { run: { metadata: { status_downgraded_from: 'success', status_downgraded_reason: 'r' } }, steps: [] }],
    ]);
    const summary = summarizeFlightRecorderAudit({
      runsFromRpc,
      limit: 200,
      windowHours: WINDOW_HOURS,
      nowMs: NOW,
      detailsByTraceId,
    });
    expect(summary.runsInWindowCount).toBe(2);
    expect(summary.stepsInWindowCount).toBe(2);
    expect(summary.distinctStepKeyCount).toBe(2);
    expect(summary.stepsWithIdentityCount).toBe(1);
    expect(summary.zeroStepRunTraceIds).toEqual(['b']);
    expect(summary.downgradedRunTraceIds).toEqual(['b']);
    expect(summary.coverageNotGuaranteed).toBe(false);
  });

  it('treats a run with no matching detail as zero steps rather than throwing', () => {
    const runsFromRpc = [run('a', '2026-09-02T00:00:00.000Z')];
    const summary = summarizeFlightRecorderAudit({
      runsFromRpc,
      limit: 200,
      windowHours: WINDOW_HOURS,
      nowMs: NOW,
      detailsByTraceId: new Map(),
    });
    expect(summary.zeroStepRunTraceIds).toEqual(['a']);
    expect(summary.stepsInWindowCount).toBe(0);
  });
});
