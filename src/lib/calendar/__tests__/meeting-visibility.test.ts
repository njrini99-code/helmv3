import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The meeting rule every Fairway player read shares (meeting-visibility.ts,
 * meeting-invites.ts): a player sees a meeting only when they have their own
 * attendance row on it; every other event passes; a failed invite read hides
 * every meeting.
 */

const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async (..._args: unknown[]) => {}) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));

import { hideUninvitedMeetings, isMeetingEvent } from '../meeting-visibility';
import { filterMeetingsForPlayer, loadInvitedMeetingIds } from '../meeting-invites';

type Row = { event_id: string; player_id: string };

function attendanceClient(result: { data: Row[] | null; error: { message: string } | null }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'limit']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const from = vi.fn((table: string) => {
    calls.push(['from', table]);
    return chain;
  });
  return { client: { from } as never, from, calls };
}

const EVENTS = [
  { id: 'practice', event_type: 'practice', title: 'Practice' },
  { id: 'one-on-one', event_type: 'meeting', title: '1:1 with Sam' },
  { id: 'captains', event_type: 'meeting', title: 'Captains' },
  { id: 'class', event_type: 'class', title: 'BIO 101' },
];

beforeEach(() => logServerError.mockClear());

describe('hideUninvitedMeetings', () => {
  it('keeps every non-meeting event and only the meetings in the invited set', () => {
    expect(hideUninvitedMeetings(EVENTS, new Set(['captains'])).map((e) => e.id)).toEqual(['practice', 'captains', 'class']);
  });

  it('drops every meeting when the invite read failed (null)', () => {
    expect(hideUninvitedMeetings(EVENTS, null).map((e) => e.id)).toEqual(['practice', 'class']);
  });

  it('treats only event_type "meeting" as a meeting', () => {
    expect(isMeetingEvent({ event_type: 'meeting' })).toBe(true);
    expect(isMeetingEvent({ event_type: 'practice' })).toBe(false);
    expect(isMeetingEvent({ event_type: null })).toBe(false);
  });
});

describe('loadInvitedMeetingIds', () => {
  it("reads the player's own rows for those meetings only, and ignores a teammate's row", async () => {
    const { client, calls } = attendanceClient({
      data: [
        { event_id: 'captains', player_id: 'p1' },
        { event_id: 'one-on-one', player_id: 'teammate' },
      ],
      error: null,
    });
    const invited = await loadInvitedMeetingIds(client, 'p1', ['one-on-one', 'captains'], { action: 't' });
    expect([...(invited ?? [])]).toEqual(['captains']);
    expect(calls).toContainEqual(['from', 'golf_event_attendance']);
    expect(calls).toContainEqual(['eq', 'player_id', 'p1']);
    expect(calls).toContainEqual(['in', 'event_id', ['one-on-one', 'captains']]);
  });

  it('returns null and logs when the read fails', async () => {
    const { client } = attendanceClient({ data: null, error: { message: 'timeout' } });
    expect(await loadInvitedMeetingIds(client, 'p1', ['captains'], { action: 'golf.test' })).toBeNull();
    expect(logServerError).toHaveBeenCalledTimes(1);
    expect(logServerError.mock.calls[0]).toEqual([
      expect.stringContaining('every meeting is hidden'),
      expect.objectContaining({ action: 'golf.test', playerId: 'p1' }),
      'warning',
    ]);
  });
});

describe('filterMeetingsForPlayer', () => {
  it('reads nothing when there is no meeting in the list', async () => {
    const { client, from } = attendanceClient({ data: [], error: null });
    const out = await filterMeetingsForPlayer(client, [EVENTS[0]!, EVENTS[3]!], 'p1', { action: 't' });
    expect(out.map((e) => e.id)).toEqual(['practice', 'class']);
    expect(from).not.toHaveBeenCalled();
  });

  it('hides a meeting nobody invited this player to', async () => {
    const { client } = attendanceClient({ data: [{ event_id: 'captains', player_id: 'p1' }], error: null });
    const out = await filterMeetingsForPlayer(client, EVENTS, 'p1', { action: 't' });
    expect(out.map((e) => e.title)).toEqual(['Practice', 'Captains', 'BIO 101']);
  });

  it('hides every meeting when the invite read fails', async () => {
    const { client } = attendanceClient({ data: null, error: { message: 'down' } });
    const out = await filterMeetingsForPlayer(client, EVENTS, 'p1', { action: 't' });
    expect(out.map((e) => e.id)).toEqual(['practice', 'class']);
  });

  it('hides every meeting when there is no player id', async () => {
    const { client, from } = attendanceClient({ data: [], error: null });
    const out = await filterMeetingsForPlayer(client, EVENTS, null, { action: 't' });
    expect(out.map((e) => e.id)).toEqual(['practice', 'class']);
    expect(from).not.toHaveBeenCalled();
  });
});
