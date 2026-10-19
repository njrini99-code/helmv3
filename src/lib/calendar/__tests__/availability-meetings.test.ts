import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Busy periods (getUserBusyPeriodsWithStatus) feed a player's own busy overlay
 * (getCurrentUserBusyPeriods) and the conflict inbox, titles included. A team
 * meeting is busy time only for the players invited to it, and its title must
 * not reach a player who is not. A failed invite read drops the meetings and
 * marks the result partial, so nobody is told they are free on a read that
 * failed. A coach's own busy time is unchanged.
 */

const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async (..._args: unknown[]) => {}) }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const tablesRead: string[] = [];
const ok = (data: unknown): Outcome => ({ data, error: null });

function tableChain(table: string) {
  tablesRead.push(table);
  // The meeting-invite read is told apart from the accepted-events read (which
  // embeds the event) by its select, so each can succeed or fail on its own.
  let key = table;
  const settle = () => outcomes.get(key) ?? outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: (columns: string) => {
      if (table === 'golf_event_attendance' && !columns.includes('event:')) key = 'golf_event_attendance:invites';
      return node;
    },
    eq: self, in: self, not: self, or: self, is: self, neq: self, gt: self, lt: self,
    gte: self, lte: self, order: self, limit: self, range: self, filter: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const supabase = { from: (t: string) => tableChain(t) } as never;

const teamEvent = (id: string, event_type: string, title: string) => ({
  id, title, event_type, created_by: null, description: null, all_day: false,
  start_time: '2026-09-02T15:00:00Z', end_time: '2026-09-02T16:00:00Z',
});

async function busy() {
  const mod = await import('@/lib/calendar/availability');
  return mod.getUserBusyPeriodsWithStatus('user-1', new Date('2026-09-01T00:00:00Z'), new Date('2026-09-08T00:00:00Z'), supabase);
}

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  tablesRead.length = 0;
  outcomes.set('golf_players', ok({ id: 'p1', user_id: 'user-1' }));
  outcomes.set('golf_coaches', ok(null));
  outcomes.set('golf_team_members', ok([{ team_id: 't1' }]));
  outcomes.set('golf_events', ok([
    teamEvent('practice', 'practice', 'Team practice'),
    teamEvent('one-on-one', 'meeting', '1:1 with Sam'),
    teamEvent('captains', 'meeting', 'Captains'),
  ]));
  outcomes.set('golf_event_attendance', ok([]));
  outcomes.set('golf_event_attendance:invites', ok([{ event_id: 'captains', player_id: 'p1' }]));
});

describe("busy periods: a meeting is busy time only for its invitees", () => {
  it("leaves out a meeting the player is not invited to, title and all", async () => {
    const result = await busy();
    expect(result.periods.map((p) => p.title)).toEqual(['Team practice', 'Captains']);
    expect(result.partial).toBe(false);
  });

  it('drops every meeting and marks the result partial when the invite read fails', async () => {
    outcomes.set('golf_event_attendance:invites', { data: null, error: { message: 'timeout', code: '57014' } });
    const result = await busy();
    expect(result.periods.map((p) => p.title)).toEqual(['Team practice']);
    expect(result.partial).toBe(true);
    expect(logServerError.mock.calls.some((c) => /meeting is hidden/.test(String(c[0])))).toBe(true);
  });

  it("leaves a coach's own busy time unchanged", async () => {
    outcomes.set('golf_players', ok(null));
    outcomes.set('golf_coaches', ok({ id: 'c1', organization_id: 'o1' }));
    outcomes.set('golf_teams', ok([{ id: 't1' }]));
    const result = await busy();
    expect(result.periods.map((p) => p.title)).toEqual(['Team practice', '1:1 with Sam', 'Captains']);
  });
});
