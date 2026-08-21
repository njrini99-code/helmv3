import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * checkScheduleConflicts — the scope gate must speak the same ID LANGUAGE as
 * its callers.
 *
 * Bridge, 2026-08-20 19:03Z: the Guilford HEAD COACH was told "Not authorized
 * to check availability for these people" about his own roster. Root cause:
 * the client sends golf_players TABLE ids (the calendar page selects
 * `golf_players(id, …)` and the conflict library filters
 * `golf_players .in('id', attendeeIds)`), but `resolveSharedScheduleScope` —
 * added in that morning's authz sweep — built its allow-set out of AUTH USER
 * ids. A player id never equals a user id, so every conflict check with at
 * least one attendee was denied, for every coach, from the moment the gate
 * shipped. One coach used the feature that day; his denial was the only
 * evidence.
 *
 * These tests pin the contract at the id-kind level: a coach checking players
 * ON their staffed team's roster passes; a player id from another program is
 * denied; a failed roster read says RETRY, not denied.
 */

const TEAM = '11111111-1111-4111-8111-111111111111';
const COACH_USER = 'ben-user';
const ROSTER_PLAYER = 'player-row-aaaa';
const FOREIGN_PLAYER = 'player-row-zzzz';

const state = {
  staffTeamsError: null as { message: string } | null,
  membersError: null as { message: string } | null,
};

function chain(table: string) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: (col: string, _vals: unknown[]) => {
      void col;
      return node;
    },
    then: (res: (v: unknown) => unknown) => {
      let out: unknown;
      if (table === 'golf_coaches') out = { data: [{ id: 'ben-coach' }], error: null };
      else if (table === 'golf_players') out = { data: [], error: null };
      else if (table === 'golf_team_coach_staff')
        out = state.staffTeamsError
          ? { data: null, error: state.staffTeamsError }
          : { data: [{ team_id: TEAM }], error: null };
      else if (table === 'golf_team_members')
        out = state.membersError
          ? { data: null, error: state.membersError }
          : { data: [{ team_id: TEAM, player_id: ROSTER_PLAYER }], error: null };
      else out = { data: [], error: null };
      return Promise.resolve(out).then(res);
    },
  });
  return node;
}

const supabase = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: COACH_USER } } })) },
  from: vi.fn((t: string) => chain(t)),
};

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => supabase) }));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/calendar/conflicts', () => ({
  checkEventConflicts: vi.fn(async () => ({ hasConflicts: false, conflicts: [], suggestedTimes: [] })),
}));

const { checkScheduleConflicts } = await import('../golf');

beforeEach(() => {
  state.staffTeamsError = null;
  state.membersError = null;
});

const check = (ids: string[]) =>
  checkScheduleConflicts('2026-08-21', '09:00', '2026-08-21', '11:00', ids);

describe('checkScheduleConflicts — scope gate id-kind contract', () => {
  it('lets a coach check PLAYER-TABLE ids from their own roster', async () => {
    // THE REGRESSION. Under the user-id allow-set this returned the denial the
    // Guilford head coach saw about his own players.
    const result = await check([ROSTER_PLAYER]);
    expect(result.success).toBe(true);
  });

  it('still denies a player id from outside the caller\'s teams', async () => {
    // The gate exists for a reason: conflict results leak names, avatars and
    // busy-titles. A foreign id must stay denied.
    const result = await check([FOREIGN_PLAYER]);
    // Narrow the discriminated union before reading `.error` — tsc checks
    // tests in this repo, and expect() narrows nothing for the compiler.
    if (result.success) throw new Error('expected a denial');
    expect(String(result.error)).toMatch(/not authorized/i);
  });

  it('answers RETRY, not denial, when the roster read fails', async () => {
    state.membersError = { message: 'statement timeout' };
    const result = await check([ROSTER_PLAYER]);
    if (result.success) throw new Error('expected a retry answer');
    expect(String(result.error)).toMatch(/try again/i);
    expect(String(result.error)).not.toMatch(/not authorized/i);
  });
});
