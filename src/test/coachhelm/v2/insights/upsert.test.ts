import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import { calcConfidence, type InsightInput, type InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

// -----------------------------------------------------------------------------
// Test harness — a minimal fake Supabase client whose builder methods record
// every call and whose terminal method (await / .single) returns a pre-set
// response. Each test configures what SELECT returns (the "existing row"
// lookup) and what INSERT/UPDATE returns, then asserts on what was called.
// -----------------------------------------------------------------------------

interface FakeResponse {
  data?: unknown;
  error?: { message: string } | null;
}

type OpKind = 'select' | 'insert' | 'update';

function createFakeSupabase(opts: {
  selectResult?: FakeResponse;
  insertResult?: FakeResponse;
  updateResult?: FakeResponse;
}) {
  const calls: Array<{
    table: string;
    op: OpKind;
    payload?: unknown;
    filters?: Record<string, unknown>;
  }> = [];

  const fromFn = vi.fn((table: string) => {
    const state: {
      op?: OpKind;
      payload?: unknown;
      filters: Record<string, unknown>;
    } = { filters: {} };

    const recordAndReturn = (terminal: FakeResponse) => {
      calls.push({ table, op: state.op!, payload: state.payload, filters: { ...state.filters } });
      return terminal;
    };

    const thenable = {
      // SELECT chain
      select: vi.fn((_cols: string) => {
        state.op = state.op ?? 'select';
        return thenable;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        state.filters[col] = val;
        return thenable;
      }),
      is: vi.fn((col: string, val: unknown) => {
        state.filters[`${col}__is`] = val;
        return thenable;
      }),
      gte: vi.fn((col: string, val: unknown) => {
        state.filters[`${col}__gte`] = val;
        return thenable;
      }),
      order: vi.fn(() => thenable),
      limit: vi.fn(() => {
        const r = recordAndReturn(opts.selectResult ?? { data: [], error: null });
        return Promise.resolve(r);
      }),
      single: vi.fn(() => {
        // Used by INSERT .select().single()
        const terminal = state.op === 'insert'
          ? (opts.insertResult ?? { data: { id: 'new-insight-id' }, error: null })
          : (opts.selectResult ?? { data: null, error: null });
        return Promise.resolve(recordAndReturn(terminal));
      }),
      maybeSingle: vi.fn(() => {
        // upsert(..., { onConflict, ignoreDuplicates }).select().maybeSingle() —
        // shipped in upsert.ts with the 2026-05-23 P0-3 race-condition fix
        // (UNIQUE NULLS NOT DISTINCT on signature+player_id+coach_id+team_id).
        const terminal = state.op === 'insert'
          ? (opts.insertResult ?? { data: { id: 'new-insight-id' }, error: null })
          : (opts.selectResult ?? { data: null, error: null });
        return Promise.resolve(recordAndReturn(terminal));
      }),

      // INSERT
      insert: vi.fn((payload: unknown) => {
        state.op = 'insert';
        state.payload = payload;
        return thenable;
      }),

      // UPSERT — prod switched .insert() → .upsert(payload, { onConflict,
      // ignoreDuplicates }) to close the TOCTOU race when two concurrent
      // runs (post-round-trigger + safety-net cron) both pass the dedup
      // lookup. We record it as op='insert' so existing assertions
      // (`calls.find(c => c.op === 'insert')`) still work.
      upsert: vi.fn((payload: unknown) => {
        state.op = 'insert';
        state.payload = payload;
        return thenable;
      }),

      // UPDATE — await-able directly after .eq() chain
      update: vi.fn((payload: unknown) => {
        state.op = 'update';
        state.payload = payload;
        return {
          eq: (col: string, val: unknown) => {
            state.filters[col] = val;
            return Promise.resolve(
              recordAndReturn(opts.updateResult ?? { data: null, error: null }),
            );
          },
        };
      }),
    };

    return thenable;
  });

  const client = { from: fromFn } as unknown as Parameters<typeof upsertInsight>[0];
  return { client, calls };
}

// -----------------------------------------------------------------------------

function baseEvidence(overrides: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'putt_make_rate_6_10ft',
    metric_label: 'Make rate from 6-10 feet',
    unit: 'percent',
    your_value: 0.38,
    your_value_display: '38%',
    comparison_value: 0.52,
    comparison_label: 'D2 average',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-03-22',
    window_end: '2026-04-21',
    strokes_impact: 2.1,
    strokes_impact_method: 'peer_delta',
    confidence: 0, // filled in by helper
    confidence_factors: {
      sample_adequacy: 1,
      recency: 1,
      variance: 1,
    },
    ...overrides,
  };
}

