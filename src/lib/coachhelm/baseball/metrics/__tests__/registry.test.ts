/**
 * The baseball metric registry had no test naming any of its accessors, and
 * three live call sites read from it:
 *
 *   src/app/baseball/actions/decision-room.ts:326-330       (label + unit shown
 *                                                            to a coach)
 *   src/app/baseball/actions/practice-effectiveness.ts:109  (id validation)
 *   src/components/baseball/practice-planner/PracticeRecapPanel.tsx:305
 *
 * A wrong unit or label here is invisible downstream — the number renders
 * either way — which is the profile that makes coverage worth more than it
 * looks. Filed as part of #1481.
 *
 * Asserted by IMPORTING the module rather than parsing the source. I tried the
 * regex route first and it silently matched zero entries (the records are
 * single-line and the field is `min_sample`, not `minSample`), which produced a
 * confident and completely wrong "56 ids missing metadata" result. Importing
 * cannot drift from the thing it is describing.
 */
import { describe, it, expect } from 'vitest';
import {
  BASEBALL_METRIC_IDS,
  BASEBALL_METRIC_META,
  isBaseballMetricId,
  getBaseballMetricDirection,
  baseballImprovementSign,
  getBaseballMetricUnit,
  getBaseballMetricFidelity,
  getBaseballMetricLabel,
  getBaseballMetricDomain,
} from '@/lib/coachhelm/baseball/metrics/registry';

const UNKNOWN = 'definitely_not_a_metric';

describe('registry completeness', () => {
  it('declares a non-trivial number of metrics (guards the fixture)', () => {
    expect(BASEBALL_METRIC_IDS.length).toBeGreaterThan(20);
  });

  it('has metadata for every declared id, and no metadata for anything else', () => {
    const metaKeys = Object.keys(BASEBALL_METRIC_META).sort();
    const ids = [...BASEBALL_METRIC_IDS].sort();
    expect(metaKeys).toEqual(ids);
  });

  it('gives every metric a complete record', () => {
    const incomplete = Object.entries(BASEBALL_METRIC_META)
      .filter(([, m]) => !m.label || !m.unit || !m.direction || !m.fidelity || !m.domain)
      .map(([id]) => id);
    expect(incomplete).toEqual([]);
  });

  it('never shows a coach two different metrics under the same label', () => {
    // `decision-room.ts` renders `getBaseballMetricLabel(metric)` directly, so a
    // duplicate label is two distinct measurements that read as one.
    const byLabel = new Map<string, string[]>();
    for (const [id, m] of Object.entries(BASEBALL_METRIC_META)) {
      byLabel.set(m.label, [...(byLabel.get(m.label) ?? []), id]);
    }
    const dupes = [...byLabel.entries()].filter(([, ids]) => ids.length > 1);
    expect(dupes).toEqual([]);
  });
});

describe('improvement direction', () => {
  /**
   * The safety property the file's own comment calls out: a workload metric is
   * monitored against a ceiling and has NO improvement direction, so attribution
   * must never score a change either way as getting better.
   */
  it('scores a neutral-threshold metric as neither better nor worse', () => {
    const neutral = Object.entries(BASEBALL_METRIC_META)
      .filter(([, m]) => m.direction === 'neutral_threshold')
      .map(([id]) => id);

    expect(neutral.length, 'expected at least one workload metric').toBeGreaterThan(0);
    for (const id of neutral) {
      expect(baseballImprovementSign(id), id).toBe(0);
    }
  });

  it('signs higher_better as +1 and lower_better as -1, for every metric', () => {
    for (const [id, m] of Object.entries(BASEBALL_METRIC_META)) {
      const expected = m.direction === 'higher_better' ? 1 : m.direction === 'lower_better' ? -1 : 0;
      expect(baseballImprovementSign(id), id).toBe(expected);
    }
  });
});

describe('unknown-id defaults are the conservative ones', () => {
  it('rejects an unknown id from the guard', () => {
    expect(isBaseballMetricId(UNKNOWN)).toBe(false);
    expect(isBaseballMetricId('k_rate')).toBe(true);
  });

  it('refuses to score an unknown metric as an improvement', () => {
    // The most important default: an unrecognised id must not be assigned a
    // direction, or a typo'd metric silently becomes "she improved".
    expect(getBaseballMetricDirection(UNKNOWN)).toBe('neutral_threshold');
    expect(baseballImprovementSign(UNKNOWN)).toBe(0);
  });

  it('degrades the remaining lookups honestly rather than guessing', () => {
    expect(getBaseballMetricUnit(UNKNOWN)).toBe('count');
    expect(getBaseballMetricFidelity(UNKNOWN)).toBe('proxy'); // never claims 'measured'
    expect(getBaseballMetricDomain(UNKNOWN)).toBe('operations');
    expect(getBaseballMetricLabel(UNKNOWN)).toBe(UNKNOWN); // echoes, never invents
  });
});

describe('accessors agree with the record they read', () => {
  it('returns each metric its own declared values', () => {
    for (const [id, m] of Object.entries(BASEBALL_METRIC_META)) {
      expect(getBaseballMetricUnit(id), id).toBe(m.unit);
      expect(getBaseballMetricFidelity(id), id).toBe(m.fidelity);
      expect(getBaseballMetricLabel(id), id).toBe(m.label);
      expect(getBaseballMetricDomain(id), id).toBe(m.domain);
      expect(getBaseballMetricDirection(id), id).toBe(m.direction);
    }
  });
});
