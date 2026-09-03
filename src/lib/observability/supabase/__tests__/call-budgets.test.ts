import { describe, expect, it } from 'vitest';

import {
  CALL_BUDGET_MIN_WINDOWS,
  computeAllJourneyCallBaselines,
  computeJourneyCallBaseline,
  detectCallAmplification,
  type JourneyCallWindow,
} from '../call-budgets';

function window(overrides: Partial<JourneyCallWindow> = {}): JourneyCallWindow {
  return {
    journey: 'round_tracking',
    windowStartedAt: '2026-09-03T10:00:00.000Z',
    releaseSha: 'base111',
    dbCalls: 60,
    executions: 10,
    ...overrides,
  };
}

/** `count` windows of `dbCalls`/`executions` each. */
function windows(count: number, overrides: Partial<JourneyCallWindow> = {}): JourneyCallWindow[] {
  return Array.from({ length: count }, (_, i) =>
    window({ windowStartedAt: `2026-09-03T${String(10 + i).padStart(2, '0')}:00:00.000Z`, ...overrides }),
  );
}

describe('computeJourneyCallBaseline — measure before enforce', () => {
  it('reports collecting with a NULL value below the minimum window count', () => {
    const baseline = computeJourneyCallBaseline('round_tracking', windows(CALL_BUDGET_MIN_WINDOWS - 1));
    expect(baseline.baselineStatus).toBe('collecting');
    expect(baseline.baselineValue).toBeNull();
    expect(baseline.windowCount).toBe(CALL_BUDGET_MIN_WINDOWS - 1);
  });

  it('becomes ready at the minimum window count', () => {
    const baseline = computeJourneyCallBaseline('round_tracking', windows(CALL_BUDGET_MIN_WINDOWS));
    expect(baseline.baselineStatus).toBe('ready');
    expect(baseline.baselineValue).toBe(6); // 60 calls / 10 executions
    expect(baseline.unit).toBe('per-execution');
  });

  it('uses a MEDIAN, so one pathological window cannot drag the baseline up', () => {
    const normal = windows(6, { dbCalls: 60, executions: 10 });
    const withSpike: JourneyCallWindow[] = [
      ...normal,
      window({ windowStartedAt: '2026-09-03T20:00:00.000Z', dbCalls: 10_000, executions: 10 }),
    ];
    const baseline = computeJourneyCallBaseline('round_tracking', withSpike);
    expect(baseline.baselineValue).toBe(6);
  });

  it('falls back to per-window when ANY window lacks an execution count, never mixing units', () => {
    const mixed: JourneyCallWindow[] = [
      ...windows(4, { dbCalls: 60, executions: 10 }),
      window({ windowStartedAt: '2026-09-03T15:00:00.000Z', dbCalls: 60, executions: null }),
    ];
    const baseline = computeJourneyCallBaseline('round_tracking', mixed);
    expect(baseline.unit).toBe('per-window');
    expect(baseline.baselineValue).toBe(60);
  });

  it('ignores windows belonging to other journeys', () => {
    const mixed: JourneyCallWindow[] = [
      ...windows(5, { journey: 'round_tracking', dbCalls: 60, executions: 10 }),
      ...windows(5, { journey: 'lineup', dbCalls: 600, executions: 10 }),
    ];
    expect(computeJourneyCallBaseline('round_tracking', mixed).baselineValue).toBe(6);
    expect(computeJourneyCallBaseline('lineup', mixed).baselineValue).toBe(60);
  });

  it('records the releases the baseline spans', () => {
    const spread: JourneyCallWindow[] = [
      ...windows(3, { releaseSha: 'aaa' }),
      ...windows(3, { releaseSha: 'bbb' }),
    ];
    const baseline = computeJourneyCallBaseline('round_tracking', spread);
    expect([...baseline.baselineReleaseShas].sort()).toEqual(['aaa', 'bbb']);
  });

  it('an empty window set is collecting, never zero', () => {
    const baseline = computeJourneyCallBaseline('round_tracking', []);
    expect(baseline.baselineStatus).toBe('collecting');
    expect(baseline.baselineValue).toBeNull();
    expect(baseline.windowCount).toBe(0);
  });

  it('computeAllJourneyCallBaselines returns one baseline per journey', () => {
    const mixed: JourneyCallWindow[] = [
      ...windows(5, { journey: 'round_tracking' }),
      ...windows(2, { journey: 'lineup' }),
    ];
    const all = computeAllJourneyCallBaselines(mixed);
    expect(all.map((b) => b.journey)).toEqual(['lineup', 'round_tracking']);
    expect(all.find((b) => b.journey === 'lineup')?.baselineStatus).toBe('collecting');
    expect(all.find((b) => b.journey === 'round_tracking')?.baselineStatus).toBe('ready');
  });
});

