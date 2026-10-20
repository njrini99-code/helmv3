/**
 * The reads a live focus area came from (CoachHelm Slice 0 fold: such a read
 * never folds). Synthetic ids only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/coachhelm/best-effort-miss', () => ({
  logBestEffortMiss: vi.fn().mockResolvedValue(undefined),
}));

import { logBestEffortMiss } from '@/lib/coachhelm/best-effort-miss';
import { ID_CHUNK_SIZE } from '@/lib/supabase/chunk-ids';
import { LIVE_FOCUS_STATUSES, loadPinnedReadIds } from '../pinned-reads';

type Result = { data: Array<{ from_insight_id: string | null }> | null; error: { message: string } | null };

/** A client whose every focus-area request answers the next queued result, recording its filters. */
function makeClient(results: Result[]) {
  const calls: Array<{ table: string; filters: unknown[][] }> = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] as unknown[][] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'in', 'not']) {
      b[m] = (...args: unknown[]) => {
        call.filters.push([m, ...args]);
        return b;
      };
    }
    const result = results.shift() ?? { data: [], error: null };
    b.then = (resolve: (v: Result) => void) => Promise.resolve(resolve(result));
    return b;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

beforeEach(() => {
  vi.mocked(logBestEffortMiss).mockClear();
});

describe('loadPinnedReadIds', () => {
  it('returns the source reads of the players\' live focus areas', async () => {
    const { client, calls } = makeClient([
      { data: [{ from_insight_id: 'i-1' }, { from_insight_id: null }, { from_insight_id: 'i-2' }], error: null },
    ]);
    const out = await loadPinnedReadIds(client, ['p-1', 'p-2', 'p-1']);
    expect([...out].sort()).toEqual(['i-1', 'i-2']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.table).toBe('golf_player_focus_areas');
    expect(calls[0]!.filters).toContainEqual(['in', 'player_id', ['p-1', 'p-2']]);
    expect(calls[0]!.filters).toContainEqual(['in', 'status', [...LIVE_FOCUS_STATUSES]]);
    expect(calls[0]!.filters).toContainEqual(['not', 'from_insight_id', 'is', null]);
  });

  it('splits a long player list into URL-safe chunks', async () => {
    const players = Array.from({ length: ID_CHUNK_SIZE + 5 }, (_, i) => `p-${i}`);
    const { client, calls } = makeClient([
      { data: [{ from_insight_id: 'a' }], error: null },
      { data: [{ from_insight_id: 'b' }], error: null },
    ]);
    const out = await loadPinnedReadIds(client, players);
    expect(calls).toHaveLength(2);
    expect([...out].sort()).toEqual(['a', 'b']);
  });

  it('no players: no request', async () => {
    const { client, calls } = makeClient([]);
    expect((await loadPinnedReadIds(client, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('a failed read logs one best-effort miss and pins nothing', async () => {
    const { client } = makeClient([{ data: null, error: { message: 'boom' } }]);
    const out = await loadPinnedReadIds(client, ['p-1']);
    expect(out.size).toBe(0);
    expect(vi.mocked(logBestEffortMiss)).toHaveBeenCalledTimes(1);
  });
});
