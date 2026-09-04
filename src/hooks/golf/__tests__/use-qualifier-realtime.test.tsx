/**
 * useQualifierRealtime — realtime reconnect recovery for the live qualifier
 * leaderboard.
 *
 * A qualifying round is read WHILE it is being played. The hook subscribes to
 * `golf_qualifier_entries`, `golf_rounds` and `golf_qualifiers` and refetches
 * whenever a payload arrives — but `postgres_changes` delivers nothing that
 * happened while the socket was down, and supabase-js resumes from "now", not
 * from the gap. So a dropped transport (mobile handover, a backgrounded tab, a
 * Realtime blip — the same CHANNEL_ERROR class Sentry JAVASCRIPT-NEXTJS-RJ
 * captured on the calendar) left this leaderboard frozen on pre-drop scores
 * for the rest of the session.
 *
 * That failure is invisible by construction: a stale leaderboard renders
 * exactly like a correct one where nobody has posted since. The calendar was
 * given `hasSubscribedBefore` recovery and #1822 locked it down; this hook —
 * the surface where the staleness costs the most — had neither.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQualifierRealtime } from '../use-qualifier-realtime';

/** Every `from(<table>)` this hook issued, in order — the refetch counter. */
const tableLog: string[] = [];
/** The status callback observeRealtimeChannel registered, so a test can drive
 *  a real SUBSCRIBED -> CHANNEL_ERROR -> SUBSCRIBED reconnect by hand. */
let capturedStatusCb: ((status: string, err?: Error) => void) | null = null;

const QUALIFIER_ROW = {
  id: 'q-1',
  team_id: 'team-1',
  name: 'Fall Qualifying',
  num_rounds: 3,
  start_date: '2026-09-01',
  status: 'active',
  course: { id: 'c-1', par: 72 },
};

const ENTRY_ROWS = [
  {
    id: 'e-1',
    qualifier_id: 'q-1',
    player_id: 'p-1',
    position: 1,
    score: null,
    status: 'active',
    notes: null,
    round_id: null,
    created_at: null,
    updated_at: null,
    player: { id: 'p-1', first_name: 'Dana', last_name: 'Reyes' },
  },
];

function resultFor(table: string): { data: unknown; error: null } {
  if (table === 'golf_qualifiers') return { data: QUALIFIER_ROW, error: null };
  if (table === 'golf_qualifier_entries') return { data: ENTRY_ROWS, error: null };
  return { data: [], error: null }; // golf_rounds
}

/** Chainable and thenable: `.single()` for the qualifier read, plain `await`
 *  for the entries/rounds reads. */
function makeChain(table: string) {
  const result = resultFor(table);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    single: async () => result,
    then: (
      onFulfilled: (v: { data: unknown; error: null }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      tableLog.push(table);
      return makeChain(table);
    },
    channel: () => {
      const channelStub: Record<string, unknown> = {
        on: () => channelStub,
        subscribe: (cb?: (status: string, err?: Error) => void) => {
          if (cb) capturedStatusCb = cb;
          return channelStub;
        },
      };
      return channelStub;
    },
    removeChannel: () => undefined,
  }),
}));

/** How many times the hook has loaded the leaderboard from the server. */
const fetchCount = () => tableLog.filter((t) => t === 'golf_qualifiers').length;

describe('useQualifierRealtime — realtime reconnect recovers what the socket missed', () => {
  beforeEach(() => {
    tableLog.length = 0;
    capturedStatusCb = null;
  });

  it('refetches on reconnect, and NOT on the first subscribe', async () => {
    const { result } = renderHook(() => useQualifierRealtime('q-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchCount()).toBe(1);

    // If this is null the hook stopped subscribing at all, which would make
    // every assertion below vacuously pass.
    expect(capturedStatusCb).not.toBeNull();

    // Initial connect. The effect above already loaded this data, so
    // refetching here would be a wasted round trip on every mount.
    await act(async () => {
      capturedStatusCb!('SUBSCRIBED');
    });
    expect(fetchCount()).toBe(1);

    // The transport drops. Nothing is delivered while it is down.
    await act(async () => {
      capturedStatusCb!('CHANNEL_ERROR');
    });
    expect(fetchCount()).toBe(1);

    // supabase-js reconnects. Any score posted during the gap exists only on
    // the server, so the refetch is what makes the drop harmless.
    await act(async () => {
      capturedStatusCb!('SUBSCRIBED');
    });
    await waitFor(() => expect(fetchCount()).toBe(2));
  });

  it('refetches again on a second reconnect — recovery is not once-only', async () => {
    const { result } = renderHook(() => useQualifierRealtime('q-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      capturedStatusCb!('SUBSCRIBED');
    });
    await act(async () => {
      capturedStatusCb!('CHANNEL_ERROR');
      capturedStatusCb!('SUBSCRIBED');
    });
    await waitFor(() => expect(fetchCount()).toBe(2));

    await act(async () => {
      capturedStatusCb!('TIMED_OUT');
      capturedStatusCb!('SUBSCRIBED');
    });
    await waitFor(() => expect(fetchCount()).toBe(3));
  });

  it('a non-SUBSCRIBED status never triggers a refetch on its own', async () => {
    const { result } = renderHook(() => useQualifierRealtime('q-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      capturedStatusCb!('CHANNEL_ERROR');
      capturedStatusCb!('TIMED_OUT');
      capturedStatusCb!('CLOSED');
    });
    expect(fetchCount()).toBe(1);
  });
});
