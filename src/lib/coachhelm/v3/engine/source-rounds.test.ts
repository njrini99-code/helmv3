import { describe, expect, it, vi } from 'vitest';
import { composedSourceRoundIds, keepComposedRounds, loadSourceRoundIds, windowDateBounds } from './source-rounds';
import { applyWindowStamp, stampFromIds, type WindowRoundRow } from './read-window';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

function fakeClient(rows: Array<{ id: string }>, error: unknown = null) {
  const calls: Record<string, unknown[]> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'lte', 'order']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return chain;
    });
  }
  chain.limit = vi.fn(async () => ({ data: rows, error }));
  return { client: { from: vi.fn(() => chain) } as never, calls };
}

describe('source round provenance (audit row 22)', () => {
  it('turns an ISO window into date bounds and rejects bad windows', () => {
    expect(windowDateBounds('2026-06-01T00:00:00Z', '2026-09-01T12:00:00Z')).toEqual({
      from: '2026-06-01',
      to: '2026-09-01',
    });
    expect(windowDateBounds(null, '2026-09-01')).toBeNull();
    expect(windowDateBounds('2026-09-02', '2026-09-01')).toBeNull();
  });

  it('loads completed non-test round ids inside the window', async () => {
    const { client, calls } = fakeClient([{ id: 'r2' }, { id: 'r1' }]);
    const ids = await loadSourceRoundIds(client, 'p-1', '2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z');
    expect(ids).toEqual(['r2', 'r1']);
    expect(calls.eq).toEqual([['player_id', 'p-1'], ['status', 'completed'], ['is_test', false]]);
  });

  it('returns null on a query error instead of throwing', async () => {
    const { client } = fakeClient([], { message: 'boom' });
    expect(await loadSourceRoundIds(client, 'p-2', '2026-04-01', '2026-04-30')).toBeNull();
  });

  it('keeps a generator-composed list (the rounds it counted) and ignores anything else', () => {
    expect(composedSourceRoundIds({ source_round_ids: ['r3', 'r2'] })).toEqual(['r3', 'r2']);
    expect(composedSourceRoundIds({ source_round_ids: [] })).toBeNull();
    expect(composedSourceRoundIds({ source_round_ids: [1, 2] })).toBeNull();
    expect(composedSourceRoundIds({})).toBeNull();
    expect(composedSourceRoundIds(null)).toBeNull();
  });
});

describe('keepComposedRounds (composed rounds survive the Slice 0b stamp)', () => {
  /** Two rounds on the same day: the stamp breaks the tie by created_at, the angle by id. */
  const index: WindowRoundRow[] = [
    { id: 'r1', round_date: '2026-03-01', created_at: '2026-03-01T09:00:00Z', holes_played: 18, total_score: 74, front_nine: 37, back_nine: 37, total_putts: 31 },
    { id: 'r2', round_date: '2026-03-08', created_at: '2026-03-08T16:00:00Z', holes_played: 18, total_score: 75, front_nine: 38, back_nine: 37, total_putts: 32 },
    { id: 'r3', round_date: '2026-03-08', created_at: '2026-03-08T08:00:00Z', holes_played: 18, total_score: 73, front_nine: 36, back_nine: 37, total_putts: 30 },
    // Not countable: the stamp's rounds_n leaves it out, the angle never read it.
    { id: 'r4', round_date: '2026-03-09', created_at: null, holes_played: 4, total_score: 16, front_nine: null, back_nine: null, total_putts: null },
  ];
  const composed = {
    metric: 'three_putts_per_18',
    sample_n: 54,
    window_start: '2026-03-01',
    window_end: '2026-03-08',
    window_days: 8,
    // The angle's own count and order (newest first by date, then id).
    source_round_ids: ['r3', 'r2', 'r1'],
    rounds_n: 3,
    newest_round_id: 'r3',
    sample_unit: 'holes',
  } as unknown as InsightEvidence;

  it('the stamp alone overwrites the composed fields (why this helper exists)', () => {
    const stamped = applyWindowStamp(composed, stampFromIds(index, ['r1', 'r2', 'r3', 'r4']), null);
    expect(stamped.newest_round_id).toBe('r4');
    expect(stamped.source_round_ids).toEqual(['r4', 'r2', 'r3', 'r1']);
  });

  it('keeps the composed source_round_ids, rounds_n and newest_round_id, and the stamp\'s other fields', () => {
    const scanned = { newest: index[3]!, newestCountable: index[1]! };
    const stamped = applyWindowStamp(composed, stampFromIds(index, ['r1', 'r2', 'r3', 'r4']), null, scanned);
    const kept = keepComposedRounds(stamped, composed);
    expect(kept.source_round_ids).toEqual(['r3', 'r2', 'r1']);
    expect(kept.rounds_n).toBe(3);
    expect(kept.newest_round_id).toBe('r3');
    expect(kept.source_round_ids!.length).toBe(kept.rounds_n);
    expect(kept.scanned_through_round_id).toBe('r2');
    expect(kept.sample_unit).toBe('holes');
  });

  it('leaves a read with no composed list exactly as stamped', () => {
    const plain = { ...composed, source_round_ids: undefined, rounds_n: undefined, newest_round_id: undefined } as unknown as InsightEvidence;
    const stamped = applyWindowStamp(plain, stampFromIds(index, ['r1', 'r2']), null);
    expect(keepComposedRounds(stamped, plain)).toEqual(stamped);
  });
});
