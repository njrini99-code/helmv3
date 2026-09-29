import { describe, expect, it, vi } from 'vitest';
import { loadSourceRoundIds, windowDateBounds } from './source-rounds';

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
});
