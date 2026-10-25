/**
 * Fairway's qualifier board counts completed rounds only. A round being played
 * writes its golf_rounds row on every auto-save, and each of those changes used
 * to re-read the whole board for every viewer. Only a change that can move the
 * standings re-reads it now, and a burst of them re-reads it once.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload: { new: unknown }) => void;

const h = vi.hoisted(() => ({
  handlers: [] as Array<{ table: string; event: string; handler: (payload: { new: unknown }) => void }>,
  reads: { golf_rounds: 0 } as Record<string, number>,
  rounds: [] as Array<Record<string, unknown>>,
}));

function query(table: string) {
  const result = () => {
    if (table === 'golf_qualifiers') {
      return { data: { id: 'q1', team_id: 't1', name: 'Fall', num_rounds: 2, status: 'active', course: null }, error: null };
    }
    if (table === 'golf_rounds') return { data: h.rounds, error: null };
    return { data: [], error: null };
  };
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => builder,
    then: (resolve: (value: unknown) => unknown) => {
      h.reads[table] = (h.reads[table] ?? 0) + 1;
      return Promise.resolve(result()).then(resolve);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => {
  const client = {
    from: (table: string) => query(table),
    channel: () => {
      const channel = {
        on: (_type: string, filter: { table: string; event: string }, handler: Handler) => {
          h.handlers.push({ table: filter.table, event: filter.event, handler });
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: () => undefined,
  };
  return { createClient: () => client };
});
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: <C,>(c: C) => c }));
vi.mock('@/lib/golf/player-profiles', () => ({
  readGolfPlayerProfiles: async () => ({ data: [], error: null }),
  profilesById: () => new Map(),
}));

import {
  QUALIFIER_REFETCH_COALESCE_MS,
  roundChangeMovesStandings,
  useQualifierRealtime,
} from '../use-qualifier-realtime';

function fire(table: string, event: string, row: unknown) {
  for (const entry of h.handlers) {
    if (entry.table === table && (entry.event === event || entry.event === '*')) entry.handler({ new: row });
  }
}

async function settle(ms = QUALIFIER_REFETCH_COALESCE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('roundChangeMovesStandings', () => {
  const counted = new Set(['r-done']);

  it('re-reads for a signed round and for a change to a counted round', () => {
    expect(roundChangeMovesStandings({ id: 'r-new', status: 'completed' }, counted)).toBe(true);
    expect(roundChangeMovesStandings({ id: 'r-done', status: 'in_progress' }, counted)).toBe(true);
  });

  it('ignores an in-progress round that was never counted', () => {
    expect(roundChangeMovesStandings({ id: 'r-live', status: 'in_progress' }, counted)).toBe(false);
  });

  it('re-reads when the change carries no row to judge', () => {
    expect(roundChangeMovesStandings(null, counted)).toBe(true);
  });
});

describe('useQualifierRealtime round changes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.handlers.length = 0;
    h.reads = { golf_rounds: 0 };
    h.rounds = [
      { id: 'r-done', player_id: 'p1', qualifier_round_number: 1, total_score: 72, score_to_par: 0, status: 'completed', is_test: false },
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not re-read the board for an in-progress round auto-save', async () => {
    renderHook(() => useQualifierRealtime('q1'));
    await settle(0);
    expect(h.reads.golf_rounds).toBe(1);

    fire('golf_rounds', 'UPDATE', { id: 'r-live', status: 'in_progress', qualifier_id: 'q1' });
    fire('golf_rounds', 'INSERT', { id: 'r-live-2', status: 'in_progress', qualifier_id: 'q1' });
    await settle();

    expect(h.reads.golf_rounds).toBe(1);
  });

  it('re-reads once for a burst of changes that move the standings', async () => {
    renderHook(() => useQualifierRealtime('q1'));
    await settle(0);

    fire('golf_rounds', 'UPDATE', { id: 'r-live', status: 'completed', qualifier_id: 'q1' });
    fire('golf_rounds', 'UPDATE', { id: 'r-live', status: 'completed', qualifier_id: 'q1' });
    fire('golf_qualifier_entries', '*', { id: 'e1' });
    await settle();

    expect(h.reads.golf_rounds).toBe(2);
  });

  it('re-reads when a counted round is reopened', async () => {
    renderHook(() => useQualifierRealtime('q1'));
    await settle(0);

    fire('golf_rounds', 'UPDATE', { id: 'r-done', status: 'in_progress', qualifier_id: 'q1' });
    await settle();

    expect(h.reads.golf_rounds).toBe(2);
  });

  it('drops a pending re-read when the board unmounts', async () => {
    const { unmount } = renderHook(() => useQualifierRealtime('q1'));
    await settle(0);

    fire('golf_rounds', 'UPDATE', { id: 'r-live', status: 'completed', qualifier_id: 'q1' });
    unmount();
    await settle();

    expect(h.reads.golf_rounds).toBe(1);
  });
});
