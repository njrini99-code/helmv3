/**
 * A9 slice 3: pure view-model tests for `attribution-view-model.ts` — the
 * per-method_version labeling, the clean/limited distinction, the
 * sample-size floor, and the missing/insufficient/result state machine.
 * `attribution-read.ts` and the server action have their own test files.
 */
import { describe, it, expect } from 'vitest';
import {
  describeMethodVersion,
  rowToAttributionReadout,
  toAttributionReadout,
  MIN_SUFFICIENT_ROUNDS,
} from './attribution-view-model';
import { COMPARABLE_OPPORTUNITIES_METHOD_VERSION } from '@/lib/coachhelm/v3/evaluation/comparable-opportunities';
import { COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION } from '@/lib/coachhelm/v3/causality/comparable-attribute';
import type { AttributionRow } from './attribution-read';

function makeRow(over: Partial<AttributionRow> = {}): AttributionRow {
  return {
    insight_id: 'insight-1',
    target_metric_id: 'sg_total',
    baseline_value: 1,
    post_value: 2,
    delta: 1,
    n_rounds_before: MIN_SUFFICIENT_ROUNDS,
    n_rounds_after: MIN_SUFFICIENT_ROUNDS,
    method_version: COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
    ...over,
  };
}

describe('describeMethodVersion — labels per version', () => {
  it('null (no column, or a genuine NULL row) → earlier_method, never clean', () => {
    const info = describeMethodVersion(null);
    expect(info.label).toBe('earlier_method');
    expect(info.isClean).toBe(false);
  });

  it('v2_observed_delta (the round-level path) → earlier_method, never clean', () => {
    const info = describeMethodVersion('v2_observed_delta');
    expect(info.label).toBe('earlier_method');
    expect(info.isClean).toBe(false);
  });

  it('comparable_opportunities_v1 → observed_change, IS clean', () => {
    const info = describeMethodVersion(COMPARABLE_OPPORTUNITIES_METHOD_VERSION);
    expect(info.label).toBe('observed_change');
    expect(info.isClean).toBe(true);
  });

  it('comparable_opportunities_v1_limited → observed_change_limited, never clean (limited ≠ clean)', () => {
    const info = describeMethodVersion(COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION);
    expect(info.label).toBe('observed_change_limited');
    expect(info.isClean).toBe(false);
  });

  it('an unrecognized version string → unknown, a neutral fallback, never treated as clean', () => {
    const info = describeMethodVersion('some_future_method_v7');
    expect(info.label).toBe('unknown');
    expect(info.isClean).toBe(false);
  });

  it('no label ever asserts "improved", "proven", or "caused" (repair-plan §14.12 item a)', () => {
    for (const mv of [null, 'v2_observed_delta', COMPARABLE_OPPORTUNITIES_METHOD_VERSION, COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION, 'unknown_v9']) {
      const info = describeMethodVersion(mv);
      expect(info.description.toLowerCase()).not.toMatch(/\bimproved\b|\bproven\b|\bcaused\b/);
    }
  });
});

describe('rowToAttributionReadout — sample-size floor', () => {
  it('below MIN_SUFFICIENT_ROUNDS on either side → insufficient, even for the clean method', () => {
    const readout = rowToAttributionReadout(makeRow({ n_rounds_before: MIN_SUFFICIENT_ROUNDS - 1 }));
    expect(readout.state).toBe('insufficient');
  });

  it('below the floor on the AFTER side alone is still insufficient', () => {
    const readout = rowToAttributionReadout(makeRow({ n_rounds_after: MIN_SUFFICIENT_ROUNDS - 1 }));
    expect(readout.state).toBe('insufficient');
  });

  it('at or above the floor on both sides → result', () => {
    const readout = rowToAttributionReadout(makeRow());
    expect(readout.state).toBe('result');
  });

  it('a limited row with a healthy sample size is still `result` — limited is a method-quality flag, not a sample-size problem', () => {
    const readout = rowToAttributionReadout(makeRow({ method_version: COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION }));
    expect(readout.state).toBe('result');
    if (readout.state === 'result') {
      expect(readout.method.label).toBe('observed_change_limited');
      expect(readout.method.isClean).toBe(false);
    }
  });

  it('an insufficient readout still carries the method info and sample size (so the UI can show "3 rounds so far")', () => {
    const readout = rowToAttributionReadout(makeRow({ n_rounds_before: 1, n_rounds_after: 2 }));
    expect(readout).toEqual({
      state: 'insufficient',
      sampleSize: { before: 1, after: 2 },
      method: { label: 'observed_change', description: expect.any(String), isClean: true },
    });
  });
});

describe('toAttributionReadout — missing vs. result', () => {
  it('zero rows → missing (a legitimate, honest "never attributed yet" state)', () => {
    expect(toAttributionReadout([])).toEqual({ state: 'missing' });
  });

  it('one row → the same shape rowToAttributionReadout produces', () => {
    const row = makeRow();
    expect(toAttributionReadout([row])).toEqual(rowToAttributionReadout(row));
  });
});
