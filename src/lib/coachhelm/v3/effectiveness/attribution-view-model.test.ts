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
    // Default null (no anchor claim) — the anchor-label tests below pass
    // 'action'/'exposure' explicitly; every pre-existing test above this
    // gets the pre-Package-10 label text unchanged.
    anchor_kind: null,
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

describe('Package 10: anchor label ("since first shown" / "since you acted on it")', () => {
  it('anchor_kind: exposure on a clean (observed_change) result readout appends "(since first shown)" to the description', () => {
    const readout = rowToAttributionReadout(makeRow({ anchor_kind: 'exposure' }));
    expect(readout.state).toBe('result');
    if (readout.state === 'result') {
      expect(readout.method.label).toBe('observed_change');
      expect(readout.method.description).toBe('Observed change on comparable shots (since first shown)');
    }
  });

  it('anchor_kind: exposure on an observed_change_limited result readout also appends the suffix', () => {
    const readout = rowToAttributionReadout(
      makeRow({ method_version: COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION, anchor_kind: 'exposure' }),
    );
    expect(readout.state).toBe('result');
    if (readout.state === 'result') {
      expect(readout.method.label).toBe('observed_change_limited');
      expect(readout.method.description).toBe(
        "Observed change — another change happened in the same window, so it can't be isolated (since first shown)",
      );
    }
  });

  it('anchor_kind: exposure on an insufficient (below sample-size floor) readout also gets the suffix — the label applies regardless of state', () => {
    const readout = rowToAttributionReadout(
      makeRow({ anchor_kind: 'exposure', n_rounds_before: 1, n_rounds_after: 1 }),
    );
    expect(readout.state).toBe('insufficient');
    expect(readout.method.description).toBe('Observed change on comparable shots (since first shown)');
  });

  it('anchor_kind: action on a clean (observed_change) result readout appends "(since you acted on it)" to the description', () => {
    const readout = rowToAttributionReadout(makeRow({ anchor_kind: 'action' }));
    expect(readout.state).toBe('result');
    if (readout.state === 'result') {
      expect(readout.method.label).toBe('observed_change');
      expect(readout.method.description).toBe('Observed change on comparable shots (since you acted on it)');
      expect(readout.method.description).not.toContain('since first shown');
    }
  });

  it('anchor_kind: action on an observed_change_limited result readout also appends the "since you acted on it" suffix', () => {
    const readout = rowToAttributionReadout(
      makeRow({ method_version: COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION, anchor_kind: 'action' }),
    );
    expect(readout.state).toBe('result');
    if (readout.state === 'result') {
      expect(readout.method.label).toBe('observed_change_limited');
      expect(readout.method.description).toBe(
        "Observed change — another change happened in the same window, so it can't be isolated (since you acted on it)",
      );
    }
  });

  it('anchor_kind: null (round-level/unknown rows) gets no suffix, regardless of method label', () => {
    const readout = rowToAttributionReadout(makeRow({ anchor_kind: null }));
    expect(readout.state).toBe('result');
    if (readout.state === 'result') {
      expect(readout.method.description).not.toContain('since first shown');
      expect(readout.method.description).not.toContain('since you acted on it');
    }
  });

  it('defensive: withAnchorLabel only touches observed_change/observed_change_limited — an exposure- or action-anchored earlier_method or unknown row (should never happen in practice, since attribution-read.ts only ever sets anchor_kind for comparable method_versions) still gets no suffix', () => {
    for (const anchorKind of ['exposure', 'action'] as const) {
      const earlierMethod = rowToAttributionReadout(
        makeRow({ method_version: null, anchor_kind: anchorKind }),
      );
      expect(earlierMethod.state).toBe('result');
      if (earlierMethod.state === 'result') {
        expect(earlierMethod.method.label).toBe('earlier_method');
        expect(earlierMethod.method.description).not.toContain('since first shown');
        expect(earlierMethod.method.description).not.toContain('since you acted on it');
      }

      const unknown = rowToAttributionReadout(
        makeRow({ method_version: 'some_future_method_v7', anchor_kind: anchorKind }),
      );
      expect(unknown.state).toBe('result');
      if (unknown.state === 'result') {
        expect(unknown.method.label).toBe('unknown');
        expect(unknown.method.description).not.toContain('since first shown');
        expect(unknown.method.description).not.toContain('since you acted on it');
      }
    }
  });
});
