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
function makeExposureClient(
  row: { shown_at: string } | null,
  opts: { error?: { message: string } } = {},
) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: opts.error ?? null }),
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

  it('returns its own typed exposure-read-failed skip on a genuine exposure-lookup DB error, rather than reading it as no-exposure-record', async () => {
    const { client } = makeExposureClient(null, { error: { message: 'connection reset' } });

    const result = await computeComparableAttribution(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      {
        insight_id: 'insight-1',
        player_id: 'player-1',
        target_metric_id: 'approach_proximity_125_175ft',
      },
    );

    expect(result).toEqual({ ok: false, reason: 'exposure-read-failed', error: 'connection reset' });
    expect(loadPlayerContextMock).not.toHaveBeenCalled();
  });

  it('returns follow-up-window-open when the follow-up window has not fully elapsed yet, without loading shot context', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
      // Shown 3 days ago: a 21-day follow-up window still has 18 days left.
      const { client } = makeExposureClient({ shown_at: '2026-09-20T00:00:00.000Z' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await computeComparableAttribution(client as any, {
        insight_id: 'insight-1',
        player_id: 'player-1',
        target_metric_id: 'approach_proximity_125_175ft',
      });

      expect(result).toEqual({ ok: false, reason: 'follow-up-window-open' });
      expect(loadPlayerContextMock).not.toHaveBeenCalled();
      expect(computeComparableOpportunitiesMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('proceeds once the follow-up window has just closed (boundary: end === now)', async () => {
    vi.useFakeTimers();
    try {
      // shown_at + 21d === now, exactly at the boundary — must NOT be "open".
      vi.setSystemTime(new Date('2026-09-22T00:00:00.000Z'));
      const { client } = makeExposureClient({ shown_at: '2026-09-01T00:00:00.000Z' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await computeComparableAttribution(client as any, {
        insight_id: 'insight-1',
        player_id: 'player-1',
        target_metric_id: 'approach_proximity_125_175ft',
      });

      expect(result.ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('builds a spec/outcome that only scores proximity for a shot that reached the green, dropping a miss', async () => {
    const { client } = makeExposureClient({ shown_at: SHOWN_AT });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await computeComparableAttribution(client as any, {
      insight_id: 'insight-1',
      player_id: 'player-1',
      target_metric_id: 'approach_proximity_125_175ft',
    });

    const call = computeComparableOpportunitiesMock.mock.calls[0]![0];
    expect(call.spec.shotRole).toBe('approach');
    expect(call.spec.lie).toBeNull();
    expect(call.outcome.kind).toBe('mean');
    const valueOf = (call.outcome as { valueOf: (shot: unknown) => number | null }).valueOf;

    expect(
      valueOf({ result: 'green', lie_after: null, distance_to_hole_after_feet: 12 }),
    ).toBe(12);
    expect(
      valueOf({ result: 'hole', lie_after: null, distance_to_hole_after_feet: 0 }),
    ).toBe(0);
    // Fallback: no `result`, but `lie_after` says green.
    expect(
      valueOf({ result: null, lie_after: 'green', distance_to_hole_after_feet: 6 }),
    ).toBe(6);
    // Missed the green entirely — dropped (null), never counted as a value.
    expect(
      valueOf({ result: 'rough', lie_after: 'rough', distance_to_hole_after_feet: 40 }),
    ).toBeNull();
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

  it('MUST 3 (PR #2007 review): a PGRST204 unknown-column error writes NOTHING — no retry insert, never a NULL-method_version row', async () => {
    const { client, inserts } = makeWriteClient({
      insertError: { code: 'PGRST204', message: "Could not find the 'method_version' column" },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await writeComparableAttribution(client as any, ROW);

    // written:false and NO error — this is a routine, expected degrade
    // (the migration isn't applied yet), never a genuine failure. A NULL
    // method_version row here would be silently, permanently
    // indistinguishable from a real round-level v1 row (MUST 3).
    expect(result).toEqual({ written: false, methodVersionColumnMissing: true });
    expect(inserts).toHaveLength(1); // no retry attempted
  });

  it('MUST 3: a raw-Postgres 42703 unknown-column error also writes nothing, no retry', async () => {
    const { client, inserts } = makeWriteClient({
      insertError: { code: '42703', message: 'column "method_version" does not exist' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await writeComparableAttribution(client as any, ROW);

    expect(result.methodVersionColumnMissing).toBe(true);
    expect(result.written).toBe(false);
    expect(result.error).toBeUndefined();
    expect(inserts).toHaveLength(1);
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
