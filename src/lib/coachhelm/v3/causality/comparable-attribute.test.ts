/**
 * Unit tests for A9 slice 1's DB-backed adapter
 * (`causality/comparable-attribute.ts`). These exercise this module's OWN
 * orchestration — the real-exposure lookup, window computation, and mapping
 * a `computeComparableOpportunities` result to a row or a typed skip —
 * NOT the pure core's matching/aggregation math (that's
 * `src/test/coachhelm/v3/comparable-opportunities.test.ts`, PR #1992) and NOT
 * the cron's wiring (that's `src/test/api/cron/causality-attribute.test.ts`,
 * A9 slice 1's own describe block). `loadPlayerContext` and
 * `computeComparableOpportunities` are both mocked wholesale so a bad mock of
 * either can't quietly make this file assert against itself.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/coachhelm/v3/context/load-player-context', () => ({
  loadPlayerContext: vi.fn(),
}));

vi.mock('@/lib/coachhelm/v3/evaluation/comparable-opportunities', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/coachhelm/v3/evaluation/comparable-opportunities')
  >('@/lib/coachhelm/v3/evaluation/comparable-opportunities');
  return {
    // Real constants (METHOD_VERSION) stay real; only the compute function
    // is mocked, so the row this module builds still carries the SAME
    // version string production code does.
    COMPARABLE_OPPORTUNITIES_METHOD_VERSION: actual.COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
    computeComparableOpportunities: vi.fn(),
  };
});

import {
  isShotLevelAttributionMetric,
  computeComparableAttribution,
  writeComparableAttribution,
  type ComparableAttributionRow,
} from './comparable-attribute';
import { loadPlayerContext } from '@/lib/coachhelm/v3/context/load-player-context';
import {
  computeComparableOpportunities,
  COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
  type ComparableOpportunitiesResult,
} from '@/lib/coachhelm/v3/evaluation/comparable-opportunities';

const loadPlayerContextMock = vi.mocked(loadPlayerContext);
const computeComparableOpportunitiesMock = vi.mocked(computeComparableOpportunities);

const SHOWN_AT = '2026-08-01T00:00:00.000Z';

/** Chainable fake for `sb.from('golf_insight_exposure').select(...).eq(...)
 *  .order(...).limit(...).maybeSingle()`. */
function makeExposureClient(row: { shown_at: string } | null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'golf_insight_exposure') return builder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { client, builder };
}

