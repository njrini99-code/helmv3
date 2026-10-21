/**
 * useCalendarRangeEvents fetches scrolled-to months from the BROWSER, and
 * golf_events_select_team hands a player every team meeting until migration
 * 20261018120000 lands. Filtering after the fetch would still ship a 1:1's
 * title to DevTools, so the QUERY asks only for the meetings this player has
 * their own attendance row on. A failed invite read is a retryable range
 * error, never a calendar with teammates' meetings on it. A coach's query is
 * unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCalendarRangeEvents } from '../use-calendar-range-events';

interface QueryRecord {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}

const queryLog: QueryRecord[] = [];
const results = new Map<string, { data: unknown[] | null; error: { message: string } | null }>();

function makeChain(record: QueryRecord) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'or', 'gte', 'lte', 'order', 'limit', 'range', 'abortSignal']) {
    chain[method] = (...args: unknown[]) => {
      record.calls.push({ method, args });
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(results.get(record.table) ?? { data: [], error: null });
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const record: QueryRecord = { table, calls: [] };
      queryLog.push(record);
      return makeChain(record);
    },
    channel: () => {
      const stub = { on: () => stub, subscribe: () => stub };
      return stub;
    },
    removeChannel: () => undefined,
  }),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const FAR = NOW + 150 * DAY_MS; // outside the ±90d server window, so it fetches

function render(viewer: { isCoach: boolean; playerId: string | null }) {
  return renderHook(() =>
    useCalendarRangeEvents({
      teamId: 'team-1',
      initialEvents: [],
      visibleStart: new Date(FAR),
      visibleEnd: new Date(FAR + 6 * DAY_MS),
      loadedStart: new Date(NOW - 90 * DAY_MS).toISOString(),
      loadedEnd: new Date(NOW + 90 * DAY_MS).toISOString(),
      viewer,
    }),
  );
}

const eventsQuery = () => queryLog.find((q) => q.table === 'golf_events');
const callsOf = (record: QueryRecord | undefined, method: string) =>
  (record?.calls ?? []).filter((c) => c.method === method).map((c) => c.args);

beforeEach(() => {
  queryLog.length = 0;
  results.clear();
});

describe('useCalendarRangeEvents: meetings stay off a player\'s wire unless they are invited', () => {
  it("asks only for the player's own meetings, read from their attendance rows in the window", async () => {
    results.set('golf_event_attendance', { data: [{ event_id: 'captains' }], error: null });
    render({ isCoach: false, playerId: 'p1' });
    await waitFor(() => expect(eventsQuery()).toBeDefined());

    const invites = queryLog.find((q) => q.table === 'golf_event_attendance');
    expect(callsOf(invites, 'eq')).toEqual(
      expect.arrayContaining([['player_id', 'p1'], ['event.team_id', 'team-1'], ['event.event_type', 'meeting']]),
    );
    expect(callsOf(eventsQuery(), 'or').map((a) => String(a[0]))).toContain('event_type.neq.meeting,id.in.(captains)');
  });

  it('asks for no meeting at all when the player is invited to none', async () => {
    render({ isCoach: false, playerId: 'p1' });
    await waitFor(() => expect(eventsQuery()).toBeDefined());
    expect(callsOf(eventsQuery(), 'neq')).toContainEqual(['event_type', 'meeting']);
  });

  it('reports a retryable range error, and fetches no events, when the invite read fails', async () => {
    results.set('golf_event_attendance', { data: null, error: { message: 'timeout' } });
    const { result } = render({ isCoach: false, playerId: 'p1' });
    await waitFor(() => expect(result.current.rangeError).toBe('Could not load events for this date range.'));
    expect(eventsQuery()).toBeUndefined();
  });

  it("leaves the coach's query unchanged", async () => {
    render({ isCoach: true, playerId: null });
    await waitFor(() => expect(eventsQuery()).toBeDefined());
    expect(queryLog.some((q) => q.table === 'golf_event_attendance')).toBe(false);
    expect(callsOf(eventsQuery(), 'or')).toEqual([]);
    expect(callsOf(eventsQuery(), 'neq')).toEqual([]);
  });
});
