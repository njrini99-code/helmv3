import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/calendar/events: a player receives a meeting only when they are
 * invited to it (their own attendance row), the same rule as the calendar
 * page. golf_events_select_team returns every team meeting to a player until
 * migration 20261018120000 lands. A coach's response is unchanged; a failed
 * invite read returns no meetings.
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
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, gte: self, lte: self, order: self, limit: self,
    maybeSingle: async () => settle(),
    single: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'x@y.edu' } }, error: null }) },
    from: (table: string) => tableChain(table),
  }),
}));

const TEAM_EVENTS = [
  { id: 'practice', event_type: 'practice', description: null, title: 'Team practice' },
  { id: 'one-on-one', event_type: 'meeting', description: null, title: '1:1 with Sam' },
  { id: 'captains', event_type: 'meeting', description: null, title: 'Captains' },
];

async function getIds() {
  const { GET } = await import('@/app/api/calendar/events/route');
  const res = await GET(new Request('https://helmsportslabs.com/api/calendar/events'));
  return ((await res.json()) as Array<{ id: string }>).map((e) => e.id);
}

function asPlayer() {
  outcomes.set('golf_coaches', ok(null));
  outcomes.set('golf_players', ok({ id: 'p1' }));
  outcomes.set('golf_team_members', ok({ team_id: 'team-1' }));
  outcomes.set('golf_events', ok(TEAM_EVENTS));
  outcomes.set('golf_event_attendance', ok([{ event_id: 'captains', player_id: 'p1' }]));
}

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  tablesRead.length = 0;
});

describe('GET /api/calendar/events: meetings are for their invitees', () => {
  it('drops a meeting the player is not invited to', async () => {
    asPlayer();
    expect(await getIds()).toEqual(['practice', 'captains']);
  });

  it('returns no meeting to the player when the invite read fails, and logs it', async () => {
    asPlayer();
    outcomes.set('golf_event_attendance', { data: null, error: { message: 'timeout', code: '57014' } });
    expect(await getIds()).toEqual(['practice']);
    expect(logServerError.mock.calls.some((c) => /meeting is hidden/.test(String(c[0])))).toBe(true);
  });

  it("leaves a coach's response unchanged", async () => {
    outcomes.set('golf_coaches', ok({ organization_id: 'org1' }));
    outcomes.set('golf_teams', ok({ id: 'team-1' }));
    outcomes.set('golf_events', ok(TEAM_EVENTS));
    expect(await getIds()).toEqual(['practice', 'one-on-one', 'captains']);
    expect(tablesRead).not.toContain('golf_event_attendance');
  });
});
