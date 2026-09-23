/**
 * A9 slice 3: `attribution-read.ts`'s own orchestration — pagination,
 * chunking, and the unknown-column (unapplied-migration) degrade path.
 * NOT the view model (that's `attribution-view-model.test.ts`) and NOT the
 * server action's flag gate (that's `src/test/golf/actions/
 * insight-attribution.test.ts`).
 *
 * `sb` is a hand-rolled chainable fake, same convention as
 * `causality/comparable-attribute.test.ts`'s `makeExposureClient`: each
 * `.from(table)` call returns a fresh builder whose terminal `.range()` call
 * pops the next queued `{ data, error }` page for that table, in call
 * order. This lets a single queue stand in for however many `.range()`
 * calls `fetchAllRowsResult`'s pagination loop and `chunkIds`'s per-chunk
 * loop end up making, without hand-simulating PostgREST itself.
 */
import { describe, it, expect } from 'vitest';
import { readAttributionForInsight, readAttributionForPlayer } from './attribution-read';

type Page = { data: unknown[] | null; error: { message: string; code?: string } | null };

function makeSb(opts: { coachInsights?: Page[]; attribution?: Page[]; action?: Page[] } = {}) {
  const coachInsightsQueue = [...(opts.coachInsights ?? [])];
  const attributionQueue = [...(opts.attribution ?? [])];
  // Package 10: `golf_insight_action` queue for `attachAnchorKind`'s bulk
  // lookup, mirroring `attribution`'s queue shape. Defaults to empty (never
  // provided) so every pre-existing test above — none of which know this
  // table exists — keeps behaving exactly as before: a comparable-method row
  // with no `action` page queued just gets `{ data: [], error: null }`
  // (no matching action, anchor_kind: 'exposure'), never a thrown
  // "Unexpected table" error.
  const actionQueue = [...(opts.action ?? [])];
  let actionCallCount = 0;

  const from = (table: string) => {
    if (table === 'golf_coach_insights') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async () => coachInsightsQueue.shift() ?? { data: [], error: null },
            }),
          }),
        }),
      };
    }
    if (table === 'golf_insight_outcome_attribution') {
      const tail = {
        order: () => ({
          range: async () => attributionQueue.shift() ?? { data: [], error: null },
        }),
      };
      return {
        select: () => ({
          eq: () => tail,
          in: () => tail,
        }),
      };
    }
    if (table === 'golf_insight_action') {
      actionCallCount += 1;
      const tail = {
        order: () => ({
          range: async () => actionQueue.shift() ?? { data: [], error: null },
        }),
      };
      return {
        // Two chained `.in()` calls in the real code (insight_id, then
        // action_type) — the fake only needs to keep returning the tail.
        select: () => ({ in: () => ({ in: () => tail }) }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from, getActionCallCount: () => actionCallCount } as any;
}

const UNKNOWN_COLUMN_ERROR = { message: "Could not find the 'method_version' column of 'golf_insight_outcome_attribution' in the schema cache", code: 'PGRST204' };

describe('readAttributionForInsight', () => {
  it('short-circuits on an empty insight id — never touches the client', async () => {
    let fromCalled = false;
    const sb = { from: () => { fromCalled = true; throw new Error('should not be called'); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await readAttributionForInsight(sb as any, '');
    expect(result).toEqual({ ok: true, rows: [] });
    expect(fromCalled).toBe(false);
  });

  it('maps a found row, normalizing a real null method_version to null', async () => {
    const sb = makeSb({
      attribution: [
        {
          data: [
            {
              insight_id: 'i1',
              target_metric_id: 'sg_total',
              baseline_value: 1,
              post_value: 2,
              delta: 1,
              n_rounds_before: 5,
              n_rounds_after: 5,
              method_version: null,
            },
          ],
          error: null,
        },
      ],
    });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          insight_id: 'i1',
          target_metric_id: 'sg_total',
          baseline_value: 1,
          post_value: 2,
          delta: 1,
          n_rounds_before: 5,
          n_rounds_after: 5,
          method_version: null,
          anchor_kind: null,
        },
      ],
    });
  });

  it('returns { ok: true, rows: [] } — never [] mistaken for failure — when the insight has no attribution row yet', async () => {
    const sb = makeSb({ attribution: [{ data: [], error: null }] });
    const result = await readAttributionForInsight(sb, 'never-attributed');
    expect(result).toEqual({ ok: true, rows: [] });
  });

  it('a genuine read failure returns { ok: false }, never an empty rows array', async () => {
    const sb = makeSb({ attribution: [{ data: null, error: { message: 'connection reset' } }] });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result).toEqual({ ok: false });
  });

  it('degrades gracefully when method_version column does not exist yet (migration 20260922230000 unapplied), mapping every row to method_version: null', async () => {
    const sb = makeSb({
      attribution: [
        { data: null, error: UNKNOWN_COLUMN_ERROR },
        {
          data: [
            {
              insight_id: 'i1',
              target_metric_id: 'sg_total',
              baseline_value: 1,
              post_value: 2,
              delta: 1,
              n_rounds_before: 5,
              n_rounds_after: 5,
            },
          ],
          error: null,
        },
      ],
    });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.method_version).toBeNull();
    }
  });

  it('a real failure on the degrade retry itself is still { ok: false }', async () => {
    const sb = makeSb({
      attribution: [
        { data: null, error: UNKNOWN_COLUMN_ERROR },
        { data: null, error: { message: 'still broken' } },
      ],
    });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result).toEqual({ ok: false });
  });
});

