import { describe, it, expect } from 'vitest';
import {
  EM_DASH,
  displayValue,
  durationBarPercent,
  deriveTraceTotalMs,
  reconcileObservedStepCount,
  resolveTotalDurationMs,
  extractStatusDowngrade,
} from '../trace-view-helpers';

describe('displayValue', () => {
  it('renders the em dash for null, undefined, and empty string', () => {
    expect(displayValue(null)).toBe(EM_DASH);
    expect(displayValue(undefined)).toBe(EM_DASH);
    expect(displayValue('')).toBe(EM_DASH);
  });

  it('passes through a real value unchanged, including a legitimate 0', () => {
    expect(displayValue('golf_shots')).toBe('golf_shots');
    expect(displayValue(0)).toBe(0);
  });
});

describe('durationBarPercent', () => {
  it('computes a proportional share of the trace total, rounded to one decimal', () => {
    expect(durationBarPercent(297, 1000)).toBe(29.7);
    expect(durationBarPercent(250, 1000)).toBe(25);
  });

  it('never exceeds 100, even when a step somehow outlasts the reference total', () => {
    // Can happen honestly: the reference is a sum-of-roots fallback, and one
    // root's own recorded duration can exceed that fallback due to rounding.
    expect(durationBarPercent(1500, 1000)).toBe(100);
  });

  it('is zero for a step with no recorded duration — never a fabricated sliver', () => {
    expect(durationBarPercent(null, 1000)).toBe(0);
  });

  it('is zero when there is no positive total to measure against', () => {
    expect(durationBarPercent(297, 0)).toBe(0);
    expect(durationBarPercent(297, -10)).toBe(0);
  });

  it('treats a negative or non-finite duration as unusable rather than inverting the bar', () => {
    expect(durationBarPercent(-5, 1000)).toBe(0);
    expect(durationBarPercent(Number.NaN, 1000)).toBe(0);
    expect(durationBarPercent(297, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('handles a genuine zero-duration step as an empty (not full) bar', () => {
    expect(durationBarPercent(0, 1000)).toBe(0);
  });
});

describe('deriveTraceTotalMs', () => {
  it('prefers the authoritative run duration when it is known', () => {
    expect(deriveTraceTotalMs(439, [2, 17, 8, 412])).toBe(439);
  });

  it('falls back to the sum of root-level durations when the run duration is unknown', () => {
    expect(deriveTraceTotalMs(null, [2, 17, 8, 412])).toBe(439);
  });

  it('treats a missing root duration as 0 rather than throwing off the sum', () => {
    expect(deriveTraceTotalMs(null, [2, null, 8, 412])).toBe(422);
  });

  it('is 0, not NaN or a crash, when nothing is known at all', () => {
    expect(deriveTraceTotalMs(null, [])).toBe(0);
    expect(deriveTraceTotalMs(null, [null, null])).toBe(0);
  });

  it('ignores a non-finite run duration rather than propagating it', () => {
    expect(deriveTraceTotalMs(Number.NaN, [2, 17])).toBe(19);
  });
});

describe('reconcileObservedStepCount', () => {
  it('overwrites observed_step_count with the actual fetched steps length', () => {
    const run = { observed_step_count: 1, expected_step_count: 8, missing_required_step_count: 3 };
    const reconciled = reconcileObservedStepCount(run, 7);
    expect(reconciled.observed_step_count).toBe(7);
  });

  it('leaves every other field untouched', () => {
    const run = { observed_step_count: 1, expected_step_count: 8, missing_required_step_count: 3, status: 'success' };
    const reconciled = reconcileObservedStepCount(run, 7);
    expect(reconciled.expected_step_count).toBe(8);
    expect(reconciled.missing_required_step_count).toBe(3);
    expect(reconciled.status).toBe('success');
  });

  it('returns null/undefined unchanged rather than fabricating a run', () => {
    expect(reconcileObservedStepCount(null, 5)).toBeNull();
    expect(reconcileObservedStepCount(undefined, 5)).toBeUndefined();
  });

  it('does not mutate the input object', () => {
    const run = { observed_step_count: 1 };
    const reconciled = reconcileObservedStepCount(run, 9);
    expect(run.observed_step_count).toBe(1);
    expect(reconciled).not.toBe(run);
  });
});

describe('resolveTotalDurationMs', () => {
  it('returns the run duration_ms untouched — never a sum of step durations', () => {
    expect(resolveTotalDurationMs({ duration_ms: 439 })).toBe(439);
  });

  it('is null when the run has no duration_ms', () => {
    expect(resolveTotalDurationMs({ duration_ms: null })).toBeNull();
    expect(resolveTotalDurationMs({})).toBeNull();
  });

  it('is null when the run itself is null or undefined', () => {
    expect(resolveTotalDurationMs(null)).toBeNull();
    expect(resolveTotalDurationMs(undefined)).toBeNull();
  });

  it('ignores a non-finite duration_ms the same way deriveTraceTotalMs does', () => {
    expect(resolveTotalDurationMs({ duration_ms: Number.NaN })).toBeNull();
  });
});

describe('extractStatusDowngrade', () => {
  it('reads status_downgraded_from/reason when both are present strings', () => {
    // Exact key names written by helm_debug_finalize_trace in
    // 20260901140000_trace_cannot_claim_success_while_blind.sql.
    const metadata = {
      status_downgraded_from: 'success',
      status_downgraded_reason: 'required steps missing or no steps recorded',
    };
    expect(extractStatusDowngrade(metadata)).toEqual({
      from: 'success',
      reason: 'required steps missing or no steps recorded',
    });
  });

  it('is null when neither field is present', () => {
    expect(extractStatusDowngrade({})).toBeNull();
  });

  it('is null when only one of the two fields is present', () => {
    expect(extractStatusDowngrade({ status_downgraded_from: 'success' })).toBeNull();
    expect(extractStatusDowngrade({ status_downgraded_reason: 'x' })).toBeNull();
  });

  it('is null for non-object or null/undefined metadata', () => {
    expect(extractStatusDowngrade(null)).toBeNull();
    expect(extractStatusDowngrade(undefined)).toBeNull();
    expect(extractStatusDowngrade('not an object')).toBeNull();
    expect(extractStatusDowngrade(['array'])).toBeNull();
  });

  it('is null when the fields are present but not strings', () => {
    expect(extractStatusDowngrade({ status_downgraded_from: 1, status_downgraded_reason: 2 })).toBeNull();
  });
});
