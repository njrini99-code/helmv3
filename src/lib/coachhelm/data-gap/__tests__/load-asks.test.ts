import { beforeEach, describe, expect, it, vi } from 'vitest';

const isFlagEnabled = vi.fn((_id: string): boolean => false);
vi.mock('@/lib/flags', () => ({ isFlagEnabled: (id: string) => isFlagEnabled(id) }));
const logServerError = vi.fn();
vi.mock('@/lib/server-error-logger', () => ({ logServerError: (...a: unknown[]) => logServerError(...a) }));
const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }));

import { DATA_GAP_PROMPT_FLAG, dataGapAsksForShotEntry, loadDataGapAsks } from '../load-asks';

type Result = { data: unknown; error: { message: string } | null };

/** A chainable PostgREST stand-in: every filter returns itself, awaiting it
 *  answers the table's result, and every call is recorded. */
function fakeClient(results: Record<string, Result>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'or', 'in', 'neq', 'gt', 'order', 'limit']) {
        builder[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args });
          return builder;
        };
      }
      builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
      return builder;
    },
  };
  return { client, calls };
}

const gap = (min: number, max: number | null, target = 10, have = 4) => ({
  field: 'miss_direction',
  shot_filter: { shot_type: 'putting', first_putt: true, distance_feet: [min, max], holed: false },
  target_count: target,
  have_count: have,
  prompt: 'Which side? Short · Long · High · Low',
});

const putt = (round_id: string, hole_number: number, shot_number: number, feet: number, miss: string | null, holed = false) => ({
  round_id,
  hole_number,
  shot_number,
  shot_type: 'putting',
  is_penalty: false,
  distance_to_hole_before: feet,
  distance_unit_before: 'feet',
  result: holed ? 'hole' : 'green',
  putt_made: holed,
  miss_direction: miss,
});

beforeEach(() => {
  isFlagEnabled.mockReset().mockReturnValue(false);
  logServerError.mockReset();
  createClient.mockReset();
});

describe('loadDataGapAsks', () => {
  it('flag off: reads nothing and asks nothing', async () => {
    const { client, calls } = fakeClient({});
    await expect(loadDataGapAsks(client as never, 'p1')).resolves.toEqual([]);
    expect(isFlagEnabled).toHaveBeenCalledWith(DATA_GAP_PROMPT_FLAG);
    expect(calls).toHaveLength(0);
  });

  it('reads the player own visible reads and counts tags in rounds after each window', async () => {
    const { client, calls } = fakeClient({
      golf_coach_insights: {
        data: [
          { id: 'r1', title: 'Putts from 5–10 ft', evidence: { data_gap: gap(5, 10), window_end: '2026-10-01' } },
          // Not a gap this slice asks: ignored.
          { id: 'r2', title: 'Approach', evidence: { data_gap: { ...gap(5, 10), shot_filter: { shot_type: 'approach' } } } },
        ],
        error: null,
      },
      golf_rounds: { data: [{ id: 'new', round_date: '2026-10-05' }], error: null },
      golf_shots: {
        data: [
          putt('new', 1, 3, 7, 'short'), // first putt, in band, tagged: counts
          putt('new', 1, 4, 1, null, true),
          putt('new', 2, 2, 8, null), // in band, untagged: does not count
          putt('new', 3, 2, 20, 'long'), // out of band
          putt('new', 4, 2, 6, 'low', true), // holed: not a failure
        ],
        error: null,
      },
    });
    const asks = await loadDataGapAsks(client as never, 'p1', { flagEnabled: true });
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ readId: 'r1', targetCount: 10, haveCount: 4, taggedSince: 1, bandLabel: '5–10 ft' });

    const insightCalls = calls.filter((c) => c.table === 'golf_coach_insights');
    expect(insightCalls).toContainEqual({ table: 'golf_coach_insights', method: 'eq', args: ['player_id', 'p1'] });
    // The shared v3 visibility helper (engine, lifecycle, not dismissed).
    expect(insightCalls.some((c) => c.method === 'in' && c.args[0] === 'lifecycle_state')).toBe(true);
    expect(calls).toContainEqual({ table: 'golf_rounds', method: 'gt', args: ['round_date', '2026-10-01'] });
    expect(calls).toContainEqual({ table: 'golf_shots', method: 'in', args: ['round_id', ['new']] });
  });

  it('drops an ask already met since the read', async () => {
    const { client } = fakeClient({
      golf_coach_insights: {
        data: [{ id: 'r1', title: 't', evidence: { data_gap: gap(5, 10, 1, 4), window_end: '2026-10-01' } }],
        error: null,
      },
      golf_rounds: { data: [{ id: 'new', round_date: '2026-10-05' }], error: null },
      golf_shots: { data: [putt('new', 1, 3, 7, 'short')], error: null },
    });
    await expect(loadDataGapAsks(client as never, 'p1', { flagEnabled: true })).resolves.toEqual([]);
  });

  it.each(['golf_coach_insights', 'golf_rounds', 'golf_shots'])('a failed %s read is logged and asks nothing', async (table) => {
    const { client } = fakeClient({
      golf_coach_insights: {
        data: [{ id: 'r1', title: 't', evidence: { data_gap: gap(5, 10), window_end: '2026-10-01' } }],
        error: null,
      },
      golf_rounds: { data: [{ id: 'new', round_date: '2026-10-05' }], error: null },
      [table]: { data: null, error: { message: 'boom' } },
    });
    await expect(loadDataGapAsks(client as never, 'p1', { flagEnabled: true })).resolves.toEqual([]);
    expect(logServerError).toHaveBeenCalledTimes(1);
  });
});

describe('dataGapAsksForShotEntry', () => {
  it('flag off: undefined, and no client is made', async () => {
    await expect(dataGapAsksForShotEntry('p1')).resolves.toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('flag on: a throwing load answers [] and is logged', async () => {
    isFlagEnabled.mockReturnValue(true);
    createClient.mockRejectedValue(new Error('no cookies'));
    await expect(dataGapAsksForShotEntry('p1')).resolves.toEqual([]);
    expect(logServerError).toHaveBeenCalledTimes(1);
  });
});