function baseInput(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    player_id: 'player-1',
    category: 'putting',
    signature: 'player-1:putt_make_rate:6_10ft',
    title: '6-10ft putts: 38%',
    content: 'Of your 47 putts from 6-10ft...',
    evidence: baseEvidence(),
    ...overrides,
  };
}

describe('upsertInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when evidence.sample_n < 5', async () => {
    const { client } = createFakeSupabase({});
    await expect(
      upsertInsight(client, baseInput({ evidence: baseEvidence({ sample_n: 4 }) })),
    ).rejects.toThrow(/sample_n=4.*< 5/);
  });

  it('confidence calc matches contract formula (0.4*sa + 0.3*rec + 0.3*var)', () => {
    const c = calcConfidence({
      confidence_factors: { sample_adequacy: 1, recency: 0.5, variance: 0.5 },
    });
    expect(c).toBeCloseTo(0.4 * 1 + 0.3 * 0.5 + 0.3 * 0.5);
  });

  it('confidence < 0.4 forces lifecycle_state = "tentative" on INSERT', async () => {
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [], error: null },
    });
    // All three factors at 0.2 → confidence = 0.2 < 0.4
    const evidence = baseEvidence({
      confidence_factors: { sample_adequacy: 0.2, recency: 0.2, variance: 0.2 },
    });
    await upsertInsight(client, baseInput({ evidence }));

    const insertCall = calls.find((c) => c.op === 'insert');
    expect(insertCall).toBeDefined();
    const payload = insertCall!.payload as { lifecycle_state: string; evidence: InsightEvidence };
    expect(payload.lifecycle_state).toBe('tentative');
    expect(payload.evidence.confidence).toBeCloseTo(0.2);
  });

  it('no existing row → INSERT with lifecycle_state = "detected" at high confidence', async () => {
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [], error: null },
    });
    const id = await upsertInsight(client, baseInput());
    expect(id).toBe('new-insight-id');

    const insertCall = calls.find((c) => c.op === 'insert');
    expect(insertCall).toBeDefined();
    const payload = insertCall!.payload as {
      lifecycle_state: string;
      player_id: string;
      category: string;
      signature: string;
    };
    expect(payload.lifecycle_state).toBe('detected');
    expect(payload.player_id).toBe('player-1');
    expect(payload.category).toBe('putting');
    expect(payload.signature).toBe('player-1:putt_make_rate:6_10ft');
  });

  it('team-level input uses player_id IS NULL and preserves caller ownership', async () => {
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [], error: null },
    });
    await upsertInsight(
      client,
      baseInput({
        player_id: null,
        coach_id: 'coach-1',
        team_id: 'team-1',
        category: 'scoring',
        insight_type: 'team_trend',
        signature: 'team_team-1:team_trend:scoring:closing',
      }),
    );

    const lookupCall = calls.find((c) => c.op === 'select');
    expect(lookupCall?.filters?.player_id__is).toBeNull();

    const insertCall = calls.find((c) => c.op === 'insert');
    expect(insertCall).toBeDefined();
    const payload = insertCall!.payload as {
      player_id: string | null;
      coach_id: string;
      team_id: string;
      insight_type: string;
    };
    expect(payload.player_id).toBeNull();
    expect(payload.coach_id).toBe('coach-1');
    expect(payload.team_id).toBe('team-1');
    expect(payload.insight_type).toBe('team_trend');
  });

  it('same signature, value within 5% → UPDATE existing row (no new insert) and no movement metadata', async () => {
    const existing = {
      id: 'existing-1',
      evidence: baseEvidence({ your_value: 0.38 }),
      metadata: {},
      lifecycle_state: 'detected' as const,
    };
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [existing], error: null },
    });
    // 0.38 -> 0.39 = 2.6% change, under 5%
    await upsertInsight(client, baseInput({ evidence: baseEvidence({ your_value: 0.39 }) }));

    expect(calls.some((c) => c.op === 'insert')).toBe(false);
    const updateCall = calls.find((c) => c.op === 'update');
    expect(updateCall).toBeDefined();
    const payload = updateCall!.payload as Record<string, unknown>;
    expect(payload.lifecycle_state).toBeUndefined(); // don't touch lifecycle
    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.movement).toBeUndefined();
    expect(metadata.last_refreshed_at).toBeDefined();
    expect(updateCall!.filters?.id).toBe('existing-1');
  });

  it('same signature, value moves >5% → UPDATE + sets movement metadata', async () => {
    const existing = {
      id: 'existing-2',
      evidence: baseEvidence({ your_value: 0.38 }),
      metadata: { movement_count: 0 },
      lifecycle_state: 'detected' as const,
    };
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [existing], error: null },
    });
    // 0.38 -> 0.50 = +31.5%, above 5%
    await upsertInsight(client, baseInput({ evidence: baseEvidence({ your_value: 0.50 }) }));

    const updateCall = calls.find((c) => c.op === 'update');
    expect(updateCall).toBeDefined();
    const payload = updateCall!.payload as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;
    const movement = metadata.movement as {
      from: number;
      to: number;
      direction: string;
      percent_change: number;
    };
    expect(movement.from).toBeCloseTo(0.38);
    expect(movement.to).toBeCloseTo(0.50);
    expect(movement.direction).toBe('up');
    expect(movement.percent_change).toBeGreaterThan(0.3);
    expect(metadata.movement_count).toBe(1);
    // One movement isn't enough to mature yet.
    expect(payload.lifecycle_state).toBeUndefined();
  });

  // DI-1 (2026-06-06): the dedup lookup must NOT filter on created_at. The
  // global UNIQUE NULLS NOT DISTINCT constraint that insertNew upserts against
  // has no time window, so a windowed lookup would miss rows older than 30 days
  // and (with ignoreDuplicates:true) silently drop their recomputed evidence —
  // freezing the lifecycle. The lookup is now scoped only by the unique key.
  it('DI-1: dedup lookup does not filter by created_at', async () => {
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [], error: null },
    });
    await upsertInsight(client, baseInput());

    // The dedup lookup is the golf_coach_insights SELECT keyed on signature
    // (ownership resolution SELECTs other tables first).
    const lookupCall = calls.find(
      (c) => c.op === 'select' && c.table === 'golf_coach_insights',
    );
    expect(lookupCall).toBeDefined();
    expect(lookupCall!.filters?.signature).toBe('player-1:putt_make_rate:6_10ft');
    // No created_at lower-bound filter — would have been recorded as
    // `created_at__gte` by the fake builder.
    expect(lookupCall!.filters).not.toHaveProperty('created_at__gte');
  });

  it('DI-1: an existing row older than the old 30d window still routes to UPDATE (no insert, evidence refreshed)', async () => {
    // The fake builder no longer narrows by created_at, so a row that would
    // have fallen outside the retired 30-day window is still found and updated.
    const stale = {
      id: 'stale-1',
      evidence: baseEvidence({ your_value: 0.38 }),
      metadata: { movement_count: 0 },
      lifecycle_state: 'detected' as const,
    };
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [stale], error: null },
    });
    // Big move so it lands in the movement branch and refreshes evidence.
    await upsertInsight(client, baseInput({ evidence: baseEvidence({ your_value: 0.55 }) }));

    expect(calls.some((c) => c.op === 'insert')).toBe(false);
    const updateCall = calls.find((c) => c.op === 'update');
    expect(updateCall).toBeDefined();
    expect(updateCall!.filters?.id).toBe('stale-1');
    const payload = updateCall!.payload as { evidence: InsightEvidence };
    expect(payload.evidence.your_value).toBeCloseTo(0.55);
  });

  it('3rd movement promotes detected → matured', async () => {
    // Simulate: existing row already had 2 prior movements tracked.
    const existing = {
      id: 'existing-3',
      evidence: baseEvidence({ your_value: 0.38 }),
      metadata: { movement_count: 2 },
      lifecycle_state: 'detected' as const,
    };
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [existing], error: null },
    });
    // Another big move
    await upsertInsight(client, baseInput({ evidence: baseEvidence({ your_value: 0.55 }) }));

    const updateCall = calls.find((c) => c.op === 'update');
    expect(updateCall).toBeDefined();
    const payload = updateCall!.payload as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.movement_count).toBe(3);
    expect(payload.lifecycle_state).toBe('matured');
  });
});
