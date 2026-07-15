/**
 * Unit tests for generators/v10.ts's importQualityGenerator — the #811
 * residual. #811 threaded the deterministic engine run's nowIso through every
 * OTHER rolling-window loader (loadLiftMetrics / loadReadinessMetrics /
 * loadPlayerMetrics' workload calc / loadCatchingMetrics) but explicitly left
 * this generator's 14-day recency window on raw `Date.now()`, because
 * `BaseballV10EngineInputs` had no `now` field for generators at all yet. This
 * pins that the window is now computed from the caller-supplied `nowIso`, so a
 * deterministic engine run (fixed nowIso + seeded import runs) can never
 * silently drift as real time carries a `Date.now()`-based window past the
 * fixture dates — the exact bug class #811 fixed everywhere else.
 */

import { describe, it, expect } from 'vitest';
import { importQualityGenerator } from './v10';
import type { ImportRunSummary } from '../loaders-v10';

// Deliberately far from the real wall clock — if the generator ever regresses
// to Date.now() internally, every test below flips (a 2020 date is nowhere
// near "the last 14 days" of the real 2026+ clock).
const NOW = '2020-06-30T12:00:00.000Z';

function run(overrides: Partial<ImportRunSummary> = {}): ImportRunSummary {
  return {
    id: 'run-1',
    import_type: 'box_score',
    source_label: 'April CSV',
    status: 'validated',
    row_count: 20,
    warning_count: 6, // 30% warning rate, above the 15% threshold
    error_count: 0,
    created_at: NOW,
    ...overrides,
  };
}

describe('importQualityGenerator — nowIso threading (#811 residual)', () => {
  it('flags a run inside the 14-day window measured from the supplied nowIso, even though that window is nowhere near the real wall clock', () => {
    const insideWindow = run({ created_at: '2020-06-20T00:00:00.000Z' }); // 10 days before NOW
    const out = importQualityGenerator([insideWindow], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]?.generator).toBe('import_quality');
  });

  it('excludes a run older than 14 days from the supplied nowIso — proves the cutoff is NOW-14d, not Date.now()-14d', () => {
    const outsideWindow = run({ created_at: '2020-06-10T00:00:00.000Z' }); // 20 days before NOW
    const out = importQualityGenerator([outsideWindow], NOW);
    expect(out).toHaveLength(0);
  });

  it('defaults to the real wall clock when nowIso is omitted, so non-engine callers keep their existing real-time behavior unchanged', () => {
    const freshRun = run({ created_at: new Date().toISOString() });
    const out = importQualityGenerator([freshRun]); // no nowIso arg at all
    expect(out).toHaveLength(1);
  });

  it('still flags a FAILED run inside the window regardless of warning rate', () => {
    const failedRun = run({
      created_at: '2020-06-25T00:00:00.000Z',
      status: 'failed',
      warning_count: 0,
      error_count: 0,
    });
    const out = importQualityGenerator([failedRun], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Import failed');
  });
});
