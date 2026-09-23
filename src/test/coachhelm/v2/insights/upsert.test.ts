import { describe, it, expect, vi, beforeEach } from 'vitest';

// The real logServerError touches Sentry + an admin Supabase client; every
// test here already exercised CAS-miss/lost-race paths that call it without
// mocking (it no-ops safely in this env), so this mock changes nothing about
// existing assertions — it only lets the exhausted-retry test below assert
// on severity/skipSentry, which real code never exposes another way.
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));

import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import { logServerError } from '@/lib/server-error-logger';
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
  // Consumed in order across successive SELECT `.limit()` terminal calls —
  // the first is upsertInsight's dedup lookup, a second (if any) is
  // updateExisting's post-CAS-miss re-read. Falls back to `selectResult`
  // once exhausted or when absent, so every existing single-`selectResult`
  // test is unaffected.
  selectResults?: FakeResponse[];
  insertResult?: FakeResponse;
  updateResult?: FakeResponse;
  // Consumed in order across successive UPDATE `.select('id')` terminal
  // calls — the first is the initial CAS attempt, a second (if any) is the
  // one-shot retry after a same-lifecycle evidence race. Falls back to
  // `updateResult` once exhausted or when absent.
  updateResults?: FakeResponse[];
}) {
  const calls: Array<{
    table: string;
    op: OpKind;
    payload?: unknown;
    filters?: Record<string, unknown>;
  }> = [];
  let selectCallIndex = 0;
  let updateCallIndex = 0;

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
        const queued = opts.selectResults?.[selectCallIndex];
        selectCallIndex += 1;
        const r = recordAndReturn(queued ?? opts.selectResult ?? { data: [], error: null });
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
        if (state.op === 'insert') {
          const terminal = opts.insertResult ?? { data: { id: 'new-insight-id' }, error: null };
          return Promise.resolve(recordAndReturn(terminal));
        }
        // SELECT .maybeSingle() — updateExisting's post-CAS-miss re-read
        // uses this terminal (not .limit()), but shares the SAME ordered
        // `selectResults` queue/counter as .limit() below: the dedup lookup
        // and the re-read are just successive SELECT calls from the same
        // fixture's point of view. `.maybeSingle()`'s real contract is "one
        // row or null, never an array", so a fixture's array-shaped `data`
        // (written for `.limit()`'s array return) is unwrapped to its first
        // element here — existing `selectResult(s)` fixtures work unchanged
        // whichever terminal method consumes them.
        const queued = opts.selectResults?.[selectCallIndex];
        selectCallIndex += 1;
        const chosen = queued ?? opts.selectResult ?? { data: [], error: null };
        const rawData = chosen.data;
        const single = Array.isArray(rawData) ? (rawData[0] ?? null) : (rawData ?? null);
        return Promise.resolve(recordAndReturn({ data: single, error: chosen.error ?? null }));
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

      // UPDATE — chainable .eq()/.is() (the CAS guard adds a second filter
      // beyond `.eq('id', ...)`), terminated by `.select('id')` as
      // `updateExisting` now does. Defaults to a successful CAS match (the
      // row carrying `filters.id` came back) unless a test supplies
      // `updateResult` to simulate a lost race (`{ data: [], error: null }`).
      update: vi.fn((payload: unknown) => {
        state.op = 'update';
        state.payload = payload;
        const chain = {
          eq: (col: string, val: unknown) => {
            state.filters[col] = val;
            return chain;
          },
          is: (col: string, val: unknown) => {
            state.filters[`${col}__is`] = val;
            return chain;
          },
          select: (_cols?: string) => {
            const queued = opts.updateResults?.[updateCallIndex];
            updateCallIndex += 1;
            const terminal = queued ?? opts.updateResult ?? { data: [{ id: state.filters.id }], error: null };
            return Promise.resolve(recordAndReturn(terminal));
          },
        };
        return chain;
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

  // 2026-09-22 (R1/R2 leftover): maturation used to fire off the raw
  // `movement_count` tally alone, including movements counted before the row
  // was ever visible. It now requires MATURATION_CONFIRMATIONS DISTINCT
  // evidence revisions (`metadata.maturation_keys`, keyed off sample_n +
  // window_end) recorded while the row is 'detected'.
  it('an old movement_count of 2 does NOT mature the row on the next move — pins the ' +
     'old-counter bug: maturation needs distinct evidence revisions, not a raw tally', async () => {
    const existing = {
      id: 'existing-3',
      evidence: baseEvidence({ your_value: 0.38 }),
      // Legacy shape: a movement_count from before this fix, no
      // maturation_keys at all.
      metadata: { movement_count: 2 },
      lifecycle_state: 'detected' as const,
    };
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [existing], error: null },
    });
    // Another big move, same sample_n/window_end as the fixture default —
    // this is the FIRST distinct-revision confirmation under the new scheme.
    await upsertInsight(client, baseInput({ evidence: baseEvidence({ your_value: 0.55 }) }));

    const updateCall = calls.find((c) => c.op === 'update');
    expect(updateCall).toBeDefined();
    const payload = updateCall!.payload as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;
    // The raw tally is unaffected bookkeeping (still read by the cron's Rule 2).
    expect(metadata.movement_count).toBe(3);
    // But lifecycle must NOT jump to matured off that stale counter.
    expect(payload.lifecycle_state).toBeUndefined();
    expect(metadata.maturation_keys).toEqual(['47|2026-04-21']);
  });

  it('three DISTINCT evidence revisions recorded while detected mature the row', async () => {
    const existing = {
      id: 'existing-4',
      evidence: baseEvidence({ your_value: 0.38 }),
      // Two independent new-round confirmations already recorded.
      metadata: { maturation_keys: ['20|2026-02-20', '35|2026-03-20'] },
      lifecycle_state: 'detected' as const,
    };
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [existing], error: null },
    });
    // A third, genuinely new evidence revision (distinct sample_n/window_end)
    // that also moves the value >5%.
    await upsertInsight(
      client,
      baseInput({ evidence: baseEvidence({ your_value: 0.55, sample_n: 52, window_end: '2026-04-21' }) }),
    );

    const updateCall = calls.find((c) => c.op === 'update');
    const payload = updateCall!.payload as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.maturation_keys).toEqual(['20|2026-02-20', '35|2026-03-20', '52|2026-04-21']);
    expect(payload.lifecycle_state).toBe('matured');
  });

  it('re-evaluating the SAME evidence revision does not count twice toward maturation', async () => {
    const existing = {
      id: 'existing-5',
      evidence: baseEvidence({ your_value: 0.38, sample_n: 47, window_end: '2026-04-21' }),
      metadata: { maturation_keys: ['47|2026-04-21'] },
      lifecycle_state: 'detected' as const,
    };
    const { client, calls } = createFakeSupabase({
      selectResult: { data: [existing], error: null },
    });
    // Same sample_n/window_end as the already-counted revision — e.g. a
    // duplicate analysis run over the identical underlying round — but the
    // value still moves >5% (recompute noise / a corrected value).
    await upsertInsight(
      client,
      baseInput({ evidence: baseEvidence({ your_value: 0.55, sample_n: 47, window_end: '2026-04-21' }) }),
    );

    const updateCall = calls.find((c) => c.op === 'update');
    const payload = updateCall!.payload as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;
    // Unchanged — the key was already present.
    expect(metadata.maturation_keys).toEqual(['47|2026-04-21']);
    expect(payload.lifecycle_state).toBeUndefined();
  });

  // 2026-09-22: optimistic compare-and-set so a concurrent coach action
  // (dismiss/acknowledge/archive/resolve) is never silently overwritten by a
  // lifecycle decision computed from a stale read.
  describe('lifecycle compare-and-set', () => {
    it('lost race (lifecycle_state changed concurrently): does not throw, does not ' +
       'notify, and returns the existing id untouched', async () => {
      const existing = {
        id: 'existing-6',
        evidence: baseEvidence({ your_value: 0.38 }),
        metadata: { movement_count: 2 },
        lifecycle_state: 'detected' as const,
        updated_at: '2026-04-21T10:00:00.000Z',
      };
      // Simulate a coach dismissing the row between our SELECT and our
      // UPDATE: the CAS matches zero rows because it is now 'archived'
      // (and updated_at moved with it). The post-miss re-read confirms
      // lifecycle_state genuinely changed, so this must NOT retry.
      const dismissed = { ...existing, lifecycle_state: 'archived' as const, updated_at: '2026-04-21T10:05:00.000Z' };
      const { client, calls } = createFakeSupabase({
        selectResults: [{ data: [existing], error: null }, { data: [dismissed], error: null }],
        updateResult: { data: [], error: null },
      });

      const id = await upsertInsight(
        client,
        baseInput({ evidence: baseEvidence({ your_value: 0.55 }) }),
      );

      expect(id).toBe('existing-6');
      const updateCalls = calls.filter((c) => c.op === 'update');
      // Exactly one attempt — lifecycle genuinely changed, so no retry.
      expect(updateCalls).toHaveLength(1);
      // The CAS filter carried the OBSERVED lifecycle_state/updated_at, not
      // the decision's target state.
      expect(updateCalls[0]!.filters?.lifecycle_state).toBe('detected');
      expect(updateCalls[0]!.filters?.updated_at).toBe('2026-04-21T10:00:00.000Z');
    });

    it('guards the update with the observed lifecycle_state', async () => {
      const existing = {
        id: 'existing-7',
        evidence: baseEvidence({ your_value: 0.38 }),
        metadata: {},
        lifecycle_state: 'tentative' as const,
        updated_at: '2026-04-21T10:00:00.000Z',
      };
      const { client, calls } = createFakeSupabase({
        selectResult: { data: [existing], error: null },
      });
      await upsertInsight(client, baseInput({ evidence: baseEvidence({ your_value: 0.39 }) }));

      const updateCall = calls.find((c) => c.op === 'update');
      expect(updateCall!.filters?.lifecycle_state).toBe('tentative');
      expect(updateCall!.filters?.updated_at).toBe('2026-04-21T10:00:00.000Z');
    });

    // §15.2 fixture matrix row 10 — "old worker finishes after a new
    // revision: new accepted result survives" / plan §5.1 "a concurrent run
    // cannot revert a later state". Extends the CAS guard above to also
    // cover the observed revision (`updated_at`), not just lifecycle_state,
    // so a same-lifecycle evidence race is caught too.
    describe('stale write vs. a concurrent newer revision (plan §5.1)', () => {
      it('drops an older, stale write instead of clobbering evidence a newer concurrent run already persisted', async () => {
        // A newer worker already wrote this: larger sample_n, later
        // window_end, lifecycle_state unchanged, updated_at moved.
        const fresher = {
          id: 'existing-race',
          evidence: baseEvidence({ sample_n: 90, window_end: '2026-05-20', your_value: 0.40 }),
          metadata: {},
          lifecycle_state: 'detected' as const,
          updated_at: '2026-05-20T09:00:00.000Z',
        };
        // Our own SELECT happened BEFORE that write — we still hold the
        // older snapshot.
        const staleObserved = {
          ...fresher,
          evidence: baseEvidence({ sample_n: 47, window_end: '2026-04-21', your_value: 0.39 }),
          updated_at: '2026-04-21T10:00:00.000Z',
        };
        const { client, calls } = createFakeSupabase({
          selectResults: [{ data: [staleObserved], error: null }, { data: [fresher], error: null }],
          updateResult: { data: [], error: null }, // the one CAS attempt misses (updated_at moved)
        });

        const staleEvidence = baseEvidence({ sample_n: 47, window_end: '2026-04-21', your_value: 0.39 });
        const id = await upsertInsight(client, baseInput({ evidence: staleEvidence }));

        expect(id).toBe('existing-race');
        // Exactly one CAS attempt was made, it missed, and — because our
        // stale evidence is NOT newer than the fresh re-read — no retry
        // write happened. The fresher evidence is never overwritten.
        expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
      });

      it('retries once and lands the write when the incoming evidence really is newer than the fresh read', async () => {
        // Something else touched the row (bumping updated_at) without
        // changing its evidence content or lifecycle_state — e.g. a
        // metadata-only write. Our incoming evidence is genuinely newer
        // than what a re-read finds.
        const observed = {
          id: 'existing-retry',
          evidence: baseEvidence({ sample_n: 47, window_end: '2026-04-21', your_value: 0.39 }),
          metadata: {},
          lifecycle_state: 'detected' as const,
          updated_at: '2026-04-21T10:00:00.000Z',
        };
        const freshSameLifecycle = { ...observed, updated_at: '2026-04-21T10:05:00.000Z' };
        const { client, calls } = createFakeSupabase({
          selectResults: [{ data: [observed], error: null }, { data: [freshSameLifecycle], error: null }],
          updateResults: [
            { data: [], error: null }, // first CAS attempt misses
            { data: [{ id: 'existing-retry' }], error: null }, // retry succeeds
          ],
        });

        const newerEvidence = baseEvidence({ sample_n: 90, window_end: '2026-05-20', your_value: 0.55 });
        const id = await upsertInsight(client, baseInput({ evidence: newerEvidence }));

        expect(id).toBe('existing-retry');
        const updateCalls = calls.filter((c) => c.op === 'update');
        expect(updateCalls).toHaveLength(2);
        // The retry's CAS predicate carries the FRESH row's updated_at, not
        // the originally-observed one.
        expect(updateCalls[1]!.filters?.updated_at).toBe('2026-04-21T10:05:00.000Z');
        const payload = updateCalls[1]!.payload as Record<string, unknown>;
        expect((payload.evidence as InsightEvidence).sample_n).toBe(90);
      });

      it('exhausts its one retry and pages loudly instead of silently dropping evidence that is still newer', async () => {
        // Pathological but real: every re-read this write sees is STILL
        // older than our incoming evidence (a persistently slow/contended
        // row), so the retry budget (attempt < 1) runs out while we are
        // genuinely the newer write — the exact silent-loss case the CAS
        // exists to prevent, not a benign backoff.
        const observed = {
          id: 'existing-exhausted',
          evidence: baseEvidence({ sample_n: 47, window_end: '2026-04-21', your_value: 0.39 }),
          metadata: {},
          lifecycle_state: 'detected' as const,
          updated_at: '2026-04-21T10:00:00.000Z',
        };
        // Both re-reads land on the same (still-older) lifecycle/evidence —
        // lifecycle_state never changes, only updated_at ticks, so the CAS
        // keeps missing without ever becoming a genuine lifecycle race.
        const fresh1 = { ...observed, updated_at: '2026-04-21T10:05:00.000Z' };
        const fresh2 = { ...observed, updated_at: '2026-04-21T10:10:00.000Z' };
        const { client, calls } = createFakeSupabase({
          selectResults: [
            { data: [observed], error: null }, // dedup lookup
            { data: [fresh1], error: null },    // re-read after 1st CAS miss
            { data: [fresh2], error: null },    // re-read after 2nd CAS miss (retry)
          ],
          updateResults: [
            { data: [], error: null }, // 1st CAS attempt misses
            { data: [], error: null }, // retry (2nd CAS attempt) also misses
          ],
        });

        const newerEvidence = baseEvidence({ sample_n: 90, window_end: '2026-05-20', your_value: 0.55 });
        // Explicit coach_id/team_id skip resolvePlayerOwnership (irrelevant
        // to this test, and the fake client doesn't implement its `.in()`
        // chain), so the only logServerError call left is the one under test.
        const id = await upsertInsight(
          client,
          baseInput({ evidence: newerEvidence, coach_id: 'coach-1', team_id: 'team-1' }),
        );

        expect(id).toBe('existing-exhausted');
        // Exactly two CAS attempts — the initial write and its one retry —
        // never a third. The `attempt < 1` bound holds.
        expect(calls.filter((c) => c.op === 'update')).toHaveLength(2);

        const mockLog = vi.mocked(logServerError);
        expect(mockLog).toHaveBeenCalledTimes(1);
        const [message, context, severity] = mockLog.mock.calls[0]!;
        expect(message).toContain('dropped a NEWER evidence write');
        expect(severity).toBe('error');
        // Must page — this is real evidence loss, not the expected-benign
        // stale-worker backoff, so skipSentry must NOT be set.
        expect((context as { skipSentry?: boolean }).skipSentry).toBeUndefined();
      });

      it('a same-instant window_end in a different format (date-only vs. full timestamp) ties, falling to sample_n, instead of losing on string length', async () => {
        // window_end is NOT a consistent format across generators (v2 mining
        // writes date-only 'YYYY-MM-DD'; to-insight-input.ts and v3 evidence
        // builders write a full now.toISOString() timestamp). A raw string
        // compare ranks the date-only form as "less than" ANY same-day
        // timestamp, purely because it's a string-length prefix — even one
        // representing the exact same midnight instant, which should be a
        // TIE that falls through to sample_n, not an automatic "older".
        const persisted = {
          id: 'existing-mixed-format',
          evidence: baseEvidence({ sample_n: 47, window_end: '2026-04-21T00:00:00.000Z', your_value: 0.39 }),
          metadata: {},
          lifecycle_state: 'detected' as const,
          updated_at: '2026-04-21T00:00:00.000Z',
        };
        const freshSameLifecycle = { ...persisted, updated_at: '2026-04-21T00:05:00.000Z' };
        const { client, calls } = createFakeSupabase({
          selectResults: [{ data: [persisted], error: null }, { data: [freshSameLifecycle], error: null }],
          updateResults: [
            { data: [], error: null }, // first CAS attempt misses
            { data: [{ id: 'existing-mixed-format' }], error: null }, // retry succeeds
          ],
        });

        // Same calendar day (midnight, date-only) but a genuinely larger
        // sample_n — must win the tie, not be dropped as "not newer".
        const incoming = baseEvidence({ sample_n: 90, window_end: '2026-04-21', your_value: 0.55 });
        const id = await upsertInsight(
          client,
          baseInput({ evidence: incoming, coach_id: 'coach-1', team_id: 'team-1' }),
        );

        expect(id).toBe('existing-mixed-format');
        expect(calls.filter((c) => c.op === 'update')).toHaveLength(2);
      });

      it('CAS predicate carries a realistic PostgREST microsecond timestamp byte-for-byte', async () => {
        // PostgREST timestamptz(6) round-trips with microsecond precision
        // and an explicit offset, not JS's Date#toISOString() millisecond/'Z'
        // shape. The CAS .eq() must pass through exactly what was read, with
        // no reformatting that could silently miss a real row.
        const REALISTIC_TS = '2026-04-21T10:00:00.123456+00:00';
        const existing = {
          id: 'existing-microsecond',
          evidence: baseEvidence({ sample_n: 47, window_end: '2026-04-21', your_value: 0.39 }),
          metadata: {},
          lifecycle_state: 'detected' as const,
          updated_at: REALISTIC_TS,
        };
        const { client, calls } = createFakeSupabase({
          selectResult: { data: [existing], error: null },
        });

        await upsertInsight(client, baseInput({ evidence: baseEvidence({ sample_n: 47, window_end: '2026-04-21', your_value: 0.55 }) }));

        const updateCall = calls.find((c) => c.op === 'update');
        expect(updateCall!.filters?.updated_at).toBe(REALISTIC_TS);
      });
    });
  });
});
