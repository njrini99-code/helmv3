/**
 * Unit tests for `detectConfoundingInterventions` (A9 slice 2). Exercises the
 * real `golf_insight_exposure` query and the first-exposure-per-insight
 * grouping logic against a fake chainable client — NOT
 * `comparable-attribute.ts`'s own orchestration (that file mocks this module
 * wholesale; see its own test file's header comment).
 */

import { describe, it, expect, vi } from 'vitest';
import { detectConfoundingInterventions } from './confounding-check';

interface Row {
  insight_id: string;
  shown_at: string;
  id?: string;
}

/** Chainable fake for `sb.from('golf_insight_exposure').select(...).eq(...)
 *  .neq(...).lte(...).order(...).order(...).order(...).range(from, to)`.
 *  `rows` must already be pre-sorted the way the real query orders
 *  (`insight_id`, then `shown_at`) — this fake does not re-sort, the same
 *  simplifying assumption `causality-attribute.test.ts`'s `exposureBuilder`
 *  makes for its own paginated fetch. */
function makeClient(rows: Row[], opts: { error?: { message: string }; pageSize?: number } = {}) {
  const calls: { eq: unknown[]; neq: unknown[]; lte: unknown[] } = { eq: [], neq: [], lte: [] };
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((...args: unknown[]) => {
      calls.eq.push(args);
      return builder;
    }),
    neq: vi.fn((...args: unknown[]) => {
      calls.neq.push(args);
      return builder;
    }),
    lte: vi.fn((...args: unknown[]) => {
      calls.lte.push(args);
      return builder;
    }),
    order: vi.fn().mockReturnThis(),
    range: vi.fn((from: number, to: number) => {
      if (opts.error) return Promise.resolve({ data: null, error: opts.error });
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    }),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'golf_insight_exposure') return builder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { client, builder, calls };
}

const WINDOW_START = '2026-08-01T00:00:00.000Z';
const WINDOW_END = '2026-09-15T00:00:00.000Z';

describe('detectConfoundingInterventions', () => {
  it('reports false when there are zero OTHER exposures for this player', async () => {
    const { client } = makeClient([]);

    const result = await detectConfoundingInterventions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { insight_id: 'insight-1', player_id: 'player-1', windowStart: WINDOW_START, windowEnd: WINDOW_END },
    );

    expect(result).toEqual({ ok: true, multipleInterventions: false });
  });

  it('reports true when another insight\'s first exposure lands inside the window', async () => {
    const { client, builder } = makeClient([
      { insight_id: 'insight-2', shown_at: '2026-08-10T00:00:00.000Z' },
    ]);

    const result = await detectConfoundingInterventions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { insight_id: 'insight-1', player_id: 'player-1', windowStart: WINDOW_START, windowEnd: WINDOW_END },
    );

    expect(result).toEqual({ ok: true, multipleInterventions: true });
    expect(builder.eq).toHaveBeenCalledWith('player_id', 'player-1');
    expect(builder.neq).toHaveBeenCalledWith('insight_id', 'insight-1');
    expect(builder.lte).toHaveBeenCalledWith('shown_at', WINDOW_END);
  });

  it('excludes THIS insight_id from counting as its own confounder (query-level neq, asserted above) — this test proves the app-layer grouping still reports false when the only rows returned belong to other, non-confounding insights', async () => {
    const { client } = makeClient([
      // Before the window: this insight was already exposed prior to
      // baseline start, not a NEW intervention entering the window.
      { insight_id: 'insight-3', shown_at: '2026-07-01T00:00:00.000Z' },
    ]);

    const result = await detectConfoundingInterventions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { insight_id: 'insight-1', player_id: 'player-1', windowStart: WINDOW_START, windowEnd: WINDOW_END },
    );

    expect(result).toEqual({ ok: true, multipleInterventions: false });
  });

  it('uses the MINIMUM (first-ever) shown_at per insight_id, not any row inside the window — a re-exposure inside the window of an insight first shown BEFORE baseline start does not confound', async () => {
    const { client } = makeClient([
      // Ordered insight_id then shown_at, as the real query orders.
      { insight_id: 'insight-2', shown_at: '2026-07-01T00:00:00.000Z' }, // first exposure: BEFORE window
      { insight_id: 'insight-2', shown_at: '2026-08-20T00:00:00.000Z' }, // re-exposure: inside window
    ]);

    const result = await detectConfoundingInterventions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { insight_id: 'insight-1', player_id: 'player-1', windowStart: WINDOW_START, windowEnd: WINDOW_END },
    );

    expect(result).toEqual({ ok: true, multipleInterventions: false });
  });

  it('the exact windowStart boundary instant (first exposure === windowStart) counts — inclusive lower bound', async () => {
    const { client } = makeClient([{ insight_id: 'insight-2', shown_at: WINDOW_START }]);

    const result = await detectConfoundingInterventions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { insight_id: 'insight-1', player_id: 'player-1', windowStart: WINDOW_START, windowEnd: WINDOW_END },
    );

    expect(result).toEqual({ ok: true, multipleInterventions: true });
  });

  it('a query error returns a typed failure — never silently reads as "no confounder found"', async () => {
    const { client } = makeClient([], { error: { message: 'connection reset' } });

    const result = await detectConfoundingInterventions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { insight_id: 'insight-1', player_id: 'player-1', windowStart: WINDOW_START, windowEnd: WINDOW_END },
    );

    expect(result).toEqual({ ok: false, error: 'connection reset' });
  });

  it('pagination: an insight whose confounding first-exposure row sorts past the first page is still found (proves fetchAllRowsResult pagination actually runs, not just an unused import)', async () => {
    // 1,000 rows for a spammy insight-2 (all before the window, so none of
    // THESE individually confound), plus insight-3's single confounding row
    // sorting after all of them (insight_id 'insight-3' > 'insight-2').
    const spammyRows: Row[] = Array.from({ length: 1000 }, (_, i) => ({
      insight_id: 'insight-2',
      shown_at: new Date(2026, 6, 1, 0, 0, i).toISOString(),
    }));
    const confoundingRow: Row = { insight_id: 'insight-3', shown_at: '2026-08-10T00:00:00.000Z' };
    const { client } = makeClient([...spammyRows, confoundingRow]);

    const result = await detectConfoundingInterventions(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { insight_id: 'insight-1', player_id: 'player-1', windowStart: WINDOW_START, windowEnd: WINDOW_END },
    );

    expect(result).toEqual({ ok: true, multipleInterventions: true });
  });
});
