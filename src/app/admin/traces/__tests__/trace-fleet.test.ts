import { describe, it, expect } from 'vitest';
import { summarizeTraceFleet, stepCoverage } from '../trace-fleet';
import type { FlightTraceRun } from '@/app/admin/actions/golf-tracer';

function run(over: Partial<FlightTraceRun> = {}): FlightTraceRun {
  return {
    trace_id: Math.random().toString(16).slice(2),
    workflow: 'golf.round.autosave',
    status: 'success',
    started_at: '2026-09-01T15:27:15.689Z',
    duration_ms: 437,
    round_id: null,
    failure_step: null,
    missing_required_step_count: 0,
    expected_step_count: 8,
    observed_step_count: 7,
    ...over,
  };
}

describe('summarizeTraceFleet', () => {
  /**
   * The production distribution read on 2026-09-01, reproduced exactly. This
   * is the shape the tab has to communicate, so it is the shape under test.
   */
  const production = [
    ...Array.from({ length: 40 }, () => run({ status: 'success', missing_required_step_count: 6 })),
    ...Array.from({ length: 4 }, () => run({ status: 'success', missing_required_step_count: 0 })),
    ...Array.from({ length: 3 }, () => run({ status: 'failure', missing_required_step_count: 6 })),
    run({ status: 'warning', missing_required_step_count: 3 }),
    run({ status: 'warning', missing_required_step_count: 6 }),
    run({ workflow: 'golf.round.submit', status: 'success', missing_required_step_count: 6 }),
  ];

  it('separates coverage from outcome instead of adding them together', () => {
    const s = summarizeTraceFleet(production);
    expect(s.total).toBe(50);
    // Coverage axis: 46 short, 4 complete.
    expect(s.short).toBe(46);
    expect(s.complete).toBe(4);
    // Outcome axis, counted independently — NOT 46 problems.
    expect(s.failed).toBe(3);
    expect(s.warning).toBe(2);
    expect(s.failed + s.warning).toBeLessThan(s.short);
  });

  it('finds the dominant gap so one uninstrumented region is distinguishable from scattered ones', () => {
    expect(summarizeTraceFleet(production).dominantGap).toEqual({ missing: 6, runs: 45 });
  });

  it('names every workflow present, so a mixed fleet is never read as one', () => {
    expect(summarizeTraceFleet(production).workflows).toEqual([
      'golf.round.autosave',
      'golf.round.submit',
    ]);
  });

  it('counts a failure_step as failed even when the status column says otherwise', () => {
    const s = summarizeTraceFleet([run({ status: 'success', failure_step: 'db.submit_round_atomic' })]);
    expect(s.failed).toBe(1);
  });

  it('returns a valid zero summary for an empty fleet', () => {
    expect(summarizeTraceFleet([])).toEqual({
      total: 0,
      complete: 0,
      short: 0,
      failed: 0,
      warning: 0,
      dominantGap: null,
      workflows: [],
    });
  });
});

describe('stepCoverage', () => {
  it('reports observed against declared', () => {
    expect(stepCoverage(run({ observed_step_count: 7, expected_step_count: 8 }))).toEqual({
      observed: 7,
      expected: 8,
      percent: 88,
    });
  });

  it('returns null rather than inventing a denominator', () => {
    // A missing count rendered as 0/0 or 100% is unknown-as-healthy.
    expect(stepCoverage(run({ expected_step_count: null }))).toBeNull();
    expect(stepCoverage(run({ observed_step_count: undefined }))).toBeNull();
    expect(stepCoverage(run({ expected_step_count: 0 }))).toBeNull();
  });
});