function fullResult(over: Partial<ComparableOpportunitiesResult> = {}): ComparableOpportunitiesResult {
  return {
    status: 'observed_change',
    baseline: {
      scope: { player_id: 'player-1', window_start: '', window_end: '', analysis_cutoff: '' },
      dimensions: { metricId: 'approach_proximity_125_175ft', side: 'baseline' },
      metricId: 'approach_proximity_125_175ft',
      unit: 'feet',
      value: 22.4,
      numerator: null,
      denominator: 8,
      eligibleCount: 8,
      observedCount: 8,
      distinctRounds: 3,
      status: 'supported',
      exclusions: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    followUp: {
      scope: { player_id: 'player-1', window_start: '', window_end: '', analysis_cutoff: '' },
      dimensions: { metricId: 'approach_proximity_125_175ft', side: 'followUp' },
      metricId: 'approach_proximity_125_175ft',
      unit: 'feet',
      value: 18.1,
      numerator: null,
      denominator: 9,
      eligibleCount: 9,
      observedCount: 9,
      distinctRounds: 4,
      status: 'supported',
      exclusions: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    observedChange: -4.3,
    methodVersion: COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
    multipleInterventions: false,
    disclosedDifferences: {
      courseMix: { baselineOnly: [], followUpOnly: [], shared: [] },
      opportunityCountImbalance: 1,
    },
    ...over,
  };
}

describe('isShotLevelAttributionMetric', () => {
  it('is true for the three approach-proximity bands', () => {
    expect(isShotLevelAttributionMetric('approach_proximity_50_125ft')).toBe(true);
    expect(isShotLevelAttributionMetric('approach_proximity_125_175ft')).toBe(true);
    expect(isShotLevelAttributionMetric('approach_proximity_175_plus_ft')).toBe(true);
  });

  it('is false for a round-level metric and an unknown one', () => {
    expect(isShotLevelAttributionMetric('sg_total')).toBe(false);
    expect(isShotLevelAttributionMetric('not_a_real_metric')).toBe(false);
  });
});

describe('computeComparableAttribution', () => {
  beforeEach(() => {
    loadPlayerContextMock.mockReset().mockResolvedValue({
      shots: [],
      holes: [],
      coverage: {
        holesIncluded: 0,
        holesExcludedByReason: {},
        shotsExcludedByReason: {},
        partialSequenceCount: 0,
      },
    });
    computeComparableOpportunitiesMock.mockReset().mockReturnValue(fullResult());
  });

  it('returns unsupported-metric for a metric with no shot-level MatchingSpec, without querying anything', async () => {
    const { client } = makeExposureClient(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await computeComparableAttribution(client as any, {
      insight_id: 'insight-1',
      player_id: 'player-1',
      target_metric_id: 'sg_total',
    });

    expect(result).toEqual({ ok: false, reason: 'unsupported-metric' });
    expect(client.from).not.toHaveBeenCalled();
    expect(loadPlayerContextMock).not.toHaveBeenCalled();
  });

  it('returns no-exposure-record when golf_insight_exposure has zero rows — never estimates one from created_at', async () => {
    const { client } = makeExposureClient(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await computeComparableAttribution(client as any, {
      insight_id: 'insight-1',
      player_id: 'player-1',
      target_metric_id: 'approach_proximity_125_175ft',
    });

    expect(result).toEqual({ ok: false, reason: 'no-exposure-record' });
    expect(loadPlayerContextMock).not.toHaveBeenCalled();
    expect(computeComparableOpportunitiesMock).not.toHaveBeenCalled();
  });

  it('returns insufficient-evidence when the pure core reports it', async () => {
    const { client } = makeExposureClient({ shown_at: SHOWN_AT });
    computeComparableOpportunitiesMock.mockReturnValue(
      fullResult({
        status: 'insufficient_evidence',
        observedChange: null,
        baseline: { ...fullResult().baseline, value: null, status: 'insufficient' },
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await computeComparableAttribution(client as any, {
      insight_id: 'insight-1',
      player_id: 'player-1',
      target_metric_id: 'approach_proximity_125_175ft',
    });

    expect(result).toEqual({ ok: false, reason: 'insufficient-evidence' });
  });

  it('returns insufficient-evidence when observedChange/either side value is null even if status says otherwise (defensive)', async () => {
    const { client } = makeExposureClient({ shown_at: SHOWN_AT });
    computeComparableOpportunitiesMock.mockReturnValue(
      fullResult({ followUp: { ...fullResult().followUp, value: null } }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await computeComparableAttribution(client as any, {
      insight_id: 'insight-1',
      player_id: 'player-1',
      target_metric_id: 'approach_proximity_125_175ft',
    });

    expect(result).toEqual({ ok: false, reason: 'insufficient-evidence' });
  });

  it('on success, uses the REAL shown_at as intervention_at (never created_at) and carries the pure core numbers through', async () => {
    const { client, builder } = makeExposureClient({ shown_at: SHOWN_AT });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await computeComparableAttribution(client as any, {
      insight_id: 'insight-1',
      player_id: 'player-1',
      target_metric_id: 'approach_proximity_125_175ft',
    });

    expect(builder.eq).toHaveBeenCalledWith('insight_id', 'insight-1');
    expect(builder.order).toHaveBeenCalledWith('shown_at', { ascending: true });
    expect(builder.limit).toHaveBeenCalledWith(1);

    expect(result).toEqual({
      ok: true,
      row: {
        insight_id: 'insight-1',
        intervention_at: SHOWN_AT,
        target_metric_id: 'approach_proximity_125_175ft',
        baseline_value: 22.4,
        post_value: 18.1,
        delta: -4.3,
        n_rounds_before: 3,
        n_rounds_after: 4,
        method_version: COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
      },
    });
  });

  it('windows the baseline/follow-up around shown_at using the SAME PRE/POST_WINDOW_DAYS attribute.ts uses, and passes multipleInterventions: false', async () => {
    const { client } = makeExposureClient({ shown_at: SHOWN_AT });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await computeComparableAttribution(client as any, {
      insight_id: 'insight-1',
      player_id: 'player-1',
      target_metric_id: 'approach_proximity_125_175ft',
    });

    expect(computeComparableOpportunitiesMock).toHaveBeenCalledTimes(1);
    const call = computeComparableOpportunitiesMock.mock.calls[0]![0];
    expect(call.interventionAt).toBe(SHOWN_AT);
    expect(call.baselineWindow.end).toBe(SHOWN_AT);
    expect(call.baselineWindow.start).toBe('2026-07-18T00:00:00.000Z'); // 14 days before
    expect(call.followUpWindow.start).toBe(SHOWN_AT);
    expect(call.followUpWindow.end).toBe('2026-08-22T00:00:00.000Z'); // 21 days after
    expect(call.multipleInterventions).toBe(false);
    expect(call.metricId).toBe('approach_proximity_125_175ft');
    // The band-in-feet spec for this metric: 125–175 YARDS * 3 ft/yd.
    expect(call.spec.distanceBand).toEqual({ label: '125_175ft', minFt: 375, maxFt: 525 });
  });
});

describe('writeComparableAttribution', () => {
  function makeWriteClient(opts: { insertError?: { code?: string; message: string } } = {}) {
    const inserts: Record<string, unknown>[] = [];
    let callCount = 0;
    const builder = {
      insert: vi.fn((row: Record<string, unknown>) => {
        callCount += 1;
        inserts.push(row);
        if (opts.insertError && callCount === 1) {
          return Promise.resolve({ error: opts.insertError });
        }
        return Promise.resolve({ error: null });
      }),
    };
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'golf_insight_outcome_attribution') return builder;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    return { client, inserts };
  }

  const ROW: ComparableAttributionRow = {
    insight_id: 'insight-1',
    intervention_at: SHOWN_AT,
    target_metric_id: 'approach_proximity_125_175ft',
    baseline_value: 22.4,
    post_value: 18.1,
    delta: -4.3,
    n_rounds_before: 3,
    n_rounds_after: 4,
    method_version: COMPARABLE_OPPORTUNITIES_METHOD_VERSION,
  };

  it('writes lift: null unconditionally — this function has no parameter that could set it otherwise', async () => {
    const { client, inserts } = makeWriteClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await writeComparableAttribution(client as any, ROW);

    expect(result).toEqual({ written: true, methodVersionColumnMissing: false });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.lift).toBeNull();
    expect(inserts[0]!.method_version).toBe(COMPARABLE_OPPORTUNITIES_METHOD_VERSION);
  });

  it('degrades and retries without method_version on a PGRST204 unknown-column error', async () => {
    const { client, inserts } = makeWriteClient({
      insertError: { code: 'PGRST204', message: "Could not find the 'method_version' column" },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await writeComparableAttribution(client as any, ROW);

    expect(result).toEqual({ written: true, methodVersionColumnMissing: true });
    expect(inserts).toHaveLength(2);
    expect('method_version' in inserts[0]!).toBe(true);
    expect('method_version' in inserts[1]!).toBe(false);
    expect(inserts[1]!.lift).toBeNull();
  });

  it('degrades and retries on a raw-Postgres 42703 unknown-column error', async () => {
    const { client, inserts } = makeWriteClient({
      insertError: { code: '42703', message: 'column "method_version" does not exist' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await writeComparableAttribution(client as any, ROW);

    expect(result.methodVersionColumnMissing).toBe(true);
    expect(result.written).toBe(true);
    expect(inserts).toHaveLength(2);
  });

  it('does NOT retry a genuine (non-unknown-column) insert error, and surfaces it', async () => {
    const { client, inserts } = makeWriteClient({
      insertError: { message: 'permission denied for table golf_insight_outcome_attribution' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await writeComparableAttribution(client as any, ROW);

    expect(result).toEqual({
      written: false,
      methodVersionColumnMissing: false,
      error: 'permission denied for table golf_insight_outcome_attribution',
    });
    expect(inserts).toHaveLength(1); // no retry attempted
  });
});
