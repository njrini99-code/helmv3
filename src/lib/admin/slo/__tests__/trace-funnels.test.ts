import { describe, it, expect } from 'vitest';
import { buildFunnel } from '../trace-funnels';
import type { FlightTraceRun } from '@/app/admin/actions/golf-tracer';

function run(overrides: Partial<FlightTraceRun> = {}): FlightTraceRun {
  return {
    trace_id: 'trace-1',
    workflow: 'golf.round.submit',
    status: 'success',
    started_at: '2026-09-03T10:00:00.000Z',
    duration_ms: 500,
    round_id: 'round-1',
    failure_step: null,
    missing_required_step_count: 0,
    ...overrides,
  };
}

describe('buildFunnel', () => {
  it('an empty run set reports a real zero, not an error', () => {
    const funnel = buildFunnel('golf.round.submit', []);
    expect(funnel.status).toBe('ok');
    expect(funnel.sampledRuns).toBe(0);
    expect(funnel.hitCeiling).toBe(false);
    expect(funnel.dropoffs).toEqual([]);
  });

  it('tallies status counts across runs', () => {
    const funnel = buildFunnel('golf.round.submit', [
      run({ status: 'success' }),
      run({ status: 'success' }),
      run({ status: 'failure' }),
    ]);
    expect(funnel.statusCounts).toEqual({ success: 2, failure: 1 });
    expect(funnel.sampledRuns).toBe(3);
  });

  it('counts runs with missing required steps separately from failure status', () => {
    const funnel = buildFunnel('golf.round.submit', [
      run({ status: 'success', missing_required_step_count: 0 }),
      run({ status: 'success', missing_required_step_count: 2 }), // "succeeded" but incomplete
    ]);
    expect(funnel.missingRequiredStepRuns).toBe(1);
  });

  it('ranks dropoffs worst-first and caps at the top 5', () => {
    const rows: FlightTraceRun[] = [
      ...Array.from({ length: 5 }, () => run({ failure_step: 'server.auth' })),
      ...Array.from({ length: 2 }, () => run({ failure_step: 'db.submit' })),
      run({ failure_step: 'verify.round' }),
    ];
    const funnel = buildFunnel('golf.round.submit', rows);
    expect(funnel.dropoffs[0]).toEqual({ step: 'server.auth', failedCount: 5 });
    expect(funnel.dropoffs[1]).toEqual({ step: 'db.submit', failedCount: 2 });
    expect(funnel.dropoffs).toHaveLength(3);
  });

  it('a run with no failure_step contributes nothing to dropoffs', () => {
    const funnel = buildFunnel('golf.round.submit', [run({ failure_step: null, status: 'success' })]);
    expect(funnel.dropoffs).toEqual([]);
  });

  it('hitCeiling is true only when the sample equals the read ceiling (100)', () => {
    const under = buildFunnel('golf.round.submit', Array.from({ length: 99 }, () => run()));
    expect(under.hitCeiling).toBe(false);
    const at = buildFunnel('golf.round.submit', Array.from({ length: 100 }, () => run()));
    expect(at.hitCeiling).toBe(true);
  });
});