describe('detectCallAmplification', () => {
  const readyBaseline = computeJourneyCallBaseline('round_tracking', windows(6, { dbCalls: 60, executions: 10 }));

  it('never flags anything while the baseline is collecting', () => {
    const collecting = computeJourneyCallBaseline('round_tracking', windows(2));
    const finding = detectCallAmplification({
      baseline: collecting,
      current: window({ dbCalls: 100_000, executions: 1 }),
    });
    expect(finding.amplified).toBe(false);
    expect(finding.ratio).toBeNull();
    expect(finding.reason).toContain('still collecting');
  });

  it('flags a genuine N+1 amplification against a ready baseline', () => {
    const finding = detectCallAmplification({
      baseline: readyBaseline,
      current: window({ dbCalls: 600, executions: 10, releaseSha: 'new222' }),
    });
    expect(finding.amplified).toBe(true);
    expect(finding.ratio).toBe(10);
    expect(finding.afterRelease).toBe(true);
  });

  it('does not flag more traffic at the same calls-per-execution', () => {
    const finding = detectCallAmplification({
      baseline: readyBaseline,
      current: window({ dbCalls: 6_000, executions: 1_000 }),
    });
    expect(finding.ratio).toBe(1);
    expect(finding.amplified).toBe(false);
  });

  it('does not flag a large RATIO on a tiny absolute increase', () => {
    const tinyBaseline = computeJourneyCallBaseline('tiny', windows(6, { journey: 'tiny', dbCalls: 10, executions: 10 }));
    const finding = detectCallAmplification({
      baseline: tinyBaseline,
      current: window({ journey: 'tiny', dbCalls: 30, executions: 10 }),
    });
    expect(finding.ratio).toBe(3);
    expect(finding.amplified).toBe(false);
    expect(finding.reason).toContain('below the absolute floor');
  });

  it('refuses the comparison on a unit mismatch rather than producing a meaningless ratio', () => {
    const finding = detectCallAmplification({
      baseline: readyBaseline, // per-execution
      current: window({ dbCalls: 600, executions: null }),
    });
    expect(finding.ratio).toBeNull();
    expect(finding.amplified).toBe(false);
    expect(finding.reason).toContain('means nothing');
  });

  it('reports afterRelease as null when either side does not name a release', () => {
    const finding = detectCallAmplification({
      baseline: readyBaseline,
      current: window({ dbCalls: 600, executions: 10, releaseSha: null }),
    });
    expect(finding.afterRelease).toBeNull();
    // Still flagged — a call explosion is worth seeing even unattributed.
    expect(finding.amplified).toBe(true);
  });

  it('flags amplification inside the SAME release too, marked afterRelease false', () => {
    const finding = detectCallAmplification({
      baseline: readyBaseline,
      current: window({ dbCalls: 600, executions: 10, releaseSha: 'base111' }),
    });
    expect(finding.afterRelease).toBe(false);
    expect(finding.amplified).toBe(true);
  });

  it('treats a zero baseline as unmeasured rather than dividing by it', () => {
    const zeroBaseline = computeJourneyCallBaseline('zero', windows(6, { journey: 'zero', dbCalls: 0, executions: 10 }));
    const finding = detectCallAmplification({
      baseline: zeroBaseline,
      current: window({ journey: 'zero', dbCalls: 100, executions: 10 }),
    });
    expect(finding.ratio).toBeNull();
    expect(finding.amplified).toBe(false);
    expect(finding.reason).toContain('still unmeasured');
  });

  it('honours an overridden ratio and floor, with no per-journey constant anywhere', () => {
    const finding = detectCallAmplification({
      baseline: readyBaseline,
      current: window({ dbCalls: 90, executions: 10 }), // 9 vs 6 = 1.5x, +3
      options: { amplificationRatio: 1.4, minAbsoluteIncrease: 2 },
    });
    expect(finding.amplified).toBe(true);
  });
});