describe('readAttributionForPlayer', () => {
  it('short-circuits on an empty player id — never touches the client', async () => {
    let fromCalled = false;
    const sb = { from: () => { fromCalled = true; throw new Error('should not be called'); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await readAttributionForPlayer(sb as any, '');
    expect(result).toEqual({ ok: true, rows: [] });
    expect(fromCalled).toBe(false);
  });

  it('a player with zero insights returns { ok: true, rows: [] } without ever querying the attribution table', async () => {
    const sb = makeSb({ coachInsights: [{ data: [], error: null }] });
    const result = await readAttributionForPlayer(sb, 'player-1');
    expect(result).toEqual({ ok: true, rows: [] });
  });

  it('a failed insight-id lookup returns { ok: false }', async () => {
    const sb = makeSb({ coachInsights: [{ data: null, error: { message: 'boom' } }] });
    const result = await readAttributionForPlayer(sb, 'player-1');
    expect(result).toEqual({ ok: false });
  });

  it('chunks more than 200 insight ids into multiple .in() queries and merges every chunk\'s rows', async () => {
    const insightIds = Array.from({ length: 250 }, (_, i) => `insight-${i}`);
    const sb = makeSb({
      coachInsights: [{ data: insightIds.map((id) => ({ id })), error: null }],
      attribution: [
        // Chunk 1 (200 ids) — one row.
        {
          data: [
            {
              insight_id: 'insight-0',
              target_metric_id: 'sg_total',
              baseline_value: 1,
              post_value: 2,
              delta: 1,
              n_rounds_before: 5,
              n_rounds_after: 5,
              method_version: 'comparable_opportunities_v1',
            },
          ],
          error: null,
        },
        // Chunk 2 (remaining 50 ids) — one row.
        {
          data: [
            {
              insight_id: 'insight-249',
              target_metric_id: 'approach_proximity_50_125ft',
              baseline_value: 30,
              post_value: 25,
              delta: -5,
              n_rounds_before: 4,
              n_rounds_after: 4,
              method_version: 'comparable_opportunities_v1_limited',
            },
          ],
          error: null,
        },
      ],
    });
    const result = await readAttributionForPlayer(sb, 'player-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.map((r) => r.insight_id)).toEqual(['insight-0', 'insight-249']);
    }
  });

  it('one failed chunk fails the whole call — never a partial success', async () => {
    const insightIds = Array.from({ length: 250 }, (_, i) => `insight-${i}`);
    const sb = makeSb({
      coachInsights: [{ data: insightIds.map((id) => ({ id })), error: null }],
      attribution: [
        { data: [], error: null }, // chunk 1 fine
        { data: null, error: { message: 'chunk 2 exploded' } }, // chunk 2 fails
      ],
    });
    const result = await readAttributionForPlayer(sb, 'player-1');
    expect(result).toEqual({ ok: false });
  });
});

describe('Package 10: anchor_kind derivation (attachAnchorKind)', () => {
  const SURFACED_AT = '2026-08-01T00:00:00.000Z';

  function comparableRow(over: Record<string, unknown> = {}) {
    return {
      insight_id: 'i1',
      target_metric_id: 'approach_proximity_125_175ft',
      baseline_value: 30,
      post_value: 25,
      delta: -5,
      n_rounds_before: 4,
      n_rounds_after: 4,
      method_version: 'comparable_opportunities_v1',
      surfaced_at: SURFACED_AT,
      ...over,
    };
  }

  it('exact-match: surfaced_at equal to a qualifying action created_at for the same insight → anchor_kind: action', async () => {
    const sb = makeSb({
      attribution: [{ data: [comparableRow()], error: null }],
      action: [{ data: [{ insight_id: 'i1', created_at: SURFACED_AT }], error: null }],
    });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows[0]?.anchor_kind).toBe('action');
  });

  it('no matching action for the insight → anchor_kind: exposure', async () => {
    const sb = makeSb({
      attribution: [{ data: [comparableRow()], error: null }],
      action: [{ data: [], error: null }],
    });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows[0]?.anchor_kind).toBe('exposure');
  });

  // CRITICAL regression test — this is exactly the scenario the exact-
  // timestamp-match design exists to prevent (see attachAnchorKind's own
  // doc comment). The attribution row was written when surfaced_at (the
  // exposure) had no matching action yet — anchor_kind: 'exposure' at write
  // time. `golf_insight_action` is append-only and keeps growing after that
  // permanent, idempotent row was written: a coach can act on the insight
  // LATER, for an unrelated reason, well after the measurement window
  // closed. A naive "does any action exist for this insight" check would
  // wrongly flip this row to 'action' the moment that later action landed,
  // silently relabeling a historical value. The exact-match on surfaced_at
  // must keep it 'exposure' forever, regardless of what actions appear
  // afterward.
  it('an exposure-anchored row plus a LATER, unrelated qualifying action for the same insight still derives anchor_kind: exposure, never action', async () => {
    const laterUnrelatedAction = '2026-09-15T00:00:00.000Z'; // well after SURFACED_AT
    const sb = makeSb({
      attribution: [{ data: [comparableRow()], error: null }],
      action: [{ data: [{ insight_id: 'i1', created_at: laterUnrelatedAction }], error: null }],
    });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows[0]?.anchor_kind).toBe('exposure');
  });

  it('a non-comparable method_version row (earlier_method) always gets anchor_kind: null and makes zero golf_insight_action calls', async () => {
    const sb = makeSb({
      attribution: [
        {
          data: [
            comparableRow({
              method_version: 'v2_observed_delta',
              // Deliberately matches SURFACED_AT of a hypothetical action —
              // must be ignored entirely: a round-level row's surfaced_at is
              // an admitted created_at PROXY, never a real exposure/action
              // instant, so it must never be compared against golf_insight_action
              // at all, not just "compared and happen to not match".
            }),
          ],
          error: null,
        },
      ],
      // No `action` queued — if the code queried it anyway, the queue
      // underflow would fall back to { data: [], error: null }, which
      // would NOT surface a bug here. getActionCallCount() below is the
      // real assertion.
    });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows[0]?.anchor_kind).toBeNull();
    expect(sb.getActionCallCount()).toBe(0);
  });

  it('zero comparable-method rows in the whole batch → chunkIds([]) means zero golf_insight_action calls', async () => {
    const sb = makeSb({
      attribution: [
        {
          data: [
            comparableRow({ insight_id: 'i1', method_version: null }),
            comparableRow({ insight_id: 'i2', method_version: 'v2_observed_delta' }),
          ],
          error: null,
        },
      ],
    });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result.ok).toBe(true);
    expect(sb.getActionCallCount()).toBe(0);
  });

  // This is the exact bug fixed in attachAnchorKind before this test was
  // written: the original code caught the action-read error and returned
  // rows.map(...) with a fabricated `_actionReadFailed` field and
  // `anchor_kind: null` for every row — a SILENT PARTIAL SUCCESS that
  // violated this file's own "NEVER EMPTY ON FAILURE" contract. A caller
  // reading anchor_kind: null off that shape could not tell "round-level,
  // no anchor to report" from "we don't actually know — the lookup failed".
  it('a genuine golf_insight_action read failure fails the WHOLE call — never a partial success with anchor_kind guessed as null', async () => {
    const sb = makeSb({
      attribution: [{ data: [comparableRow()], error: null }],
      action: [{ data: null, error: { message: 'connection reset' } }],
    });
    const result = await readAttributionForInsight(sb, 'i1');
    expect(result).toEqual({ ok: false });
  });

  it('the same action-read failure also fails readAttributionForPlayer as a whole, not just the affected chunk', async () => {
    const sb = makeSb({
      coachInsights: [{ data: [{ id: 'i1' }], error: null }],
      attribution: [{ data: [comparableRow()], error: null }],
      action: [{ data: null, error: { message: 'connection reset' } }],
    });
    const result = await readAttributionForPlayer(sb, 'player-1');
    expect(result).toEqual({ ok: false });
  });
});
