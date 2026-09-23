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

function makeSb(opts: { coachInsights?: Page[]; attribution?: Page[] } = {}) {
  const coachInsightsQueue = [...(opts.coachInsights ?? [])];
  const attributionQueue = [...(opts.attribution ?? [])];

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
    throw new Error(`Unexpected table: ${table}`);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
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
